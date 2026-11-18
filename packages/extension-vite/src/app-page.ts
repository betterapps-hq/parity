import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http"
import { createRequire } from "node:module"
import { dirname } from "node:path"
import type { PageModules, PageWrapFile } from "@parity-app/core"
import { pageEntrySource } from "@parity-app/project"
import type * as Vite from "vite"

/** The page entry: the page runtime and the page modules (`pageEntrySource`), served by the guest's own server. */
export const pageEntryId = "virtual:parity/page"

/**
 * Puts the page runtime first in the app's own page, served by the guest's development server alone (PAR-1260): a
 * module script at the top of `<head>`, so it runs before the app's own modules, whose entry imports the runtime and
 * the extensions' page modules from Parity's files. `modules` gives them once the builder has the project's config.
 */
export function appPageRuntime(
  modules: () => PageModules | undefined,
  normalizePath: (path: string) => string
): Vite.Plugin {
  return {
    name: "canvas:app-page-runtime",
    apply: "serve",
    resolveId: (id) => (id === pageEntryId ? `\0${pageEntryId}` : undefined),
    load(id) {
      if (id !== `\0${pageEntryId}`) {
        return undefined
      }

      const given = modules()

      // A page asked for before the builder started draws nothing of Parity's.
      return given ? pageEntrySource(given, normalizePath) : ""
    },
    // Before other plugins' servers, so a framework's server-rendered page passes through `serverPageEntry` too.
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(serverPageEntry)
    },
    transformIndexHtml: () => [
      { tag: "script", attrs: { type: "module", src: pageEntrySrc }, injectTo: "head-prepend" }
    ]
  }
}

/** Where a page loads the page entry from. */
const pageEntrySrc = `/@id/__x00__${pageEntryId}`

const pageEntryTag = Buffer.from(`<script type="module" src="${pageEntrySrc}"></script>`)

/** How much of a page is held back looking for its `<head>` before it's sent on as it is. */
const headLimit = 64 * 1024

/**
 * Where the page entry's script goes in the start of a page's HTML, read byte for byte: the offset just inside its
 * `<head>`, `"later"` while no `<head>` has come yet, or `"none"` when the page has the script already, as a page
 * through `transformIndexHtml` does.
 */
export function pageEntryPlace(start: string): number | "later" | "none" {
  if (start.includes(pageEntrySrc)) {
    return "none"
  }

  const head = /<head(?:\s[^>]*)?>/i.exec(start)

  return head ? head.index + head[0].length : "later"
}

/** The response's methods `serverPageEntry` stands between, with their arguments as given. */
interface ResponseWrites {
  writeHead(...args: unknown[]): ServerResponse
  write(...args: unknown[]): boolean
  end(...args: unknown[]): ServerResponse
}

/** What `write` and `end` were given: the chunk, if any, its encoding and the callback. */
interface Written {
  chunk?: Buffer
  callback?: () => void
}

/** Reads `write`'s or `end`'s arguments, `(chunk?, encoding?, callback?)`, as Node takes them. */
function written(args: readonly unknown[]): Written {
  const callback = args.find((arg): arg is () => void => arg instanceof Function)
  const encoding = args.slice(1).find((arg): arg is BufferEncoding => Buffer.isEncoding(String(arg)))
  const [first] = args

  if (first instanceof Uint8Array) {
    return { chunk: Buffer.from(first), callback }
  }

  if (first === undefined || first === null || first instanceof Function) {
    return { callback }
  }

  // SAFETY: Node's `write` and `end` take a chunk that's a string or bytes, and bytes are read above.
  return { chunk: Buffer.from(first as string, encoding), callback }
}

/** The headers passed to `writeHead(status, message?, headers?)`, when they're an object. */
function givenHeaders(args: readonly unknown[]): OutgoingHttpHeaders | undefined {
  return args.find((arg): arg is OutgoingHttpHeaders => arg instanceof Object && !Array.isArray(arg))
}

/**
 * Puts the page entry first in `<head>` of HTML a framework's server renders (PAR-1302). TanStack Start's, React Router
 * framework mode's and other server-rendered pages never go through `transformIndexHtml`, so without this their frames
 * have no page runtime: no copies, and no spare ever ready. A response that's HTML is held until its `<head>` has
 * come, at most `headLimit` bytes, and sent on with the script inside it; a compressed one is left alone.
 */
export function serverPageEntry(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  if (req.method !== "GET" || !req.headers.accept?.includes("text/html")) {
    next()

    return
  }

  // Node's own methods, which the replacements below call with the arguments they were given, other than a chunk held
  // back.
  const writes: ResponseWrites = res
  const original = { writeHead: writes.writeHead.bind(res), write: writes.write.bind(res), end: writes.end.bind(res) }
  let state: "unknown" | "holding" | "passing" = "unknown"
  let held: Buffer[] = []

  /** Whether the response, with `given` the headers passed to `writeHead`, is HTML this can change. */
  const decide = (given?: OutgoingHttpHeaders) => {
    if (state !== "unknown") {
      return
    }

    const header = (name: string) => {
      const found = Object.entries(given ?? {}).find(([key]) => key.toLowerCase() === name)

      return String(found?.[1] ?? res.getHeader(name) ?? "")
    }

    const encoding = header("content-encoding")
    const html = /text\/html/i.test(header("content-type")) && (encoding === "" || encoding === "identity")

    state = html ? "holding" : "passing"

    if (html) {
      // The script makes the page longer than it said.
      for (const key of Object.keys(given ?? {})) {
        if (key.toLowerCase() === "content-length") {
          delete given?.[key]
        }
      }

      if (!res.headersSent) {
        res.removeHeader("content-length")
      }
    }
  }

  /** Sends on what's held, with the script inside `<head>` once it's come, or as it is past the limit or at the end. */
  const release = (ending: boolean) => {
    const start = Buffer.concat(held)
    const place = pageEntryPlace(start.toString("latin1"))

    if (place === "later" && !ending && start.length < headLimit) {
      return
    }

    held = []
    state = "passing"

    const out =
      place === "later" || place === "none"
        ? start
        : Buffer.concat([start.subarray(0, place), pageEntryTag, start.subarray(place)])

    if (out.length > 0) {
      original.write(out)
    }
  }

  writes.writeHead = (...args) => {
    decide(givenHeaders(args))

    return original.writeHead(...args)
  }

  writes.write = (...args) => {
    decide()

    if (state !== "holding") {
      return original.write(...args)
    }

    const { chunk, callback } = written(args)

    if (chunk) {
      held.push(chunk)
    }

    release(false)

    if (callback) {
      process.nextTick(callback)
    }

    return true
  }

  writes.end = (...args) => {
    decide()

    if (state !== "holding") {
      return original.end(...args)
    }

    const { chunk, callback } = written(args)

    if (chunk) {
      held.push(chunk)
    }

    release(true)

    return callback ? original.end(callback) : original.end()
  }

  next()
}

/**
 * Serves the app's own modules a wrapped package through its module of Parity's instead (PAR-1265), which gets the
 * app's copy. It runs before Vite's own resolver, which would otherwise find the installed package first.
 */
export function appPageWraps(
  modules: () => PageModules | undefined,
  normalizePath: (path: string) => string
): Vite.Plugin {
  let root = ""

  return {
    name: "canvas:app-page-wraps",
    apply: "serve",
    enforce: "pre",
    configResolved(config) {
      root = config.root
    },
    resolveId(id, importer) {
      const wrapped = wrappedImport(id, importer, modules()?.wraps ?? [], normalizePath)

      // The wrapping module's own import is the app's copy, resolved as the app's root would.
      if (wrapped === "app") {
        return this.resolve(id, `${root}/index.html`, { skipSelf: true })
      }

      return wrapped?.file
    }
  }
}

/**
 * Where an import of a wrapped package goes (PAR-1265): from the app's own modules, to the file of Parity's module that
 * wraps it; from that module itself, to the app's own copy (`"app"`). Packages' own imports, and other packages, are left
 * alone.
 */
export function wrappedImport(
  id: string,
  importer: string | undefined,
  wraps: readonly PageWrapFile[],
  normalizePath: (path: string) => string
): { file: string } | "app" | undefined {
  const wrap = wraps.find((candidate) => candidate.package === id)

  if (!wrap || !importer) {
    return undefined
  }

  const file = normalizePath(wrap.file)
  const from = normalizePath(importer.replace(/[?#].*$/, ""))

  if (from === file) {
    return "app"
  }

  return from.includes("/node_modules/") ? undefined : { file }
}

/**
 * The folders the page's modules are read from, which the server must be allowed to serve: each module's, and in
 * development, where the runtime's source finds `@parity-app/channel`. A packaged app's are bundled beside the guest.
 */
export function pageFolders(modules: PageModules): string[] {
  const files = [
    modules.runtime,
    ...[...modules.routers, ...modules.hydration, ...(modules.wraps ?? [])].map((module) => module.file)
  ]

  const channel = /\.tsx?$/.test(modules.runtime)
    ? [dirname(createRequire(modules.runtime).resolve("@parity-app/channel"))]
    : []

  return [...new Set([...files.map((file) => dirname(file)), ...channel])]
}
