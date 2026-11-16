import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, posix } from "node:path"
import { importSpecifiers } from "@parity-app/code"
import { type AppStyles } from "@parity-app/core"
import { chooseAppStyles, type Imported, isStylesheetFile, type Walked } from "@parity-app/project"
import type * as Vite from "vite"
import { loadProjectVite, scriptedConfig } from "./builder.ts"

/*
 * Which global stylesheets an app loads, asked of the project's own Vite (`BuilderAdapter.styles`). Vite has no list of
 * them until it has compiled the app, so this compiles the app's entries with the project's config and plugins, as its
 * dev server would for a page, and follows their static imports until it reaches modules that import stylesheets. The
 * entries are whatever the config builds: `index.html` and the module scripts it loads, or a framework's own client
 * entry, as TanStack Start's is.
 */

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
    return await stylesIn(vite, client, root)
  } finally {
    await client.close()
    await rm(cacheDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

/**
 * The global stylesheets the app at `root` loads, read with a Vite server that's already running: the builder's own, so
 * finding them doesn't load the project's config and plugins a second time (PAR-1182). It compiles the same modules
 * the guest will import anyway, through the same environment, so the guest's warm-up reuses them.
 */
export async function serverAppStyles(vite: typeof Vite, server: Vite.ViteDevServer, root: string): Promise<AppStyles> {
  const client = server.environments.client

  if (!client) {
    throw new Error("Vite did not create its client environment")
  }

  return stylesIn(vite, environmentGraph(vite, client), root)
}

/** The stylesheets the app's modules, as `client` compiles them, import: see `viteAppStyles`. */
async function stylesIn(vite: typeof Vite, client: ClientGraph, root: string): Promise<AppStyles> {
  const base = vite.normalizePath(root)

  return chooseAppStyles(await importedStyles(client, base), base, (specifier, importer) =>
    client.resolve(specifier, importer)
  )
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
  /** The specifiers a module's code imports statically, parsed as Vite parses it; nothing when it isn't valid code. */
  staticSpecifiers(code: string): string[] | undefined
  /** The extensions Vite tries for an import that names none (`./app`), in its order. */
  extensions: string[]
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
  const staticSpecifiers = (code: string) => parsedSpecifiers(vite, code)

  if (Number(vite.version.split(".")[0]) < 6) {
    const server = await vite.createServer(options)

    return {
      input: configInput(server.config.build),
      transform: async (url) => {
        await server.transformRequest(url)
      },
      module: async (url) => graphModule(await server.moduleGraph.getModuleByUrl(url)),
      resolve: async (id, importer) => (await server.pluginContainer.resolveId(id, importer))?.id,
      staticSpecifiers,
      extensions: server.config.resolve.extensions,
      close: () => server.close()
    }
  }

  const config = await vite.resolveConfig(options, "serve", "development")
  const client = new vite.DevEnvironment("client", config, { hot: false })
  await client.init()

  return { ...environmentGraph(vite, client), close: () => client.close() }
}

/** A Vite 6+ client environment as the walk reads it. Closing it is left to whoever made it. */
function environmentGraph(vite: typeof Vite, client: Vite.DevEnvironment): ClientGraph {
  return {
    input: configInput(client.config.build),
    transform: async (url) => {
      await client.transformRequest(url)
    },
    module: async (url) => graphModule(await client.moduleGraph.getModuleByUrl(url)),
    resolve: async (id, importer) => (await client.pluginContainer.resolveId(id, importer))?.id,
    staticSpecifiers: (code) => parsedSpecifiers(vite, code),
    extensions: client.config.resolve.extensions,
    close: () => Promise.resolve()
  }
}

/**
 * The specifiers of a module's static imports and re-exports, from Vite's own parser: not an import in a comment or a
 * string, or a dynamic `import()`, which may never run.
 */
function parsedSpecifiers(vite: typeof Vite, code: string): string[] | undefined {
  let program: ReturnType<typeof Vite.parseAst>

  try {
    program = vite.parseAst(code)
  } catch {
    return undefined
  }

  return program.body.flatMap((node) => {
    const isStatic =
      node.type === "ImportDeclaration" ||
      node.type === "ExportAllDeclaration" ||
      node.type === "ExportNamedDeclaration"

    // A module's source is always a string; a named export without `from` has none.
    return isStatic && node.source ? [String(node.source.value)] : []
  })
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

      for (const [index, { module, imported }] of imports.entries()) {
        const fromApp = own(module?.file)
        // One Vite couldn't compile, as with a syntax error, is read too: fixing it changes the answer.
        const file = module?.file ?? projectFile(root, batch[index]!)

        if (own(file)) {
          read.add(file)

          // Vite won't compile a module whose import names a missing file, so creating that file changes the answer.
          if (!module) {
            for (const missing of await missingImports(client, root, file)) {
              read.add(missing)
            }
          }
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

/** The project file a module URL names (`/src/main.ts`), or nothing for Vite's own (`/@id/…`) and virtual modules. */
function projectFile(root: string, url: string): string | undefined {
  if (!url.startsWith("/") || url.startsWith("/@")) {
    return undefined
  }

  return posix.join(root, url.split("?")[0]!)
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
      // As the config names it first, which a plugin's virtual entry (`virtual:app`) needs. Else it's a file from the
      // root, as Vite reads one, whether or not it starts with `./`, and listed when it isn't there yet.
      const url = await moduleUrl(client, root, entry)

      if (url) {
        modules.push(url)
      } else {
        const local = /^[./]/.test(entry) || /^[A-Za-z]:\//.test(entry) ? entry : `./${entry}`
        await addModule(client, root, local, `${root}/index.html`, { modules, pages })
      }

      continue
    }

    const file = posix.isAbsolute(entry) || /^[A-Za-z]:\//.test(entry) ? entry : posix.join(root, entry)
    // Read, or missing: creating it changes the answer too.
    pages.push(file)
    const html = await readFile(file, "utf8").catch(() => undefined)

    if (html === undefined) {
      continue
    }

    // In the page's order, so the cascade keeps it. A tag in a comment isn't loaded.
    const tags = html
      .replaceAll(/<!--[\s\S]*?-->/g, "")
      .matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>|<link\b([^>]*)>/gi)

    for (const tag of tags) {
      const isScript = tag[1] !== undefined
      const attributes = tag[1] ?? tag[3]!

      const value = (name: string) =>
        new RegExp(String.raw`\b${name}\s*=\s*["']([^"']+)["']`, "i").exec(attributes)?.[1]

      const src = value("src")
      const href = value("href")

      if (isScript && value("type") === "module" && src) {
        if (isPageLocal(src)) {
          await addModule(client, root, pageRelative(src), file, { modules, pages })
        }
      } else if (isScript && value("type") === "module") {
        // An inline module: what it imports is the app, as a module script's would be.
        await inlineImports(client, root, file, tag[2]!, { modules, links, pages })
      } else if (!isScript && value("rel")?.toLowerCase() === "stylesheet" && href && isPageLocal(href)) {
        const linked = await linkedFile(root, file, href)

        if (linked) {
          links.push({ file: linked, importer: file, depth: 0 })
        } else {
          // Not there yet: creating it changes the answer, so it's among the files read.
          pages.push(linkTarget(root, file, href)[0]!)
        }
      }
    }
  }

  return { modules, links, pages }
}

/**
 * What an inline `<script type="module">` imports statically, resolved by Vite from the page: global stylesheets join
 * the page's links, and modules join the entries the walk starts from. What isn't there yet joins the files read.
 */
async function inlineImports(
  client: ClientGraph,
  root: string,
  page: string,
  code: string,
  into: { modules: string[]; links: Imported[]; pages: string[] }
): Promise<void> {
  for (const specifier of client.staticSpecifiers(code) ?? []) {
    if (!isPageLocal(specifier)) {
      continue
    }

    if (!isStylesheetFile(specifier)) {
      await addModule(client, root, specifier, page, into)
      continue
    }

    if (!isGlobalStylesheet(specifier)) {
      continue
    }

    const resolved = await client.resolve(specifier, page).catch(() => undefined)

    if (resolved) {
      into.links.push({ file: resolved.split("?")[0]!, importer: page, depth: 0 })
    } else {
      into.pages.push(...importTargets(root, specifier, page, client.extensions))
    }
  }
}

/**
 * Adds an entry module the page or config names: to the walk's start when Vite resolves it, or else, as a file that
 * isn't there yet, to the files read.
 */
async function addModule(
  client: ClientGraph,
  root: string,
  id: string,
  importer: string,
  into: { modules: string[]; pages: string[] }
): Promise<void> {
  const url = await moduleUrl(client, root, id, importer)

  if (url) {
    into.modules.push(url)
  } else {
    into.pages.push(...importTargets(root, id, importer, client.extensions))
  }
}

/**
 * The files a module's local imports name that Vite can't resolve, as when one imports `./later.css` before it's
 * written. Read with Vite's parser where the module parses, and by pattern where it doesn't: watching a file the module
 * doesn't import costs only a search that finds the same.
 */
async function missingImports(client: ClientGraph, root: string, file: string): Promise<string[]> {
  const code = await readFile(file, "utf8").catch(() => undefined)

  if (code === undefined) {
    return []
  }

  const missing: string[] = []

  for (const specifier of client.staticSpecifiers(code) ?? importSpecifiers(code)) {
    if (!/^\.{0,2}\//.test(specifier) || (await client.resolve(specifier, file).catch(() => undefined))) {
      continue
    }

    missing.push(...importTargets(root, specifier, file, client.extensions))
  }

  return missing
}

/**
 * The project files a local import that doesn't resolve may come to name: its path, from the root when it starts with
 * `/` and from the importer otherwise, and, when it names no extension Vite tries, that path with each one, as a file
 * or a folder's `index`. None for a package's or an alias's, whose file can't be known.
 */
function importTargets(root: string, specifier: string, importer: string, extensions: string[]): string[] {
  const path = specifier.split(/[?#]/)[0]!

  if (!/^\.{0,2}\//.test(path)) {
    return []
  }

  const file = path.startsWith("/") ? posix.join(root, path) : posix.join(posix.dirname(importer), path)

  if (!file.startsWith(`${root}/`) || isStylesheetFile(file) || extensions.includes(posix.extname(file))) {
    return [file]
  }

  return [file, ...extensions.map((extension) => file + extension), ...extensions.map((e) => `${file}/index${e}`)]
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
  for (const candidate of linkTarget(root, page, href)) {
    if (await isFile(candidate)) {
      return candidate
    }
  }

  return undefined
}

/** Where a page's `href` may point, in the order Vite looks: the root, then `public`, for a root-relative one. */
function linkTarget(root: string, page: string, href: string): string[] {
  const path = decodeURI(href.split(/[?#]/)[0]!)

  return path.startsWith("/")
    ? [posix.join(root, path), posix.join(root, "public", path)]
    : [posix.join(posix.dirname(page), path)]
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isFile(),
    () => false
  )
}

/** The URL Vite compiles an entry by: a project file's path from the root, else its resolved id; none if unresolved. */
async function moduleUrl(
  client: ClientGraph,
  root: string,
  id: string,
  importer?: string
): Promise<string | undefined> {
  const resolved = await client.resolve(id, importer).catch(() => undefined)

  if (!resolved) {
    return undefined
  }

  if (resolved.startsWith(`${root}/`)) {
    return `/${resolved.slice(root.length + 1)}`
  }

  return resolved.startsWith("\0") || !posix.isAbsolute(resolved.replace(/^[A-Za-z]:/, ""))
    ? resolved
    : `/@fs/${resolved}`
}
