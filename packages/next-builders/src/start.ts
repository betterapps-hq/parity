import { randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, realpath, stat } from "node:fs/promises"
import type { IncomingMessage } from "node:http"
import { join, posix } from "node:path"
import type { BuilderSession, BuilderStartOptions, CodeChange } from "@parity-app/core"
import { guestModule, readTsconfig } from "@parity-app/project"
import type { NextBundler } from "./bundler.ts"
import { elementSourcesRoute, taggedNextSource } from "./element-sources.ts"
import { guestAppFiles, guestAppFolder, type GuestAppOptions, guestModuleFile, projectImport } from "./guest-app.ts"
import { copyGuestRuntime } from "./guest-runtime.ts"
import {
  guestStylesDigest,
  type ProjectModule,
  projectModules as moduleServer,
  watchCodeChanges
} from "./module-server.ts"
import { nextRouterDecorator } from "./next-router.ts"
import { detectNext, postcssConfigFile, projectTsconfigFile, tsconfigPathsBase } from "./next.ts"
import { type GuestPage, readGuestPage } from "./page.ts"
import { projectPageFiles, projectRouteFolders, type ProjectRouteFile, routeFolders } from "./project-pages.ts"
import { serverOnlyStandIns } from "./server-modules.ts"
import { freePort, type NextServer, type OwnRoute, portFree, startNextServer, writeGuestApp } from "./server.ts"

/*
 * Starting a Next.js builder: everything but how the canvas gets the guest module from the bundler's output, which each
 * bundler's extension gives as its loader. The guest app is written, the project's Next started on it, and the guest's
 * pages compiled before the canvas asks.
 */

/** Where the builder serves the guest module. */
export const guestModuleRoute = "/__parity/guest.mjs"

/** What a Next.js builder's extension gives: its bundler, and how the canvas gets the guest from its output. */
export interface NextGuestLoader {
  bundler: NextBundler
  /** The guest module's source, from the guest app's pages as Next renders them now, for the builder's `session`. */
  guestModule(server: NextServer, session: string): Promise<string>
  /** Other scripts the builder serves under `/__parity/`, by path, as Turbopack's runtime is. */
  scripts?: Record<string, (server: NextServer, url: URL) => Promise<string>>
  /**
   * One of the project's modules as an ES module, for the builder's `session`: a component found since the guest
   * loaded, or one whose code changed, loaded again after the change `module.stamp` (PAR-1159). A loader with it gets
   * the builder's code changes and restyled guests; one without is started again when the project changes.
   */
  module?(server: NextServer, session: string, module: ProjectModule): Promise<string>
}

/** Next's server once it's started: the builder's own routes answer nothing before. */
interface StartedServer {
  server?: NextServer
}

/**
 * Starts a Next.js builder on the project: writes the guest app, starts the project's own Next on it with the loader's
 * bundler, and serves the loader's guest module, which it asks for once first, so a guest that doesn't build fails the
 * start with Next's reason.
 */
export async function startNextGuest(options: BuilderStartOptions, loader: NextGuestLoader): Promise<BuilderSession> {
  const root = await realpath(options.root)
  const found = await detectNext(root)

  if ("missing" in found) {
    throw new Error(`${found.missing} in ${root}`)
  }

  // Next runs from the project's folder, as `next dev` does, so the config's plugins that find Next from there do:
  // vanilla-extract's adds its Turbopack rules only for a Next it finds. The builder's process is this project's.
  process.chdir(root)
  const port = options.port !== undefined && (await portFree(options.port)) ? options.port : await freePort()
  const origin = `http://127.0.0.1:${port}`
  const folder = join(root, guestAppFolder)
  await mkdir(folder, { recursive: true })
  const runtime = await copyGuestRuntime(await realpath(options.rendererGuestPath), folder, `${origin}/`)

  // The project's own modules that only Next's server can build are imported from stand-ins that say so.
  const projectModules = Object.values(options.config.components).flatMap((source) =>
    source.library ? [] : [source.path]
  )

  const standIns = await serverOnlyStandIns(root, [...new Set(projectModules)])
  const standInOf = new Map(standIns.map((standIn) => [standIn.module, standIn.path]))
  const guestFolder = posix.dirname(guestModuleFile)

  const { source } = guestModule(options.config, {
    renderer: `../${runtime}`,
    projectPath: (path) => {
      const standIn = standInOf.get(path)

      return standIn ? `./${posix.relative(guestFolder, standIn)}` : projectImport(path)
    },
    styles: "bundled",
    // Components that read Next's router draw inside a still one, as they would throw outside any router.
    decorators: [nextRouterDecorator]
  })

  const [postcss, tsconfig, pages] = await Promise.all([
    postcssConfigFile(root),
    projectTsconfigFile(root),
    projectPages(root)
  ])

  const app: GuestAppOptions = {
    root: root.replaceAll("\\", "/"),
    next: found.next.folder,
    origin,
    guestSource: source,
    styles: options.config.styles,
    packageStyles: options.config.packageStyles ?? []
  }

  if (found.config) {
    app.config = found.config
  }

  if (postcss) {
    app.postcss = postcss
  }

  if (tsconfig) {
    app.tsconfig = tsconfig
    const base = tsconfigPathsBase(root, tsconfig)

    if (base !== undefined) {
      app.tsconfigPathsBase = base
    }
  }

  await writeGuestApp(root, [...guestAppFiles(app), ...pages, ...standIns.map(({ path, text }) => ({ path, text }))])
  const session = randomUUID()
  const started: StartedServer = {}

  /** The project's own components' files, which the canvas loads from the guest, by path from the root. */
  const componentFiles = new Map<string, string[]>()

  for (const source of Object.values(options.config.components)) {
    if (!source.library) {
      const path = source.path.replaceAll("\\", "/").replace(/^\.?\//, "")
      componentFiles.set(path, [...(componentFiles.get(path) ?? []), source.export.split(".")[0]!])
    }
  }

  const modules = moduleServer(root, folder, (path) => componentFiles.get(path) ?? [])

  const own: OwnRoute = async (request, response, url) => {
    // Next's loaders ask for the project's JSX to be tagged as they compile it, which starts before Next's server is.
    if (url.pathname === elementSourcesRoute) {
      const tagged = taggedNextSource(root, url.searchParams.get("file") ?? "", await requestText(request))

      if (tagged) {
        response.writeHead(200, { "content-type": "application/json" })
        response.end(JSON.stringify(tagged))
      } else {
        response.writeHead(204)
        response.end()
      }

      return true
    }

    const { server } = started
    const path = decodeURIComponent(url.pathname).slice(1)

    // A module of the project's the canvas loads on its own: a component found since, or one whose code changed.
    if (server && loader.module && request.method === "GET" && (await modules.loadable(path))) {
      const stamp = url.searchParams.has("t") ? Number(url.searchParams.get("t")) : undefined
      const answer = await loader.module(server, session, await modules.module(server, path, stamp))
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" })
      response.end(answer)

      return true
    }

    const script = url.pathname === guestModuleRoute ? undefined : loader.scripts?.[url.pathname]

    if (!server || (url.pathname !== guestModuleRoute && !script)) {
      return false
    }

    const answer = script ? await script(server, url) : await loader.guestModule(server, session)
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" })
    response.end(answer)

    return true
  }

  const server = await startNextServer({ next: found.next, bundler: loader.bundler, folder, port, routes: own })
  started.server = server

  try {
    // Compiles the guest's pages before the canvas asks, and fails the start with Next's reason if they don't build.
    await loader.guestModule(server, session)
  } catch (error) {
    await server.close()
    throw error
  }

  const guestUrl = `${origin}${guestModuleRoute}`

  if (!loader.module) {
    return { guestUrl, toolVersion: found.next.version, close: () => server.close() }
  }

  const listeners = new Set<(change: CodeChange) => void>()

  const stopWatching = await watchCodeChanges({
    root,
    tsconfig: readTsconfig(root),
    components: () => [...new Set([...componentFiles.keys(), ...modules.served()])],
    stylesDigest: () => guestStylesDigest(server),
    send: (change) => listeners.forEach((listener) => listener(change))
  })

  return {
    guestUrl,
    toolVersion: found.next.version,
    // The guest module is made afresh for each request, with the guest's stylesheets as Next builds them now.
    restyledGuestUrl: (stamp) => `${guestUrl}?styles=${stamp}`,
    codeChanges(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    async close() {
      stopWatching()
      await server.close()
    }
  }
}

/** The guest app's mirrors of the project's App Router and Pages Router files, so it serves the project's pages. */
async function projectPages(root: string) {
  const candidates = [...projectRouteFolders.app, ...projectRouteFolders.pages]

  const present = await Promise.all(
    candidates.map(async (folder) => ((await isFolder(join(root, folder))) ? [folder] : []))
  )

  const folders = routeFolders(present.flat())
  const files: ProjectRouteFile[] = []

  for (const folder of [folders.app, folders.pages]) {
    for (const path of folder ? await filesUnder(root, folder) : []) {
      files.push({ path, text: await readFile(join(root, path), "utf8") })
    }
  }

  return projectPageFiles(folders, files)
}

/** Every file under a folder of the project's, by path from the root, leaving out `node_modules`. */
async function filesUnder(root: string, folder: string): Promise<string[]> {
  const entries = await readdir(join(root, folder), { withFileTypes: true })

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = posix.join(folder, entry.name)

      if (entry.isDirectory()) {
        return entry.name === "node_modules" ? [] : await filesUnder(root, path)
      }

      return entry.isFile() ? [path] : []
    })
  )

  return nested.flat()
}

function isFolder(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isDirectory(),
    () => false
  )
}

/** A request's body, as text. */
async function requestText(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }

  return Buffer.concat(chunks).toString("utf8")
}

/** A page of the guest app as Next renders it, or why it didn't, from Next's error page. */
export async function guestPage(server: NextServer, route: string): Promise<GuestPage> {
  const { ok, status, text } = await server.fetchText(route)

  if (!ok) {
    throw new Error(`Next couldn't build the guest's ${route} page (${status}): ${errorSummary(text)}`)
  }

  return readGuestPage(text)
}

/** What Next's error page says, without its markup. */
function errorSummary(html: string): string {
  return html
    .replaceAll(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/g, "")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 500)
}
