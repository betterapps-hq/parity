import type { BuilderAdapter, BuilderDetection } from "@parity-app/core"
import {
  detectNext,
  type GuestPages,
  nextAppStyles,
  nextConfigFiles,
  type NextGuestLoader,
  nextGuestRoutes,
  type NextServer,
  startNextGuest
} from "@parity-app/next-builders"
import { guestLoaderSource, runtimeChunks, withoutStartup } from "./loader.ts"

/** The files whose coming or going means the project is detected again: Next's config. */
export const turbopackWatches = [...nextConfigFiles]

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
  start: (options) => startNextGuest(options, turbopackLoader)
}

/** How the canvas loads what Turbopack built: its runtime without its start-up, then the guest's chunks. */
const turbopackLoader: NextGuestLoader = {
  bundler: "turbopack",
  guestModule: guestModuleText,
  script: runtimeText
}

/** The guest module, from the guest app's pages as Next renders them now. */
async function guestModuleText(pages: GuestPages, server: NextServer, session: string): Promise<string> {
  const reference = pages.guest.guest
  const runtime = pages.guest.scripts.find((script) => /\/turbopack-[^/]+\.js(?:\?|$)/.test(script))

  if (!reference || !runtime) {
    throw new Error("Next's page for the guest has no Turbopack runtime or guest module")
  }

  const base = `${server.origin}/_next/`
  const runtimeSource = await server.fetchText(runtime)
  const pageChunks = runtimeChunks(runtimeSource.text).map((path) => base + encodeURI(path))
  const chunks = [...new Set([...pageChunks, ...reference.chunks])].filter((chunk) => /\.js(?:\?|$)/.test(chunk))

  return guestLoaderSource({
    session,
    runtime: `${server.origin}${nextGuestRoutes.script}?src=${encodeURIComponent(runtime)}`,
    chunks,
    id: reference.id,
    styles: pages.styles.stylesheets,
    packageStyles: pages.packageStyles.stylesheets,
    stylesheetBase: base
  })
}

/** The guest page's runtime chunk, without what would start Next's router. */
async function runtimeText(server: NextServer, src: string): Promise<string> {
  if (!src.startsWith(`${server.origin}/_next/`)) {
    throw new Error(`${src} isn't one of the guest app's chunks`)
  }

  return withoutStartup((await server.fetchText(src)).text)
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
