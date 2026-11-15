import { z } from "zod"

/*
 * The guest module the canvas imports, from what Turbopack built for the guest app. Turbopack writes no ES modules: its
 * browser output is chunks that register their modules with its runtime, and the page that loads them starts Next's
 * router, which would take over the canvas's page. So the builder serves a module of its own that loads Turbopack's
 * runtime with its start-up entries taken out, then the guest's chunks, then asks the runtime for the guest module by
 * its id (docs/proposals/nextjs-builders.md).
 */

/** What the guest page's runtime chunk registers first: the chunks its page starts with, and the modules it starts. */
const startup =
  /^\(globalThis\["TURBOPACK"\] \|\| \(globalThis\["TURBOPACK"\] = \[\]\)\)\.push\(\[\s*[^,]+,\s*(\{"otherChunks":.*?\})\s*\]\);/s

/** The start-up parameters' chunks, each its path, or an object with its path and what it holds. */
const startupParams = z.object({
  otherChunks: z.array(z.union([z.string(), z.object({ path: z.string() }).transform(({ path }) => path)]))
})

/** The chunks a runtime chunk's page starts with, by their paths from `_next/`: Next's client, React and the rest. */
export function runtimeChunks(runtime: string): string[] {
  const params = startup.exec(runtime)?.[1]
  const read = params === undefined ? undefined : startupParams.safeParse(JSON.parse(params))

  if (!read?.success) {
    throw new Error("Turbopack's runtime chunk doesn't start the way this Parity reads it")
  }

  return read.data.otherChunks
}

/**
 * What the runtime gives modules for React Refresh when Next's refresh runtime isn't running, as it isn't on the canvas:
 * a `signature()` whose function returns nothing, where a module's code keeps what it returns, as in
 * `component = _s(function OnDemand() { ... })`.
 */
const dummySignature = /signature:\s*\(\)\s*=>\s*\((\w+)\)\s*=>\s*\{\s*\}/

/**
 * A runtime chunk with its start-up registration taken out, so loading it sets up Turbopack's runtime and starts
 * nothing: not Next's router, which would hydrate the page it's loaded into. Without Next's refresh runtime, a refresh
 * signature gives back the component it's given, as Next's own does.
 */
export function withoutStartup(runtime: string): string {
  if (!startup.test(runtime)) {
    throw new Error("Turbopack's runtime chunk doesn't start the way this Parity reads it")
  }

  return runtime
    .replace(startup, '(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = []));')
    .replace(dummySignature, "signature: () => ($1) => $1")
}

/**
 * Lets a chunk loaded again, at an address stamped with a change (`?t=<stamp>`), bring its modules' new code (PAR-1159):
 * Turbopack's runtime keeps the first factory it's given for a module, so the project's modules in a stamped chunk are
 * forgotten, factory and instance, before it registers them. Packages' modules are kept, so React stays the one React.
 */
const refreshStampedSource = `// Next.js 16.4's runtime keeps modules in maps, and earlier ones in objects.
const forget = (store, id) => (store instanceof Map ? store.delete(id) : delete store[id])
const refreshStamped = (context) => {
  const registerChunk = globalThis.TURBOPACK.push
  const ours = (id) => typeof id === "string" && id.startsWith("[project]/") && !id.includes("/node_modules/")
  const stamped = (script) => {
    try {
      return new URL(typeof script === "string" ? script : script?.src ?? "", location.href).searchParams.has("t")
    } catch {
      return false
    }
  }
  globalThis.TURBOPACK.push = (registration) => {
    if (Array.isArray(registration) && stamped(registration[0])) {
      for (const id of registration.slice(1).filter(ours)) {
        forget(context.M, id)
        forget(context.c, id)
      }
    }
    return registerChunk(registration)
  }
}`

export interface GuestLoader {
  /** Names this builder's session, so a builder started again gets a runtime of its own in the same page. */
  session: string
  /** The runtime chunk without its start-up registration. */
  runtime: string
  /** The chunks to load before the guest module is asked for: the page's and the guest's own. */
  chunks: string[]
  /** The guest module's id in Turbopack's runtime. */
  id: string
  /** The project's global stylesheets, compiled. */
  styles: string[]
  /** Packages' global stylesheets, compiled. */
  packageStyles: string[]
  /** What the guest app's stylesheets start with: a stylesheet the runtime links that starts so is the guest's. */
  stylesheetBase: string
}

/**
 * The guest module's source. It loads the runtime once per page and session, makes the guest from what the guest
 * module's `guestParts()` imports, and passes on, as packages' CSS, the stylesheets the runtime linked into the page for
 * those modules (CSS modules, fonts), which it mutes in the page, so they don't style the page itself.
 */
export function guestLoaderSource(loader: GuestLoader): string {
  const json = (value: string | readonly string[]) => JSON.stringify(value)

  return `const sessions = (globalThis.__parityTurbopack ??= {})
const contexts = (globalThis.__parityTurbopackContexts ??= {})
const load = (src) => new Promise((resolve, reject) => {
  const script = document.createElement("script")
  script.src = src
  script.onload = () => resolve()
  script.onerror = () => reject(new Error(\`\${src} didn't load\`))
  document.head.append(script)
})
${refreshStampedSource}
// One runtime per page and session. Turbopack's runtime starts only on an empty list, so a builder started again, or
// another, starts its own; the one before goes on with the modules it has.
sessions[${json(loader.session)}] ??= (async () => {
  globalThis.TURBOPACK = []
  globalThis.TURBOPACK_CHUNK_LISTS = []
  await import(${json(loader.runtime)})
  await Promise.all(${json(loader.chunks)}.map(load))

  return new Promise((resolve, reject) => {
    globalThis.TURBOPACK.push(["parity/guest.js", "parity:guest", (context) => {
      try {
        contexts[${json(loader.session)}] = context
        refreshStamped(context)
        resolve(context.r(${json(loader.id)}))
      } catch (error) {
        reject(error)
      }
    }])
    globalThis.TURBOPACK.push({ otherChunks: [], runtimeModuleIds: ["parity:guest"] })
  })
})()
const guestModule = await sessions[${json(loader.session)}]
const { init, libraryCss, createGuest } = await guestModule.guestParts()
const ours = (link) => link.href.startsWith(${json(loader.stylesheetBase)})
// Kept in the page, as the runtime waits for them to load before a module that imports one runs, but styling nothing.
const mute = (link) => link.setAttribute("media", "not all")
const linked = [...document.querySelectorAll('link[rel="stylesheet"]')].filter(ours)
linked.forEach(mute)

// What modules loaded later link, as a lazy component's CSS module does, is muted too.
new MutationObserver((records) => {
  for (const node of records.flatMap((record) => [...record.addedNodes])) {
    if (node instanceof HTMLLinkElement && node.rel === "stylesheet" && ours(node)) {
      mute(node)
    }
  }
}).observe(document.head, { childList: true })
const text = (url) => fetch(url).then((response) => (response.ok ? response.text() : ""), () => "")
const joined = (urls) => Promise.all(urls.map(text)).then((texts) => texts.filter(Boolean).join("\\n"))
const [css, packageCss, componentCss] = await Promise.all([
  joined(${json(loader.styles)}),
  joined(${json(loader.packageStyles)}),
  joined(linked.map((link) => link.href))
])

export default createGuest({
  ...init,
  // Tokens libraries only create at run time come first, so the project's own declarations still win.
  css: [libraryCss, css].filter(Boolean).join("\\n"),
  packageCss: [packageCss, componentCss].filter(Boolean).join("\\n")
})
`
}

/** One of the project's modules, as the builder serves it for the canvas to load on its own (PAR-1159). */
export interface ModuleLoader {
  /** The builder's session, whose runtime the guest loaded. */
  session: string
  /** The client module that imports the project's module whole: its id in Turbopack's runtime. */
  id: string
  /** The chunks that hold it and what it imports. */
  chunks: string[]
  /** The stylesheets Next links for its page: its CSS modules'. */
  stylesheets: string[]
  /** What the module exports, by name. */
  names: string[]
  /** The change it's loaded again after, whose stamp its chunks are loaded at, so they bring their new code. */
  stamp?: number
}

/**
 * The module's source: it loads the module's chunks into the guest's runtime, at addresses stamped with the change when
 * it's loaded again, links its stylesheets (which the guest mutes, as it does the other modules'), and gives what the
 * project's module exports.
 */
export function moduleLoaderSource(loader: ModuleLoader): string {
  const json = (value: string | readonly string[]) => JSON.stringify(value)

  const at = (url: string) =>
    loader.stamp === undefined ? url : `${url}${url.includes("?") ? "&" : "?"}t=${loader.stamp}`

  const names = [...new Set(loader.names)]

  const exported = names.map((name, index) =>
    name === "default"
      ? "export default projectModule.default"
      : `const export${index} = projectModule[${json(name)}]
export { export${index} as ${json(name)} }`
  )

  return `const context = globalThis.__parityTurbopackContexts?.[${json(loader.session)}]
const forget = (store, id) => (store instanceof Map ? store.delete(id) : delete store[id])

if (!context) {
  throw new Error("The guest's Turbopack runtime isn't loaded in this page")
}

const load = (src) => new Promise((resolve, reject) => {
  const script = document.createElement("script")
  script.src = src
  script.onload = () => resolve()
  script.onerror = () => reject(new Error(\`\${src} didn't load\`))
  document.head.append(script)
})

for (const href of ${json(loader.stylesheets.map(at))}) {
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = href
  document.head.append(link)
}

await Promise.all(${json(loader.chunks.map(at))}.map(load))
// The client module is made again, so it imports the project's module as it is now.
forget(context.c, ${json(loader.id)})
const projectModule = context.r(${json(loader.id)}).parityModule
${exported.join("\n")}
`
}
