import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, posix } from "node:path"
import { importSpecifiers } from "@parity-app/code"
import { type AppStyles } from "@parity-app/core"
import { isStylesheetFile, readStylesheet } from "@parity-app/project"
import type * as Vite from "vite"
import { loadProjectVite, scriptedConfig } from "./builder.ts"

/*
 * Which global stylesheets an app loads, asked of the project's own Vite (`BuilderAdapter.styles`). Vite has no list of
 * them until it has compiled the app, so this compiles the app's entries with the project's config and plugins, as its
 * dev server would for a page, and follows their static imports until it reaches modules that import stylesheets. The
 * entries are whatever the config builds: `index.html` and the module scripts it loads, or a framework's own client
 * entry, as TanStack Start's is.
 */

/** A stylesheet one of the app's modules imports, and how many of the project's own modules deep that module is. */
interface Imported {
  file: string
  importer: string
  depth: number
}

/** What the walk found: the stylesheets, and the app's own files it read on the way, from the entries in. */
interface Walked {
  found: Imported[]
  read: string[]
}

/** The most modules followed: an app's entry reaches its root module long before this, packages included. */
const moduleLimit = 5000

/**
 * The global stylesheets the app at `root` loads, as its own Vite resolves them. They're the ones the app's root module
 * imports: the shallowest the app's own modules import, counting only the project's modules, since a framework reaches
 * the app's root through its own. When modules that deep import different stylesheets, as a router's root and one of
 * its pages do, the ones holding the theme (custom properties on `:root` or in `@theme`) are the root's.
 */
export async function viteAppStyles(root: string): Promise<AppStyles> {
  root = await realpath(root)
  const vite = await loadProjectVite(root)
  // A folder of its own for anything Vite writes, thrown away after, so the builder's and the project's aren't touched.
  const cacheDir = await mkdtemp(join(tmpdir(), "parity-vite-styles-"))

  const options: Vite.InlineConfig = {
    root,
    configFile: await scriptedConfig(root),
    cacheDir,
    clearScreen: false,
    logLevel: "silent",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    plugins: [withoutOptimizer()]
  }

  const client = await clientGraph(vite, options)

  try {
    const base = vite.normalizePath(root)

    return await appStyles(await importedStyles(client, base), base, client)
  } finally {
    await client.close()
    await rm(cacheDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

/**
 * Turns off the dependency optimizer, which plugins switch on with packages of their own: nothing here runs, so bundling
 * the packages, from a cold cache every time, would only slow the answer down.
 */
function withoutOptimizer(): Vite.Plugin {
  return {
    name: "parity:app-styles-without-optimizer",
    configResolved(config) {
      // Vite 5 has no environments.
      const environments = Object.values(config.environments ?? {}).map((environment) => environment.optimizeDeps)

      for (const options of [config.optimizeDeps, ...environments]) {
        options.noDiscovery = true
        options.include = []
      }
    }
  }
}

/** A module Vite has compiled: its URL, its file when it has one, and the URLs of what it imports statically. */
interface GraphModule {
  url: string
  file: string | null
  imports: string[]
}

/** The client's side of the project's Vite: its entries, and compiling and reading its modules. */
interface ClientGraph {
  /** The config's client entries, as `build.rollupOptions.input` names them. */
  input: string[]
  transform(url: string): Promise<void>
  module(url: string): Promise<GraphModule | undefined>
  resolve(id: string, importer?: string): Promise<string | undefined>
  close(): Promise<void>
}

/** A module node as Vite's module graphs keep them, the environment's and Vite 5's alike. */
interface ViteModule {
  url: string
  file: string | null
  staticImportedUrls?: Set<string>
  importedModules: Set<{ url: string }>
}

/** An entry as a config names it: one, a list, or a record of them by name. */
type InputOption = string | string[] | Record<string, string>

/**
 * The client's environment alone, from the project's resolved config: no dev server, so no plugin's `configureServer`
 * runs, as Cloudflare's does to start a worker runtime it never stops without one. Vite 5 has no environments, so there
 * it's a dev server's, in middleware mode.
 */
async function clientGraph(vite: typeof Vite, options: Vite.InlineConfig): Promise<ClientGraph> {
  if (Number(vite.version.split(".")[0]) < 6) {
    const server = await vite.createServer(options)

    return {
      input: configInput(server.config.build),
      transform: async (url) => {
        await server.transformRequest(url)
      },
      module: async (url) => graphModule(await server.moduleGraph.getModuleByUrl(url)),
      resolve: async (id, importer) => (await server.pluginContainer.resolveId(id, importer))?.id,
      close: () => server.close()
    }
  }

  const config = await vite.resolveConfig(options, "serve", "development")
  const client = new vite.DevEnvironment("client", config, { hot: false })
  await client.init()
  const { build } = client.config

  return {
    input: configInput(build),
    transform: async (url) => {
      await client.transformRequest(url)
    },
    module: async (url) => graphModule(await client.moduleGraph.getModuleByUrl(url)),
    resolve: async (id, importer) => (await client.pluginContainer.resolveId(id, importer))?.id,
    close: () => client.close()
  }
}

/** What of a module node the walk reads: its static imports, or every import where Vite doesn't keep those apart. */
function graphModule(node: ViteModule | undefined): GraphModule | undefined {
  if (!node) {
    return undefined
  }

  const imports = node.staticImportedUrls
    ? [...node.staticImportedUrls]
    : [...node.importedModules].map((child) => child.url)

  return { url: node.url, file: node.file, imports }
}

/** Where a resolved config's build options name its entries, in whichever of Vite's versions resolved it. */
interface BuildInputs {
  rolldownOptions?: { input?: InputOption }
  rollupOptions?: { input?: InputOption }
}

/**
 * The client entries a resolved config names. Vite 8 keeps them under `rolldownOptions`, with `rollupOptions` for the
 * configs that say that; Vite 6 and 7 have only `rollupOptions`.
 */
export function configInput(build: BuildInputs): string[] {
  return inputList(build.rolldownOptions?.input ?? build.rollupOptions?.input)
}

/** The entries a config names, in order. */
function inputList(input: InputOption | undefined): string[] {
  if (input === undefined) {
    return []
  }

  if (Array.isArray(input)) {
    return input
  }

  return input instanceof Object ? Object.values(input) : [input]
}

/**
 * The stylesheets the shallowest of the app's modules import: the entries' (and `index.html`'s `<link>`s) first, then
 * each level of the project's own modules further in, stopping at the first that imports any. Packages are followed
 * only on the way from an entry to the app, as a framework's client entry reaches the app's router: what the app's own
 * modules import from packages isn't the app.
 */
async function importedStyles(client: ClientGraph, root: string): Promise<Walked> {
  const { modules, links, pages } = await entries(client, root)
  const found: Imported[] = []

  const own = (file: string | null | undefined): file is string =>
    !!file && file.startsWith(`${root}/`) && !file.includes("/node_modules/")

  const seen = new Set<string>()
  const read = new Set(pages)
  let level = modules

  for (let depth = 0; level.length > 0 && found.length === 0 && seen.size < moduleLimit; depth++) {
    const deeper: string[] = []
    // The framework's modules on the way count as no step deeper: only the app's own do.
    let frontier = level

    while (frontier.length > 0 && seen.size < moduleLimit) {
      const batch = frontier.filter((url) => !seen.has(url))
      frontier = []

      for (const url of batch) {
        seen.add(url)
      }

      const imports = await Promise.all(batch.map((url) => staticImports(client, url)))

      for (const { module, imported } of imports) {
        const fromApp = own(module?.file)

        if (fromApp) {
          read.add(module!.file!)
        }

        for (const child of imported) {
          if (isStylesheetFile(child.url)) {
            if (fromApp && isGlobalStylesheet(child.url)) {
              found.push({ file: (child.file ?? child.url).split("?")[0]!, importer: module!.file!, depth })
            }
          } else if (own(child.file)) {
            deeper.push(child.url)
          } else if (!fromApp || !child.file) {
            // A plugin's virtual module stands for the app's code, whoever imports it.
            frontier.push(child.url)
          }
        }
      }
    }

    level = deeper
  }

  return { found: [...links, ...found], read: [...read] }
}

/** A module's static imports, once Vite has compiled it; none when it can't, as for a file a plugin rejects. */
async function staticImports(
  client: ClientGraph,
  url: string
): Promise<{ module: GraphModule | undefined; imported: GraphModule[] }> {
  try {
    await client.transform(url)
  } catch {
    return { module: undefined, imported: [] }
  }

  const module = await client.module(url)

  if (!module) {
    return { module, imported: [] }
  }

  const imported = await Promise.all(module.imports.map((child) => client.module(child)))

  return { module, imported: imported.filter((child) => child !== undefined) }
}

/**
 * A stylesheet the page loads as it is: imported plainly or for its URL (`?url`, as a root route's `<link>` is), not a
 * CSS module scoped to a component or a stylesheet read as text (`?inline`, `?raw`).
 */
function isGlobalStylesheet(url: string): boolean {
  const [path, query = ""] = url.split("?")

  return !/\.module\.[^./]+$/.test(path!) && !/(?:^|&)(?:inline|raw)(?:&|=|$)/.test(query)
}

/**
 * Where the app starts, as the config builds it: its client entries, as module URLs, and for an HTML entry the module
 * scripts and stylesheets it loads, with the HTML files read.
 */
async function entries(
  client: ClientGraph,
  root: string
): Promise<{ modules: string[]; links: Imported[]; pages: string[] }> {
  const modules: string[] = []
  const links: Imported[] = []
  const pages: string[] = []
  // A config may name them with Windows separators, as `path.resolve(__dirname, "index.html")` gives.
  const named = client.input.map((entry) => entry.replaceAll("\\", "/"))

  for (const entry of named.length > 0 ? named : ["index.html"]) {
    if (!entry.endsWith(".html")) {
      modules.push(await moduleUrl(client, root, entry))
      continue
    }

    const file = posix.isAbsolute(entry) || /^[A-Za-z]:\//.test(entry) ? entry : posix.join(root, entry)
    const html = await readFile(file, "utf8").catch(() => undefined)

    if (html === undefined) {
      continue
    }

    pages.push(file)

    // A tag in a comment isn't loaded.
    for (const tag of html.replaceAll(/<!--[\s\S]*?-->/g, "").matchAll(/<(script|link)\b([^>]*)>/gi)) {
      const attributes = tag[2]!

      const value = (name: string) =>
        new RegExp(String.raw`\b${name}\s*=\s*["']([^"']+)["']`, "i").exec(attributes)?.[1]

      const src = value("src")
      const href = value("href")

      if (tag[1]!.toLowerCase() === "script" && value("type") === "module" && src && isPageLocal(src)) {
        modules.push(await moduleUrl(client, root, pageRelative(src), file))
      } else if (value("rel")?.toLowerCase() === "stylesheet" && href && isPageLocal(href)) {
        const linked = await linkedFile(root, file, href)

        if (linked) {
          links.push({ file: linked, importer: file, depth: 0 })
        }
      }
    }
  }

  return { modules, links, pages }
}

/** Whether a page's URL is the project's own file: not another origin (`https:`, `//cdn…`) or inline (`data:`). */
function isPageLocal(url: string): boolean {
  return !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)
}

/** A page's relative URL as a module specifier: `src/main.ts` in HTML is relative, where it would name a package. */
function pageRelative(url: string): string {
  return url.startsWith("/") || url.startsWith(".") ? url : `./${url}`
}

/**
 * The file a page's stylesheet `<link>` loads: a root-relative `href` from the project's root, or from its `public`
 * folder, where Vite serves it from; any other from the page's own folder. Nothing when there's no such file.
 */
async function linkedFile(root: string, page: string, href: string): Promise<string | undefined> {
  const path = decodeURI(href.split(/[?#]/)[0]!)

  const candidates = path.startsWith("/")
    ? [posix.join(root, path), posix.join(root, "public", path)]
    : [posix.join(posix.dirname(page), path)]

  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      return candidate
    }
  }

  return undefined
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isFile(),
    () => false
  )
}

/** The URL Vite compiles an entry by: a project file's path from the root, else its resolved id. */
async function moduleUrl(client: ClientGraph, root: string, id: string, importer?: string): Promise<string> {
  const resolved = await client.resolve(id, importer)

  if (!resolved) {
    return id
  }

  if (resolved.startsWith(`${root}/`)) {
    return `/${resolved.slice(root.length + 1)}`
  }

  return resolved.startsWith("\0") || !posix.isAbsolute(resolved.replace(/^[A-Za-z]:/, ""))
    ? resolved
    : `/@fs/${resolved}`
}

/**
 * What the app loads, from the stylesheets the shallowest modules import: one module's, or, when several import some,
 * those of the ones whose stylesheets hold the theme (all of them when none do), and the page's `<link>`s. The
 * project's own stylesheets are named by their path, and packages' by the specifier the app imports them by. The
 * answer comes from every app file the walk read, so a stylesheet imported in one later is a change it sees.
 */
async function appStyles({ found, read }: Walked, root: string, client: ClientGraph): Promise<AppStyles> {
  const byImporter = new Map<string, string[]>()

  for (const { file, importer } of found) {
    byImporter.set(importer, [...new Set([...(byImporter.get(importer) ?? []), file])])
  }

  // In the order the walk met them, the order the app loads them in, so the cascade stays as it is. A page's `<link>`s
  // are global whatever they hold.
  const all = [...byImporter.keys()]
  const pages = all.filter((importer) => importer.endsWith(".html"))
  let importers = all.filter((importer) => !importer.endsWith(".html"))

  if (importers.length > 1) {
    const themed = await Promise.all(
      importers.map(async (importer) => {
        const holds = await Promise.all(byImporter.get(importer)!.map(holdsTheme))

        return holds.some(Boolean)
      })
    )

    const withTheme = importers.filter((_, index) => themed[index])

    if (withTheme.length > 0) {
      importers = withTheme
    }
  }

  importers = [...pages, ...importers]

  const styles: string[] = []
  const packageStyles: string[] = []

  const own = (file: string) => file.startsWith(`${root}/`) && !file.includes("/node_modules/")
  const seen = new Set<string>()

  for (const importer of importers) {
    for (const file of byImporter.get(importer)!) {
      if (seen.has(file)) {
        continue
      }

      seen.add(file)

      if (own(file)) {
        styles.push(file.slice(root.length + 1))
        continue
      }

      const specifier = await importedAs(client, importer, file)

      if (specifier) {
        packageStyles.push(specifier)
      }
    }
  }

  const relative = (file: string) => file.slice(root.length + 1)
  const sources = importers.filter(own).map(relative)
  const from = [...new Set([...sources, ...read.filter(own).map(relative).sort()])]

  return { styles, packageStyles, from }
}

/** Custom properties on the document's root (`:root`, `html`, `:host`) or in Tailwind's `@theme`: a theme's tokens. */
const themeTokens = /@theme\b|(?:^|[\s,}])(?::root|html|:host)\b[^{}]*\{[^}]*--[\w-]+\s*:/

/** Whether a stylesheet, with the files it `@import`s by a relative path, defines the theme's tokens. */
async function holdsTheme(file: string): Promise<boolean> {
  return themeTokens.test(await readStylesheet(file))
}

/**
 * The specifier `importer` imports a package's stylesheet by, as it's written there (`fake-ui/styles.css`), which the
 * package's `exports` allow, where the file's own path may not be. Nothing when no bare import of a stylesheet in the
 * importer's source resolves to it, as when a plugin added the import.
 */
async function importedAs(client: ClientGraph, importer: string, file: string): Promise<string | undefined> {
  const source = await readFile(importer, "utf8").catch(() => "")
  const bare = importSpecifiers(source).filter((specifier) => isStylesheetFile(specifier) && !/^[./]/.test(specifier))

  for (const specifier of bare) {
    const resolved = await client.resolve(specifier, importer).catch(() => undefined)

    if (resolved?.split("?")[0] === file) {
      return specifier.split("?")[0]
    }
  }

  return undefined
}
