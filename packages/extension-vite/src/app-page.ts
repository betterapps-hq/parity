import { createRequire } from "node:module"
import { dirname } from "node:path"
import type { PageModules } from "@parity-app/core"
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
    transformIndexHtml: () => [
      { tag: "script", attrs: { type: "module", src: `/@id/__x00__${pageEntryId}` }, injectTo: "head-prepend" }
    ]
  }
}

/**
 * The folders the page's modules are read from, which the server must be allowed to serve: each module's, and in
 * development, where the runtime's source finds `@parity-app/channel`. A packaged app's are bundled beside the guest.
 */
export function pageFolders(modules: PageModules): string[] {
  const files = [modules.runtime, ...[...modules.routers, ...modules.hydration].map((module) => module.file)]

  const channel = /\.tsx?$/.test(modules.runtime)
    ? [dirname(createRequire(modules.runtime).resolve("@parity-app/channel"))]
    : []

  return [...new Set([...files.map((file) => dirname(file)), ...channel])]
}
