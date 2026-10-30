import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { type AddressInfo, createServer as createNetServer } from "node:net"
import { dirname, join, relative, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  type BuilderAdapter,
  type BuilderDetection,
  type BuilderStartOptions,
  commandOption,
  describedCategories,
  describedTokenCss,
  iconStyleModules,
  isMadeValue,
  type LibraryInfo,
  libraryImports,
  type PackageManifest,
  type ProjectConfig,
  scriptRunning
} from "@parity-app/core"
import type * as Vite from "vite"
import { dependencySourceMaps } from "./dependency-maps.ts"

/** Only used to explain a miss: the config itself is found by the project's own Vite. */
const configPattern = /^vite\.config\.[cm]?[jt]s$/
const guestId = "virtual:canvas/guest"
const rendererId = "virtual:canvas/renderer"
/** Followed by the specifier a development stand-in serves in place of. */
const standInId = "virtual:canvas/stand-in/"
const loopback = "127.0.0.1"

/** Serves a project's components with the project's own Vite install and config. */
export const viteBuilder: BuilderAdapter = {
  id: "vite",
  name: "Vite",
  detect: detectVite,
  async start(options) {
    const vite = await loadProjectVite(options.root)
    const configFile = await scriptedConfig(options.root)
    const port = options.port !== undefined && (await portFree(options.port)) ? options.port : await freePort()
    const server = await vite.createServer({
      root: options.root,
      ...(configFile ? { configFile } : {}),
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
        fs: { allow: [vite.searchForWorkspaceRoot(options.root), dirname(options.rendererGuestPath)] }
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
        entries: Object.values(options.config.components)
          .filter((component) => !component.library)
          .map((component) => component.path),
        ...productionDependencies(vite)
      },
      plugins: [guestPlugin(options, vite.normalizePath(options.rendererGuestPath)), dependencySourceMaps()]
    })
    await server.listen()
    const origin = server.resolvedUrls?.local[0]
    if (!origin) {
      await server.close()
      throw new Error("Vite did not report a local URL")
    }
    return {
      guestUrl: new URL(`/@id/__x00__${guestId}`, origin).href,
      toolVersion: vite.version,
      close: () => server.close()
    }
  }
}

/** A port nothing on 127.0.0.1 is using: the one the system gives a listener asking for any, closed again. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const listener = createNetServer()
    listener.once("error", reject)
    listener.listen(0, loopback, () => {
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
 * project's own dev server to show. The project's own modules are served as in development.
 */
export function productionDependencies(vite: Pick<typeof Vite, "version"> & { rolldownVersion?: string }) {
  const define = { "process.env.NODE_ENV": JSON.stringify("production") }
  return vite.rolldownVersion ? { rolldownOptions: { transform: { define } } } : { esbuildOptions: { define } }
}

/** The module a renderer serves in place of a bare specifier its production build leaves empty, if it does. */
export function developmentStandIn(specifier: string, standIns: Record<string, string> = {}): string | undefined {
  if (/^[./\0]/.test(specifier) || specifier.includes(":")) return undefined
  for (const [end, source] of Object.entries(standIns)) {
    if (specifier.endsWith(end) && specifier.length > end.length) {
      return source.replaceAll("$base", specifier.slice(0, -end.length))
    }
  }
  return undefined
}

function guestPlugin(options: BuilderStartOptions, rendererGuestPath: string): Vite.Plugin {
  return {
    name: "canvas:guest",
    enforce: "pre",
    resolveId(id) {
      if (id === guestId) return `\0${guestId}`
      if (id === rendererId) return rendererGuestPath
      if (developmentStandIn(id, options.renderer.developmentStandIns)) return `\0${standInId}${id}`
      return undefined
    },
    load(id) {
      if (id.startsWith(`\0${standInId}`)) {
        return developmentStandIn(id.slice(standInId.length + 1), options.renderer.developmentStandIns)
      }
      // The canvas may add a cache-busting query when it retries a load.
      if (id.split("?")[0] !== `\0${guestId}`) return undefined
      return guestModuleSource(options.config)
    }
  }
}

/**
 * The module the canvas imports: the renderer's guest runtime, the project's styles and components, its icon packages,
 * and what its libraries' decorators import. A decorator's module that fails to load is passed on as its error, so one
 * missing provider doesn't stop the project from rendering.
 */
export function guestModuleSource(config: ProjectConfig): string {
  const imports: string[] = []
  const optional = new Set<string>()
  const ref = (id: string) => {
    if (!imports.includes(id)) imports.push(id)
    return `modules[${imports.indexOf(id)}]`
  }
  const renderer = ref(rendererId)
  const packageStyleRefs = (config.packageStyles ?? []).map((specifier) => `${ref(`${specifier}?inline`)}.default`)
  const styleRefs = config.styles.map((path) => `${ref(`${rootPath(path)}?inline`)}.default`)
  // A library's components are imported by package name, which the project's own resolution finds. A project module
  // that fails to load (a server import, a syntax error) only costs its own components, which then show why. The rest
  // of the app, pages included, loads a module the first time one of its components is drawn: importing it all at once
  // took copacker 14 seconds.
  // A workspace package is the app's own code too, and may not build.
  const workspaceLibraries = new Set(config.libraries.filter((library) => library.workspace).map(({ id }) => id))
  const entries = Object.entries(config.components)
  const componentRefs = entries
    .filter(([, source]) => !source.lazy)
    .map(([id, source]) => {
      if (source.library && !workspaceLibraries.has(source.library)) {
        return `    ${JSON.stringify(id)}: ${ref(source.path)}${member(source.export)}`
      }
      const path = source.library ? source.path : rootPath(source.path)
      optional.add(path)
      const module = ref(path)
      return `    ${JSON.stringify(id)}: ${module}.loadError ? failed(${module}.loadError) : ${module}${member(source.export)}`
    })
  const lazyRefs = entries
    .filter(([, source]) => source.lazy)
    .map(([id, source]) => {
      const load = `import(${JSON.stringify(rootPath(source.path))})`
      return `    ${JSON.stringify(id)}: () => ${load}.then((module) => module${member(source.export)}, (error) => failed(String(error?.message ?? error)))`
    })
  // Icon packages come in whole, since any of their icons can be used; the dev server pre-bundles each one.
  const iconRefs = config.libraries
    .filter((library) => library.kind === "icons")
    .map((library) => {
      const icons = library.icons
      const set = [`module: ${ref(importOf(library, icons?.import))}`]
      // Its other styles' modules, by the key their icons' ids name them with (`heroicons/16/solid/CogIcon`).
      const styles = iconStyleModules(icons, library.package).map(
        (style) => `${JSON.stringify(style.key)}: ${ref(importOf(library, style.import))}`
      )
      if (styles.length > 0) set.push(`styles: { ${styles.join(", ")} }`)
      if (icons?.match) set.push(`match: ${JSON.stringify(icons.match)}`)
      if (icons?.exclude) set.push(`exclude: ${JSON.stringify(icons.exclude)}`)
      if (icons && icons.render !== "export") {
        const module = ref(importOf(library, icons.render.import))
        set.push(
          `renderer: { component: ${module}${member(icons.render.component)}, prop: ${JSON.stringify(icons.render.prop)} }`
        )
      }
      return `    ${JSON.stringify(library.id)}: { ${set.join(", ")} }`
    })
  const decorated = config.libraries.flatMap((library) =>
    (library.decorators ?? []).map((decorator) => ({ library: library.id, decorator }))
  )
  // And the packages whose functions make values in its components' samples (`createTreeCollection`), which designs
  // hold once the components are inserted.
  const decoratorModules = [
    ...new Set([
      ...config.libraries.flatMap((library) => libraryImports(library)),
      ...Object.values(config.components).flatMap((source) => madeImports(source.sample))
    ])
  ]
  for (const id of decoratorModules) {
    if (!imports.includes(id)) optional.add(id)
    ref(id)
  }
  const described = (config.describedTokens ?? []).flatMap((source) => source.tokens)
  const libraryCss = describedTokenCss(described)
  const loads = imports.map((id) =>
    optional.has(id)
      ? `import(${JSON.stringify(id)}).catch((error) => ({ loadError: String(error?.message ?? error) }))`
      : `import(${JSON.stringify(id)})`
  )
  return [
    `const modules = await Promise.all([${loads.join(", ")}])`,
    "// A component whose module didn't load throws why when it's drawn, and its frame shows the error in its place.",
    "const failed = (error) => () => { throw new Error(`its module didn't load: ${error}`) }",
    `export default ${renderer}.createGuest({`,
    // Tokens libraries only create at run time come first, so the project's own declarations still win.
    `  css: [${[...(libraryCss ? [JSON.stringify(libraryCss)] : []), ...styleRefs].join(", ")}].join("\\n"),`,
    ...(packageStyleRefs.length > 0 ? [`  packageCss: [${packageStyleRefs.join(", ")}].join("\\n"),`] : []),
    "  components: {",
    componentRefs.join(",\n"),
    "  },",
    "  lazyComponents: {",
    lazyRefs.join(",\n"),
    "  },",
    "  iconSets: {",
    iconRefs.join(",\n"),
    "  },",
    "  decorators: {",
    `    list: ${JSON.stringify(decorated)},`,
    `    modules: { ${decoratorModules.map((id) => `${JSON.stringify(id)}: ${ref(id)}`).join(", ")} }`,
    "  },",
    `  tokenCategories: ${JSON.stringify(describedCategories(described))}`,
    "})",
    ""
  ].join("\n")
}

/** The modules a sample's values made by calling a package's function come from. */
function madeImports(value: unknown): string[] {
  if (isMadeValue(value)) return [value.$call.import, ...(value.args ?? []).flatMap(madeImports)]
  if (Array.isArray(value)) return value.flatMap(madeImports)
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(madeImports)
  return []
}

/** An export path as property access: `Button` is `["Button"]`, and `Dialog.Root` reads into the namespace. */
function member(path: string): string {
  return path
    .split(".")
    .map((part, index) => `${index === 0 ? "" : "?."}[${JSON.stringify(part)}]`)
    .join("")
}

/** The modules an icon set's icons are imported from: its own, and those of styles kept in modules of their own. */
function iconImports(library: LibraryInfo): string[] {
  if (library.kind !== "icons") return []
  return [library.icons?.import, ...iconStyleModules(library.icons, library.package).map((style) => style.import)]
    .filter((specifier) => specifier !== undefined)
    .map((specifier) => importOf(library, specifier))
}

/** A library module by the name the project depends on it by, which can be an alias of the package. */
function importOf(library: LibraryInfo, specifier: string | undefined): string {
  if (!specifier || specifier === library.package) return library.importName
  return specifier.startsWith(`${library.package}/`)
    ? library.importName + specifier.slice(library.package.length)
    : specifier
}

function rootPath(path: string): string {
  return `/${path.replaceAll("\\", "/").replace(/^\.?\//, "")}`
}

/**
 * Asks the project's own Vite for its config, the way `vite` finds it, so every name Vite accepts counts
 * (`vite.config.cjs`, `.cts` and `.mts` too). Loading it runs it, as `vite` does.
 */
async function detectVite(root: string): Promise<BuilderDetection> {
  let vite: typeof Vite
  try {
    vite = await loadProjectVite(root)
  } catch {
    const named = (await readdir(root).catch(() => [])).find((name) => configPattern.test(name))
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
      summary: `Vite ${vite.version} is installed, but it found no vite.config (.js, .mjs, .ts, .cjs, .mts or .cts)`
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
async function scriptedConfig(root: string): Promise<string | undefined> {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8").catch(() => "{}")) as PackageManifest
  const script = scriptRunning(pkg.scripts, viteServe)
  const named = script && commandOption(script[1], ["-c", "--config"])
  return named ? resolve(root, named) : undefined
}

/**
 * The project's own Vite, from `node_modules` in its folder or one above, the way Node finds packages. Not through
 * `require.resolve`, which also looks in `NODE_PATH`: package manager scripts set it, and it would find Parity's Vite.
 */
async function loadProjectVite(root: string): Promise<typeof Vite> {
  let folder: string | undefined
  for (let candidate = resolve(root); ; candidate = dirname(candidate)) {
    if (await isFile(join(candidate, "node_modules", "vite", "package.json"))) {
      folder = await realpath(join(candidate, "node_modules", "vite"))
      break
    }
    if (dirname(candidate) === candidate) throw new Error(`Vite is not installed in ${root}`)
  }
  const manifest = JSON.parse(await readFile(join(folder, "package.json"), "utf8")) as {
    exports?: Record<string, unknown>
  }
  const entry = resolveImportCondition(manifest.exports?.["."])
  return (await import(pathToFileURL(join(folder, entry)).href)) as typeof Vite
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isFile(),
    () => false
  )
}

function resolveImportCondition(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "object" && value !== null) {
    for (const condition of ["import", "node", "default"]) {
      if (condition in value) return resolveImportCondition((value as Record<string, unknown>)[condition])
    }
  }
  throw new Error("Could not find Vite's ESM entry")
}
