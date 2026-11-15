import { randomUUID } from "node:crypto"
import { mkdir, realpath } from "node:fs/promises"
import { join, posix } from "node:path"
import type { BuilderAdapter, BuilderDetection } from "@parity-app/core"
import {
  copyGuestRuntime,
  detectNext,
  freePort,
  guestAppFiles,
  guestAppFolder,
  type GuestAppOptions,
  guestModuleFile,
  guestRoutes,
  nextAppStyles,
  type NextServer,
  nextConfigFiles,
  type OwnRoute,
  portFree,
  postcssConfigFile,
  projectImport,
  projectTsconfigFile,
  readGuestPage,
  serverOnlyStandIns,
  startNextServer,
  writeGuestApp
} from "@parity-app/next-builders"
import { guestModule } from "@parity-app/project"
import { guestLoaderSource, runtimeChunks, withoutStartup } from "./loader.ts"

/** The files whose coming or going means the project is detected again: Next's config. */
export const turbopackWatches = [...nextConfigFiles]

/** Next's server once it's started: the builder's own routes answer nothing before. */
interface StartedServer {
  server?: NextServer
}

/** Where the builder serves the guest module and the runtime it loads. */
const routes = { guest: "/__parity/guest.mjs", runtime: "/__parity/runtime.js" } as const

/**
 * Builds a Next.js app's components with the project's own Next on Turbopack, on a guest app of Parity's own in the
 * project's `.next/parity/`, and serves the canvas a guest module from Turbopack's output: the entry module the
 * Turbopack extension's manifest names, which the builder process loads (PAR-1149).
 */
export const turbopackBuilder: BuilderAdapter = {
  id: "turbopack",
  name: "Turbopack",
  watches: turbopackWatches,
  detect: ({ root }) => detectTurbopack(root),
  styles: ({ root }) => nextAppStyles(root),
  async start(options) {
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
    }

    await writeGuestApp(root, [...guestAppFiles(app), ...standIns.map(({ path, text }) => ({ path, text }))])
    const session = randomUUID()
    const started: StartedServer = {}

    const own: OwnRoute = async (_request, response, url) => {
      const { server } = started

      if (!server || (url.pathname !== routes.guest && url.pathname !== routes.runtime)) {
        return false
      }

      const answer =
        url.pathname === routes.guest
          ? await guestModuleText(server, session)
          : await runtimeText(server, url.searchParams.get("src") ?? "")

      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" })
      response.end(answer)

      return true
    }

    const server = await startNextServer({ next: found.next, bundler: "turbopack", folder, port, routes: own })
    started.server = server

    try {
      // Compiles the guest's pages before the canvas asks, and fails the start with Next's reason if they don't build.
      await guestModuleText(server, session)
    } catch (error) {
      await server.close()
      throw error
    }

    return {
      guestUrl: `${origin}${routes.guest}`,
      toolVersion: found.next.version,
      close: () => server.close()
    }
  }
}

/** The guest module, from the guest app's pages as Next renders them now. */
async function guestModuleText(server: NextServer, session: string): Promise<string> {
  const [guest, styles, packageStyles] = await Promise.all(
    [guestRoutes.guest, guestRoutes.styles, guestRoutes.packageStyles].map((route) => page(server, route))
  )

  const reference = guest.guest
  const runtime = guest.scripts.find((script) => /\/turbopack-[^/]+\.js(?:\?|$)/.test(script))

  if (!reference || !runtime) {
    throw new Error("Next's page for the guest has no Turbopack runtime or guest module")
  }

  const base = `${server.origin}/_next/`
  const runtimeSource = await server.fetchText(runtime)
  const pageChunks = runtimeChunks(runtimeSource.text).map((path) => base + encodeURI(path))
  const chunks = [...new Set([...pageChunks, ...reference.chunks])].filter((chunk) => /\.js(?:\?|$)/.test(chunk))

  return guestLoaderSource({
    session,
    runtime: `${server.origin}${routes.runtime}?src=${encodeURIComponent(runtime)}`,
    chunks,
    id: reference.id,
    styles: styles.stylesheets,
    packageStyles: packageStyles.stylesheets,
    stylesheetBase: base
  })
}

/** A page of the guest app as Next renders it, or why it didn't. */
async function page(server: NextServer, route: string) {
  const { ok, status, text } = await server.fetchText(route)

  if (!ok) {
    throw new Error(`Next couldn't build the guest's ${route} page (${status}): ${errorSummary(text)}`)
  }

  return readGuestPage(text)
}

/** The guest page's runtime chunk, without what would start Next's router. */
async function runtimeText(server: NextServer, src: string): Promise<string> {
  if (!src.startsWith(`${server.origin}/_next/`)) {
    throw new Error(`${src} isn't one of the guest app's chunks`)
  }

  return withoutStartup((await server.fetchText(src)).text)
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

/**
 * Asks the project's own Next whether its dev server runs Turbopack: Next.js 16 does unless its dev script passes
 * `--webpack`, and 15 only with `--turbopack`.
 */
export async function detectTurbopack(root: string): Promise<BuilderDetection> {
  const found = await detectNext(root)

  if ("missing" in found) {
    return { found: false, summary: found.missing }
  }

  const { version } = found.next
  const config = found.config ? `, config ${found.config}` : ""

  if (found.bundler !== "turbopack") {
    return {
      found: false,
      version,
      summary: `Next.js ${version} runs webpack${found.script ? ` in the ${found.script} script` : ""}`
    }
  }

  const detection: BuilderDetection = { found: true, version, summary: `Next.js ${version} on Turbopack${config}` }

  if (found.config) {
    detection.config = found.config
  }

  return detection
}
