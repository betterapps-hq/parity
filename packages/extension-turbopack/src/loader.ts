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
const load = (src) => new Promise((resolve, reject) => {
  const script = document.createElement("script")
  script.src = src
  script.onload = () => resolve()
  script.onerror = () => reject(new Error(\`\${src} didn't load\`))
  document.head.append(script)
})
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
