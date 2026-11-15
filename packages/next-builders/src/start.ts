import { randomUUID } from "node:crypto"
import { mkdir, realpath } from "node:fs/promises"
import { join, posix } from "node:path"
import type { BuilderSession, BuilderStartOptions } from "@parity-app/core"
import { guestModule } from "@parity-app/project"
import type { NextBundler } from "./bundler.ts"
import {
  guestAppFiles,
  guestAppFolder,
  type GuestAppOptions,
  guestModuleFile,
  guestRoutes,
  projectImport
} from "./guest-app.ts"
import { copyGuestRuntime } from "./guest-runtime.ts"
import { detectNext, postcssConfigFile, projectTsconfigFile, tsconfigSetsBaseUrl } from "./next.ts"
import { type GuestPage, readGuestPage } from "./page.ts"
import { serverOnlyStandIns } from "./server-modules.ts"
import { freePort, type NextServer, type OwnRoute, portFree, startNextServer, writeGuestApp } from "./server.ts"

/*
 * Starting a Next.js builder, whichever bundler Next runs: the guest app written into the project, the project's own
 * Next started on it, and the guest module served from what Next built. Only that last part is the bundler's own: how
 * the canvas loads its chunks without starting Next's router (docs/proposals/nextjs-builders.md).
 */

/** Where the builder serves the guest module, and the chunks it serves changed. */
export const nextGuestRoutes = { guest: "/__parity/guest.mjs", script: "/__parity/script.js" } as const

/** The guest app's pages, as Next renders them. */
export interface GuestPages {
  guest: GuestPage
  styles: GuestPage
  packageStyles: GuestPage
}

/** What a bundler's builder adds to the shared start: the bundler, and how the canvas loads what it built. */
export interface NextGuestLoader {
  bundler: NextBundler
  /** The guest module's source, from the guest app's pages. `session` names this start, unique to it. */
  guestModule: (pages: GuestPages, server: NextServer, session: string) => Promise<string>
  /** A chunk of the guest app's, changed as the canvas needs it, served at `nextGuestRoutes.script?src=`. */
  script?: (server: NextServer, src: string) => Promise<string>
}

/** Next's server once it's started: the builder's own routes answer nothing before. */
interface StartedServer {
  server?: NextServer
}

/** Starts the project's own Next on the guest app, with `loader` making the guest module from what Next builds. */
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
  const guestFolder = guestModuleFile.slice(0, guestModuleFile.lastIndexOf("/"))

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
    app.tsconfigBaseUrl = await tsconfigSetsBaseUrl(root, tsconfig)
  }

  await writeGuestApp(root, [...guestAppFiles(app), ...standIns.map(({ path, text }) => ({ path, text }))])
  const session = randomUUID()
  const started: StartedServer = {}
  const guestModuleText = async (server: NextServer) => loader.guestModule(await guestPages(server), server, session)

  const own: OwnRoute = async (_request, response, url) => {
    const { server } = started
    const script = url.pathname === nextGuestRoutes.script ? loader.script : undefined

    if (!server || (url.pathname !== nextGuestRoutes.guest && !script)) {
      return false
    }

    const answer = script ? await script(server, url.searchParams.get("src") ?? "") : await guestModuleText(server)

    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" })
    response.end(answer)

    return true
  }

  const server = await startNextServer({ next: found.next, bundler: loader.bundler, folder, port, routes: own })
  started.server = server

  try {
    // Compiles the guest's pages before the canvas asks, and fails the start with Next's reason if they don't build.
    await guestModuleText(server)
  } catch (error) {
    await server.close()
    throw error
  }

  return {
    guestUrl: `${origin}${nextGuestRoutes.guest}`,
    toolVersion: found.next.version,
    close: () => server.close()
  }
}

/** The guest app's pages as Next renders them now. */
async function guestPages(server: NextServer): Promise<GuestPages> {
  const [guest, styles, packageStyles] = await Promise.all([
    page(server, guestRoutes.guest),
    page(server, guestRoutes.styles),
    page(server, guestRoutes.packageStyles)
  ])

  return { guest, styles, packageStyles }
}

/** A page of the guest app as Next renders it, or why it didn't. */
async function page(server: NextServer, route: string): Promise<GuestPage> {
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
