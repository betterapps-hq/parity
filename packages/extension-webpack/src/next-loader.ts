import {
  type GuestPage,
  type GuestStylesheets,
  guestExportSource,
  guestPage,
  guestRoutes,
  type NextGuestLoader,
  type NextServer
} from "@parity-app/next-builders"

/*
 * The guest module the canvas imports, from what Next's webpack built for the guest app. webpack writes no ES modules:
 * its chunks push their modules to `self.webpackChunk_N_E` for its runtime, and some also push a start-up function that
 * starts Next's router, which would take over the canvas's page. So the builder serves a module of its own that loads
 * the guest page's chunks with their start-up functions taken out, then the runtime, then asks it for the guest module
 * by its id (docs/proposals/nextjs-builders.md).
 */

/** The guest app's pages, as Next renders them: the guest's, and those of the project's and packages' stylesheets. */
export interface GuestPages {
  guest: GuestPage
  styles: GuestPage
  packageStyles: GuestPage
}

/** The guest app's pages as Next renders them now. */
async function guestPages(server: NextServer): Promise<GuestPages> {
  const [guest, styles, packageStyles] = await Promise.all([
    guestPage(server, guestRoutes.guest),
    guestPage(server, guestRoutes.styles),
    guestPage(server, guestRoutes.packageStyles)
  ])

  return { guest, styles, packageStyles }
}

/** How Next's webpack builds the guest app, read from its page: the chunks to load, the runtime, and the guest's id. */
export interface WebpackGuestChunks {
  /** The page's chunks and the guest module's, which load before the runtime. */
  chunks: string[]
  runtime: string
  /** The guest module's id in webpack's runtime. */
  id: string
}

/** A chunk's address without its query, which Next adds to bust the cache, to tell the same chunk twice. */
const withoutQuery = (src: string) => src.replace(/[?#].*$/, "")

/**
 * The chunks the guest page loads, from its scripts and the guest module's client reference, whose chunk list alternates
 * each chunk's id and its file from `_next/`. Next's polyfills are left out, as the page loads them only in browsers
 * without modules, and so is everything that isn't JavaScript.
 */
export function webpackGuestChunks(pages: GuestPages, origin: string): WebpackGuestChunks {
  const reference = pages.guest.guest
  const scripts = pages.guest.scripts.filter((src) => !/\/polyfills(?:-[^/]*)?\.js(?:[?#]|$)/.test(src))
  const runtime = scripts.find((src) => /\/webpack(?:-[^/]*)?\.js(?:[?#]|$)/.test(src))

  if (!reference || !runtime) {
    throw new Error("Next's page for the guest has no webpack runtime or guest module")
  }

  const files = reference.chunks
    .filter((_, index) => index % 2 === 1)
    .map((file) => (/^https?:/.test(file) ? file : `${origin}/_next/${file.replace(/^\/?(?:_next\/)?/, "")}`))

  const seen = new Set<string>()

  const chunks = [...scripts.filter((src) => src !== runtime), ...files].filter((src) => {
    const key = withoutQuery(src)
    const fresh = key.endsWith(".js") && !seen.has(key)
    seen.add(key)

    return fresh
  })

  return { chunks, runtime, id: reference.id }
}

export interface WebpackGuestLoader extends WebpackGuestChunks, GuestStylesheets {
  /** Names this builder's session, so a builder started again gets a runtime of its own in the same page. */
  session: string
}

/** How the canvas loads what Next's webpack built: the page's chunks without their start-up, then the runtime. */
export const nextWebpackLoader: NextGuestLoader = {
  bundler: "webpack",
  async guestModule(server, session) {
    const pages = await guestPages(server)

    return webpackGuestLoaderSource({
      ...webpackGuestChunks(pages, server.origin),
      session,
      styles: pages.styles.stylesheets,
      packageStyles: pages.packageStyles.stylesheets
    })
  }
}

/**
 * Keeps each session's chunks on its own runtime (PAR-1172). Next names webpack's chunk list `webpackChunk_N_E` in every
 * app, so a second Next.js guest in the page would take over the one global, and a lazy chunk the first loads later
 * would reach the second's runtime and never finish. So the global hands each script the list of the session that owns
 * it, by the script's origin, as each builder serves from a port of its own, and others the last session's.
 * `startSession` gives a session its own list, and `listOf` is the list its runtime took over.
 */
export const chunkListsSource = `const lists = (self.__parityWebpackLists ??= {})
const origins = (self.__parityWebpackOrigins ??= {})
const ownerOf = () => {
  const src = document.currentScript?.src
  const origin = src ? new URL(src, location.href).origin : undefined
  return origins[origin] ?? self.__parityWebpackLatest
}
if (!Object.getOwnPropertyDescriptor(self, "webpackChunk_N_E")?.get) {
  Object.defineProperty(self, "webpackChunk_N_E", {
    configurable: true,
    get: () => lists[ownerOf()],
    set: (list) => {
      lists[ownerOf()] = list
    }
  })
}
// Until the runtime takes a list over, what the chunks push keeps their modules and leaves out the function that would
// start Next's router.
const startSession = (session, runtime) => {
  const chunks = []
  chunks.push = (chunk) => Array.prototype.push.call(chunks, [chunk[0], chunk[1]])
  lists[session] = chunks
  origins[new URL(runtime, location.href).origin] = session
  self.__parityWebpackLatest = session
}
const listOf = (session) => lists[session]`

/** The guest module's source. It loads the chunks and the runtime once per page and session, then makes the guest. */
export function webpackGuestLoaderSource(loader: WebpackGuestLoader): string {
  const json = (value: string | readonly string[]) => JSON.stringify(value)

  return `const sessions = (globalThis.__parityWebpack ??= {})
const load = (src) => new Promise((resolve, reject) => {
  const script = document.createElement("script")
  script.src = src
  script.onload = () => resolve()
  script.onerror = () => reject(new Error(\`\${src} didn't load\`))
  document.head.append(script)
})
${chunkListsSource}
// One runtime per page and session, each on a list of its own; the one before goes on with the modules it has.
sessions[${json(loader.session)}] ??= (async () => {
  startSession(${json(loader.session)}, ${json(loader.runtime)})
  await Promise.all(${json(loader.chunks)}.map(load))
  await load(${json(loader.runtime)})

  return new Promise((resolve, reject) => {
    listOf(${json(loader.session)}).push([[${json(`parity:${loader.session}`)}], {}, (require) => {
      try {
        resolve(require(${json(loader.id)}))
      } catch (error) {
        reject(error)
      }
    }])
  })
})()
const guestModule = await sessions[${json(loader.session)}]
${guestExportSource(loader)}`
}
