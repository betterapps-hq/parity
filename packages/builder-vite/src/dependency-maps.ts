import type { Plugin } from "vite"

/** A link to a source map file at the end of a module, as bundlers write one. */
const mapLink = /\/\/[#@] sourceMappingURL=\S+\s*$/
const script = /\.[cm]?[jt]sx?$/

/**
 * How a module's source map is served, by its id. A dependency Vite prebundled into `cacheDir` links to the map the
 * optimizer wrote beside it (`link`); another script from node_modules goes without one (no `link`); and the app's own
 * code, its workspace packages included, keeps the map Vite inlines (undefined).
 */
export function dependencySourceMap(id: string, cacheDir: string): { link?: string } | undefined {
  const file = id.split("?")[0].replaceAll("\\", "/")
  if (!script.test(file)) return undefined
  // As Vite tells its optimized files apart, which covers each environment's folder (`deps`, `deps_ssr`).
  if (file.startsWith(`${cacheDir.replaceAll("\\", "/").replace(/\/$/, "")}/deps`)) {
    return { link: `${file.slice(file.lastIndexOf("/") + 1)}.map` }
  }
  return file.includes("/node_modules/") ? {} : undefined
}

/**
 * Serves dependencies without the source maps Vite inlines into every script it sends, which cost the pages more memory
 * than the code: tldraw's 3.5 MB bundle arrived as 12.4 M characters. A prebundled dependency links to its map instead,
 * which Vite serves from its cache when DevTools asks for it. The app's own code keeps its inline maps, so its stack
 * traces and console messages point at its source. Parity's UI and each project's builder use it; the builder runs it
 * in the project's own Vite, so it only imports Vite's types.
 */
export function dependencySourceMaps(): Plugin {
  let cacheDir = ""
  return {
    name: "parity:dependency-source-maps",
    apply: "serve",
    // After the app's plugins, so the link goes last. Vite's import analysis runs later still and keeps the map as is.
    enforce: "post",
    configResolved(config) {
      cacheDir = config.cacheDir
    },
    transform(code, id) {
      const served = dependencySourceMap(id, cacheDir)
      if (!served) return undefined
      const link = served.link && !mapLink.test(code) ? `//# sourceMappingURL=${served.link}\n` : ""
      // `{ mappings: "" }` is Vite's "no map": it then inlines nothing, not even the map it makes up for a script that has
      // none. Vite keeps the map it loaded for a module whose code no plugin changed, so the code always changes here.
      return { code: `${code}\n${link}`, map: { mappings: "" } }
    }
  }
}
