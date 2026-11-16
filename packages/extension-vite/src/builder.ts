import { createHash } from "node:crypto"
import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { createRequire } from "node:module"
import { type AddressInfo, createServer as createNetServer } from "node:net"
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { hasElementSources, tagElementSources } from "@parity-app/code"
import {
  type BuilderAdapter,
  type BuilderDetection,
  type BuilderStartOptions,
  type CodeChange,
  type ExportsTarget,
  iconStyleModules,
  type LibraryInfo,
  libraryImports,
  parseManifest,
  type ProjectConfig,
  scriptConfigExtensions
} from "@parity-app/core"
import { isComposite, isText } from "@parity-app/core/values/evaluate"
import { commandOption, gatherChanges, type GuestModule, guestModule, scriptRunning } from "@parity-app/project"
import type * as Vite from "vite"
import { appPageModes } from "./app-page.ts"
import { viteAppStyles } from "./app-styles.ts"
import { stampChange } from "./code-changes.ts"
import { dependencySourceMaps } from "./dependency-maps.ts"
import { loadedFiles } from "./loaded-files.ts"
import { moduleStyles, moduleStylesId } from "./module-styles.ts"
import { warmGuestGraph } from "./warmup.ts"

/** The config files Vite looks for. The config itself is found by the project's own Vite; these explain a miss. */
export const viteConfigFiles = scriptConfigExtensions.map((extension) => `vite.config.${extension}`)
const guestId = "virtual:canvas/guest"
const rendererId = "virtual:canvas/renderer"

/** Followed by the specifier a development stand-in serves in place of, and the folder of the module importing it. */
const standInId = "virtual:canvas/stand-in/"
const loopback = "127.0.0.1"

/**
 * Serves a project's components with the project's own Vite install and config: the entry module the Vite extension's
 * manifest names, which the builder process loads (PAR-1095).
 */
export const viteBuilder: BuilderAdapter = {
  id: "vite",
  name: "Vite",
  watches: viteConfigFiles,
  detect: ({ root }) => detectVite(root),
  styles: ({ root }) => viteAppStyles(root),
  async start(options) {
    // Windows temp folders can use an 8.3 alias. Vite resolves imports to the long path, which must also be the
    // configured root and filesystem allow-list or the project's own CSS/modules are rejected with 403.
    options = {
      ...options,
      root: await realpath(options.root),
      rendererGuestPath: await realpath(options.rendererGuestPath)
    }
    const vite = await loadProjectVite(options.root)
    const configFile = await scriptedConfig(options.root)
    const port = options.port !== undefined && (await portFree(options.port)) ? options.port : await freePort()

    // The app's own page, which draws each route on the canvas (PAR-1076): scanned with the components, so what only the
    // app's entry imports, such as its router, is bundled before a page asks for it rather than re-bundled under it.
    const appPage = await stat(join(options.root, "index.html")).then(
      () => ["index.html"],
      () => []
    )

    const server = await vite.createServer({
      root: options.root,
      // Left undefined, Vite looks for the config file itself, as it does when the key is absent.
      configFile,
      // Its own dependency cache: the project's own dev server, often running alongside, would otherwise re-optimize
      // into the same folder, and each server would then serve stale dependencies ("Outdated Optimize Dep").
      cacheDir: "node_modules/.vite-parity",
      clearScreen: false,
      server: {
        // Vite reads port 0 as unset and starts at 5173, so two Parity instances both took it, one on IPv4 and one on
        // IPv6, and `localhost` reached either. A port the system gave out, on 127.0.0.1 only, is this server's alone.
        host: loopback,
        port,
        strictPort: true,
        // The guest never loads index.html, so there is no HMR client. This also turns off framework refresh
        // transforms (React Fast Refresh) that would otherwise expect that page's preamble.
        hmr: false,
        cors: { origin: options.allowedOrigins },
        fs: { allow: [vite.searchForWorkspaceRoot(options.root), ...guestFolders(options.rendererGuestPath)] }
      },
      resolve: { dedupe: options.renderer.runtimePackages },
      optimizeDeps: {
        // A workspace package is the app's own source, which Vite compiles as it does the app's files.
        include: [
          ...options.renderer.runtimeImports,
          ...new Set(
            options.config.libraries.flatMap((library) =>
              library.workspace ? [] : [library.importName, ...iconImports(library), ...libraryImports(library)]
            )
          )
        ],
        entries: [
          ...appPage,
          ...Object.values(options.config.components)
            .filter((component) => !component.library)
            .map((component) => component.path)
        ],
        ...productionDependencies(vite, options.root, options.renderer.developmentStandIns)
      },
      plugins: [
        guestPlugin(options, vite.normalizePath(options.rendererGuestPath)),
        moduleStyles(() => options.config.styles.map((path) => vite.normalizePath(resolve(options.root, path)))),
        elementSources(vite.normalizePath(options.root)),
        dependencySourceMaps(),
        appPageModes()
      ]
    })

    try {
      await server.listen()
      const client = server.environments.client

      if (!client) {
        throw new Error("Vite did not create its client environment")
      }

      await client.depsOptimizer?.init()
      await client.depsOptimizer?.scanProcessing
      // Finish the cold dependency graph before the browser imports it. A failed child import stays cached by URL,
      // so retrying only the guest module cannot recover from Vite replacing its optimized dependency hashes.
      const guest = viteGuestModule(options.config)

      const urls = await Promise.all(
        guest.imports.map(async (id) => {
          try {
            const resolved = await client.pluginContainer.resolveId(id)

            if (!resolved) {
              return
            }

            return resolved.id.startsWith("\0")
              ? `/@id/__x00__${resolved.id.slice(1)}`
              : `/@fs/${vite.normalizePath(resolved.id)}`
          } catch (error) {
            if (!guest.optional.has(id)) {
              throw error
            }

            return undefined
          }
        })
      )

      await warmGuestGraph(
        client,
        urls.filter((url) => url !== undefined)
      )
      const origin = server.resolvedUrls?.local[0]

      if (!origin) {
        throw new Error("Vite did not report a local URL")
      }

      const codeListeners = new Set<(change: CodeChange) => void>()

      const changes = gatherChanges((change) => {
        for (const listener of codeListeners) {
          listener(change)
        }
      })

      const root = vite.normalizePath(options.root)
      // Vite's own watcher, which already follows every file the guest imported. The list of components changes as the
      // type checker finds them, in place.
      server.watcher.on("change", (file) => {
        const components = Object.values(options.config.components)
          .filter((component) => !component.library)
          .map((component) => component.path)

        changes.add(stampChange(client.moduleGraph, vite.normalizePath(file), changes.stamp(), root, components))
      })

      const guestUrl = new URL(`/@id/__x00__${guestId}`, origin).href

      return {
        guestUrl,
        toolVersion: vite.version,
        restyledGuestUrl: (stamp) => restyledGuest(guestUrl, stamp),
        loadedFiles: (files) => loadedFiles(client.moduleGraph, root, files),
        codeChanges(listener) {
          codeListeners.add(listener)

          return () => codeListeners.delete(listener)
        },
        close: () => {
          changes.stop()

          return server.close()
        }
      }
    } catch (error) {
      await server.close()
      throw error
    }
  }
}

/**
 * Where the guest is served with its stylesheets as they are after a change (PAR-821): its address with the change's
 * stamp as a query. That's a module the windows haven't loaded, and Vite writes its imports of the stylesheets the
 * change stamped with `?t=`, so it brings the CSS as it is now; the guest plugin serves the guest whatever the query.
 */
export function restyledGuest(guestUrl: string, stamp: number): string {
  const url = new URL(guestUrl)
  url.searchParams.set("styles", String(stamp))

  return url.href
}

/** A port nothing on 127.0.0.1 is using: the one the system gives a listener asking for any, closed again. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const listener = createNetServer()
    listener.once("error", reject)
    listener.listen(0, loopback, () => {
      // SAFETY: a listener on a TCP port, once listening, has an address object; only pipes give a string.
      const { port } = listener.address() as AddressInfo
      listener.close(() => resolve(port))
    })
  })
}

/** Whether nothing on 127.0.0.1 is using a port. */
export function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const listener = createNetServer()
    listener.once("error", () => resolve(false))
    listener.listen(port, loopback, () => listener.close(() => resolve(true)))
  })
}

/**
 * Prebundles dependencies as their production builds, React's among them, as the dependency optimizer's own setting
 * (Rolldown's from Vite 8, esbuild's before). React's development build keeps a stack for every element it makes, which
 * across a project's frames was 723 thousand stack frames on the example project, and its warnings are for the
 * project's own dev server to show. The project's own modules are served as in development. A dependency that imports
 * what the production build leaves empty gets the renderer's stand-in, as the project's modules do: the optimizer runs
 * only its own plugins, not the server's. Its stand-in is placed beside the module importing it, so what the stand-in
 * imports (`@emotion/react/jsx-runtime`) is the copy that module would find, even one installed only below it.
 */
export function productionDependencies(
  vite: Pick<typeof Vite, "version"> & { rolldownVersion?: string },
  root: string,
  standIns: Record<string, string> = {}
) {
  const define = { "process.env.NODE_ENV": JSON.stringify("production") }

  const beside = (importer: string | undefined, specifier: string) =>
    join(importer && isAbsolute(importer) ? dirname(importer) : root, encodeURIComponent(specifier) + standInFile)

  const source = (path: string) =>
    developmentStandIn(decodeURIComponent(basename(path).slice(0, -standInFile.length)), standIns)

  // Vite keys its prebundled dependencies by its plugins' names, among the rest, so other stand-ins bundle them again.
  const name = `canvas:stand-ins:${createHash("sha1").update(JSON.stringify(standIns)).digest("base64url").slice(0, 8)}`

  if (vite.rolldownVersion) {
    const plugin = {
      name,
      resolveId: (id: string, importer?: string) => (developmentStandIn(id, standIns) ? beside(importer, id) : null),
      load: (id: string) => (id.endsWith(standInFile) ? source(id) : null)
    }

    return { rolldownOptions: { transform: { define }, plugins: [plugin] } }
  }

  const ends = Object.keys(standIns).map((end) => end.replaceAll(/[.*+?^${}()|[\]\\/]/g, "\\$&"))

  const plugin = {
    name,
    setup(build: EsbuildBuild) {
      if (ends.length === 0) {
        return
      }

      build.onResolve({ filter: new RegExp(`(?:${ends.join("|")})$`) }, ({ path, importer }) =>
        developmentStandIn(path, standIns) ? { path: beside(importer, path), namespace: "canvas-stand-in" } : undefined
      )
      build.onLoad({ filter: /.*/, namespace: "canvas-stand-in" }, ({ path }) => ({
        contents: source(path),
        loader: "js",
        resolveDir: dirname(path)
      }))
    }
  }

  return { esbuildOptions: { define, plugins: [plugin] } }
}

/** How the optimizer names a stand-in it places beside the module importing it, after the specifier it stands in for. */
const standInFile = ".canvas-stand-in.js"

/** The parts of esbuild's plugin build a stand-in uses, since the builder doesn't depend on esbuild itself. */
interface EsbuildBuild {
  onResolve(
    options: { filter: RegExp },
    resolve: (args: { path: string; importer: string }) => { path: string; namespace: string } | undefined
  ): void
  onLoad(
    options: { filter: RegExp; namespace: string },
    load: (args: { path: string }) => { contents: string | undefined; loader: "js"; resolveDir: string }
  ): void
}

/** The module a renderer serves in place of a bare specifier its production build leaves empty, if it does. */
export function developmentStandIn(specifier: string, standIns: Record<string, string> = {}): string | undefined {
  if (/^[./\0]/.test(specifier) || specifier.includes(":")) {
    return undefined
  }

  for (const [end, source] of Object.entries(standIns)) {
    if (specifier.endsWith(end) && specifier.length > end.length) {
      return source.replaceAll("$base", specifier.slice(0, -end.length))
    }
  }

  return undefined
}

/**
 * Where the guest's files come from. A built guest is one file. In development the guest is its source, which imports
 * core's value evaluator and icon names as source too, from where the guest's own package resolves them.
 */
function guestFolders(rendererGuestPath: string): string[] {
  if (!/\.tsx?$/.test(rendererGuestPath)) {
    return [dirname(rendererGuestPath)]
  }

  const evaluator = createRequire(rendererGuestPath).resolve("@parity-app/core/values/evaluate")

  return [dirname(rendererGuestPath), dirname(dirname(evaluator))]
}

function guestPlugin(options: BuilderStartOptions, rendererGuestPath: string): Vite.Plugin {
  return {
    name: "canvas:guest",
    enforce: "pre",
    async resolveId(id, importer) {
      if (id === guestId) {
        return `\0${guestId}`
      }

      if (id === rendererId) {
        return rendererGuestPath
      }

      // What a stand-in imports resolves as from the module that imported the stand-in, which its id names, so a
      // workspace package's own runtime is the one it gets. Vite resolves from an importer's folder only when it exists.
      const from = importer?.startsWith(`\0${standInId}`) && new URLSearchParams(importer.split("?")[1]).get("from")

      if (from) {
        return this.resolve(id, from, { skipSelf: true })
      }

      if (!developmentStandIn(id, options.renderer.developmentStandIns)) {
        return undefined
      }

      const file = importer?.split("?")[0]

      return `\0${standInId}${id}${file && isAbsolute(file) ? `?from=${encodeURIComponent(file)}` : ""}`
    },
    load(id) {
      if (id.startsWith(`\0${standInId}`)) {
        const specifier = id.slice(standInId.length + 1).split("?")[0] ?? ""

        return developmentStandIn(specifier, options.renderer.developmentStandIns)
      }

      // The canvas may add a cache-busting query when it retries a load.
      if (id.split("?")[0] !== `\0${guestId}`) {
        return undefined
      }

      return guestModuleSource(options.config)
    }
  }
}

/**
 * Tags each element the project's own JSX writes with its file, line and column (PAR-167), before the project's
 * framework plugin compiles it, so the canvas and agents can say where an element inside a component is written. It's
 * for the guest's development server alone: an installed package's files and a production build carry nothing. `root`
 * is the project root with forward slashes, as Vite gives module ids; a workspace package's files outside it are named
 * from the root too.
 */
export function elementSources(root: string): Vite.Plugin {
  return {
    name: "canvas:element-sources",
    enforce: "pre",
    apply: "serve",
    transform: (code, id) => taggedModule(root, code, id)
  }
}

/** A module's code with its elements tagged, when it's the project's own JSX. */
export function taggedModule(root: string, code: string, id: string): ReturnType<typeof tagElementSources> {
  const file = id.split("?")[0] ?? id

  if (file.startsWith("\0") || file.includes("/node_modules/") || !hasElementSources(file)) {
    return undefined
  }

  return tagElementSources(code, posix.relative(root, file))
}

/**
 * The module the canvas imports: the renderer's guest runtime, the project's styles and components, its icon packages,
 * and what its libraries' decorators import, with each stylesheet imported as text.
 */
export function guestModuleSource(config: ProjectConfig): string {
  return viteGuestModule(config).source
}

function viteGuestModule(config: ProjectConfig): GuestModule {
  const module = guestModule(config, {
    renderer: rendererId,
    projectPath: rootPath,
    styles: "inline",
    moduleStyles: moduleStylesId
  })

  // A framework plugin that wraps the app's modules for Fast Refresh, as React Router's does, throws unless the page
  // installed Fast Refresh's preamble first. The guest has no HMR client and refreshes nothing, so before any of the
  // app's modules load it says the preamble is there, with hooks that do nothing, as the preamble's own do.
  const preamble = [
    "globalThis.__vite_plugin_react_preamble_installed__ ??= true",
    "globalThis.$RefreshReg$ ??= () => {}",
    "globalThis.$RefreshSig$ ??= () => (type) => type"
  ]

  return { ...module, source: [...preamble, module.source].join("\n") }
}

/** The modules an icon set's icons are imported from: its own, and those of styles kept in modules of their own. */
function iconImports(library: LibraryInfo): string[] {
  if (library.kind !== "icons") {
    return []
  }

  return [
    library.icons?.import,
    ...iconStyleModules(library.icons, library.importName).map((style) => style.import)
  ].filter((specifier) => specifier !== undefined)
}

function rootPath(path: string): string {
  return `/${path.replaceAll("\\", "/").replace(/^\.?\//, "")}`
}

/**
 * Asks the project's own Vite for its config, the way `vite` finds it, so every name Vite accepts counts
 * (`vite.config.cjs`, `.cts` and `.mts` too). Loading it runs it, as `vite` does.
 */
export async function detectVite(root: string): Promise<BuilderDetection> {
  let vite: typeof Vite

  try {
    vite = await loadProjectVite(root)
  } catch {
    const named = (await readdir(root).catch(() => [])).find((name) => viteConfigFiles.includes(name))

    return {
      found: false,
      summary: named
        ? `${named} is here, but Vite isn't installed: install the project's packages first`
        : "No Vite installed and no vite.config file"
    }
  }

  let loaded: Awaited<ReturnType<typeof vite.loadConfigFromFile>>

  try {
    const named = await scriptedConfig(root)
    loaded = await vite.loadConfigFromFile({ command: "serve", mode: "development" }, named, root, "silent")
  } catch (error) {
    throw new Error(
      `Vite ${vite.version} couldn't load the project's config: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }

  if (!loaded) {
    return {
      found: false,
      version: vite.version,
      summary: `Vite ${vite.version} is installed, but it found no vite.config (${scriptConfigExtensions.map((extension) => `.${extension}`).join(", ")})`
    }
  }

  const config = relative(root, loaded.path).replaceAll("\\", "/")

  return { found: true, version: vite.version, config, summary: `Vite ${vite.version}, config ${config}` }
}

/** Runs Vite's dev server: `vite`, `vite dev` or `vite serve`, not `vite build`, `vitest` or `vite-node`. */
const viteServe = /(?:^|[\s;&|(])vite(?![\w.-])(?!\s+(?:build|preview|optimize)\b)/

/**
 * The config the project's dev script names with `--config` or `-c`, as an absolute path. Unset when it names none, so
 * Vite looks for its usual names.
 */
export async function scriptedConfig(root: string): Promise<string | undefined> {
  const file = join(root, "package.json")
  const text = await readFile(file, "utf8").catch(() => undefined)
  const script = text === undefined ? undefined : scriptRunning(parseManifest(text, file).scripts, viteServe)
  const named = script && commandOption(script[1], ["-c", "--config"])

  return named ? resolve(root, named) : undefined
}

/**
 * The project's own Vite, from `node_modules` in its folder or one above, the way Node finds packages. Not through
 * `require.resolve`, which also looks in `NODE_PATH`: package manager scripts set it, and it would find Parity's Vite.
 */
export async function loadProjectVite(root: string): Promise<typeof Vite> {
  let folder: string | undefined

  for (let candidate = resolve(root); ; candidate = dirname(candidate)) {
    if (await isFile(join(candidate, "node_modules", "vite", "package.json"))) {
      folder = await realpath(join(candidate, "node_modules", "vite"))
      break
    }

    if (dirname(candidate) === candidate) {
      throw new Error(`Vite is not installed in ${root}`)
    }
  }

  const file = join(folder, "package.json")
  const { exports } = parseManifest(await readFile(file, "utf8"), file)

  const entry = resolveImportCondition(isComposite(exports) && !Array.isArray(exports) ? exports["."] : undefined)

  // SAFETY: the file is the ESM entry Vite's own package.json names, so its exports are Vite's API.
  return (await import(pathToFileURL(join(folder, entry)).href)) as typeof Vite
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isFile(),
    () => false
  )
}

function resolveImportCondition(target: ExportsTarget | undefined): string {
  if (isText(target)) {
    return target
  }

  if (isComposite(target) && !Array.isArray(target)) {
    for (const condition of ["import", "node", "default"]) {
      const next = target[condition]

      if (next !== undefined) {
        return resolveImportCondition(next)
      }
    }
  }

  throw new Error("Could not find Vite's ESM entry")
}
