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
 * The app's own modules get a wrapped package through its module instead (PAR-1265), which gets the app's copy.
 */
export function appPageRuntime(
  modules: () => PageModules | undefined,
  normalizePath: (path: string) => string
): Vite.Plugin {
  let root = ""

  return {
    name: "canvas:app-page-runtime",
    apply: "serve",
    configResolved(config) {
      root = config.root
    },
    resolveId(id, importer) {
      if (id === pageEntryId) {
        return `\0${pageEntryId}`
      }

      const wrapped = wrappedImport(id, importer, modules()?.wraps ?? [], normalizePath)

      // The wrapping module's own import is the app's copy, resolved as the app's root would.
      if (wrapped === "app") {
        return this.resolve(id, `${root}/index.html`, { skipSelf: true })
      }

      return wrapped?.file
    },
    load(id) {
      if (id !== `\0${pageEntryId}`) {
        return undefined
      }

      const given = modules()

      // A page asked for before the builder started draws nothing of Parity's.
      return given ? pageEntrySource(given, normalizePath) : ""
    },
    transformIndexHtml: () => [
      { tag: "script", attrs: { type: "module", src: `/@id/__x00__${pageEntryId}` }, injectTo: "head-prepend" }
    ]
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
