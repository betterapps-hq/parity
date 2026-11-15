import { randomUUID } from "node:crypto"
import { mkdir, realpath } from "node:fs/promises"
import { join, posix } from "node:path"
import type { BuilderSession, BuilderStartOptions } from "@parity-app/core"
import { guestModule } from "@parity-app/project"
import type { NextBundler } from "./bundler.ts"
import { guestAppFiles, guestAppFolder, type GuestAppOptions, guestModuleFile, projectImport } from "./guest-app.ts"
import { copyGuestRuntime } from "./guest-runtime.ts"
import { detectNext, postcssConfigFile, projectTsconfigFile } from "./next.ts"
import { type GuestPage, readGuestPage } from "./page.ts"
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
    styles: "bundled"
  })

  const [postcss, tsconfig] = await Promise.all([postcssConfigFile(root), projectTsconfigFile(root)])

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
  }

  await writeGuestApp(root, [...guestAppFiles(app), ...standIns.map(({ path, text }) => ({ path, text }))])
  const session = randomUUID()
  const started: StartedServer = {}

  const own: OwnRoute = async (_request, response, url) => {
    const { server } = started
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

  return { guestUrl: `${origin}${guestModuleRoute}`, toolVersion: found.next.version, close: () => server.close() }
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
