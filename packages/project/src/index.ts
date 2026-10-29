import { readdir, readFile } from "node:fs/promises"
import { dirname, extname, join, relative } from "node:path"
import {
  type ComponentSource,
  type DescribedTokens,
  libraryManifestExtension,
  type PackageManifest,
  parseLibraryManifest,
  type ProjectConfig,
  type RendererAdapter
} from "@parity/core"
import { componentIds, findAppComponents } from "./components.ts"
import { loadConfig } from "./configs.ts"
import { parseJsonc } from "./jsonc.ts"
import { describedTokens, findLibraries } from "./libraries.ts"
import { findStorybook } from "./storybook.ts"
import { type ProjectTsconfig, readTsconfig, resolvePathAlias } from "./tsconfig.ts"

export { type ConfigSource, findConfig, type FoundConfig, loadConfig } from "./configs.ts"
export { type CheckedComponent, checkedChanges } from "./components.ts"
export { addCommand, cutoff, detectPackageManager, detectProject } from "./detect.ts"
export { parseJsonc } from "./jsonc.ts"
export { installedPackage, type LibraryDefinition, libraryCatalog } from "./libraries.ts"
export { parseStoryFile } from "./storybook.ts"
export { type ProjectTsconfig, readTsconfig, resolvePathAlias, type TsconfigFile } from "./tsconfig.ts"

export interface DiscoveredProject extends ProjectConfig {
  /** How each part was found, for the status bar and debugging. */
  notes: string[]
  /** The app's files read for components, relative to the root, for the type checker to read again. */
  componentFiles: string[]
}

/**
 * Works out what the canvas needs from the project as it is: no config file. Styles come from the project's own
 * conventions (shadcn's `components.json`, the app entry), components from what the renderer recognizes in every file
 * the app's tsconfig includes, and designs from the project's `.par` files (usually one, at its root). A library's own
 * `.lib.par`, at its root, holds designs too, and the tokens it describes.
 */
export async function discoverProject(
  root: string,
  renderer: RendererAdapter,
  pkg: PackageManifest = {}
): Promise<DiscoveredProject> {
  const notes: string[] = []
  const shadcn = await shadcnConfig(root, notes)
  const tsconfig = readTsconfig(root)
  const { styles, packageStyles } = await findStyles(root, shadcn, notes)
  const libraries = await findLibraries(root, pkg, styles, renderer, packageStyles)
  const uiKit = await findUiKit(root, shadcn, tsconfig, renderer, notes)
  const app = await findAppComponents(root, renderer, tsconfig, uiKit, notes)
  notes.push(...libraries.notes)
  const components = componentIds(app.found, new Set(Object.keys(libraries.components)))
  for (const library of libraries.libraries) {
    const count = Object.values(libraries.components).filter((source) => source.library === library.id).length
    notes.push(`${count} components from ${library.name} (${library.importName})`)
  }
  const documents = await findDocuments(root)
  notes.push(documents.length === 0 ? "no .par project file yet" : `designs in ${documents.join(", ")}`)
  const tokens: DescribedTokens[] = [...libraries.describedTokens]
  const own = documents.find((path) => !path.includes("/") && path.endsWith(libraryManifestExtension))
  if (own) {
    try {
      const manifest = parseLibraryManifest(parseJsonc(await readFile(join(root, own), "utf8")))
      const described = await describedTokens(root, join(root, own), manifest)
      if (described) tokens.unshift(described)
      notes.push(`a library, described by ${own}`)
    } catch (error) {
      notes.push(`${own} can't be read: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const all = { ...components, ...libraries.components }
  const storybook = await findStorybook(root, pkg, all, async (specifier) => resolveAlias(root, tsconfig, specifier))
  if (storybook) {
    notes.push(
      `Storybook in ${storybook.configDir}, with stories for ${Object.keys(storybook.stories).length} components`
    )
  }
  return {
    styles,
    ...(packageStyles.length > 0 ? { packageStyles } : {}),
    components: all,
    libraries: libraries.libraries,
    documents,
    ...(storybook ? { storybook } : {}),
    ...(tokens.length > 0 ? { describedTokens: tokens } : {}),
    notes,
    componentFiles: app.files
  }
}

async function findStyles(
  root: string,
  shadcn: unknown,
  notes: string[]
): Promise<{ styles: string[]; packageStyles: string[] }> {
  const fromShadcn = field(shadcn, "tailwind", "css")
  if (typeof fromShadcn === "string" && fromShadcn) {
    notes.push(`styles from components.json: ${fromShadcn}`)
    return { styles: [toPosix(fromShadcn)], packageStyles: [] }
  }

  // Otherwise follow the app entry: index.html → module script → its CSS imports.
  const html = await readText(join(root, "index.html"))
  const entry = html && /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i.exec(html)?.[1]
  if (entry) {
    const entryPath = join(root, entry.replace(/^\//, ""))
    const source = await readText(entryPath)
    const specifiers = [...(source ?? "").matchAll(/import\s+["']([^"']+\.css)["']/g)].map((match) => match[1]!)
    // A path is the project's own stylesheet; a bare specifier is a package's, as `@mantine/core/styles.css` is.
    const local = (specifier: string) => specifier.startsWith(".") || specifier.startsWith("/")
    const imports = specifiers
      .filter(local)
      .map((specifier) => toPosix(relative(root, join(dirname(entryPath), specifier))))
    const packageStyles = specifiers.filter((specifier) => !local(specifier))
    if (specifiers.length > 0) {
      notes.push(`styles from ${toPosix(entry)}: ${[...packageStyles, ...imports].join(", ")}`)
      return { styles: imports, packageStyles }
    }
  }
  notes.push("no global styles found")
  return { styles: [], packageStyles: [] }
}

/**
 * The UI kit folder: the one `components.json` names, else the usual places. Its components keep their bare names
 * when another has the same name, since it was the only folder Parity read before it read the whole app.
 */
async function findUiKit(
  root: string,
  shadcn: unknown,
  tsconfig: ProjectTsconfig,
  renderer: RendererAdapter,
  notes: string[]
): Promise<string | undefined> {
  const candidates: string[] = []
  const alias = field(shadcn, "aliases", "ui")
  if (typeof alias === "string") {
    const resolved = resolveAlias(root, tsconfig, alias)
    if (resolved) candidates.push(resolved)
  }
  candidates.push("src/components/ui", "components/ui", "src/components")
  for (const folder of candidates) {
    if ((await listFiles(join(root, folder), renderer.componentExtensions)).length === 0) continue
    notes.push(`the UI kit is in ${folder}`)
    return folder
  }
  return undefined
}

/** Maps an import alias such as `@/components/ui` to a folder, using the project's tsconfig paths. */
function resolveAlias(root: string, tsconfig: ProjectTsconfig, alias: string): string | undefined {
  return resolvePathAlias(root, tsconfig, alias) ?? (alias.startsWith("@/") ? `src/${alias.slice(2)}` : undefined)
}

const skippedFolders = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", ".next", ".turbo"])

async function findDocuments(root: string): Promise<string[]> {
  const found: string[] = []
  const walk = async (folder: string) => {
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skippedFolders.has(entry.name) && !entry.name.startsWith(".")) await walk(join(folder, entry.name))
      } else if (entry.name.endsWith(".par") && (folder === root || !entry.name.endsWith(libraryManifestExtension))) {
        // A `.lib.par` only holds this project's designs at its root; anywhere else it describes another package.
        found.push(toPosix(relative(root, join(folder, entry.name))))
      }
    }
  }
  await walk(root)
  return found.sort()
}

async function listFiles(folder: string, extensions: string[]): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isFile() && extensions.includes(extname(entry.name)))
    .map((entry) => join(folder, entry.name))
    .sort()
}

function field(value: unknown, ...keys: string[]): unknown {
  let current = value
  for (const key of keys) {
    if (typeof current !== "object" || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

async function readText(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch(() => undefined)
}

/** shadcn's `components.json`, which it reads from the project's own folder only and which may have comments. */
async function shadcnConfig(root: string, notes: string[]): Promise<unknown> {
  try {
    return (await loadConfig(root, root, { files: ["components"], extensions: ["json"], here: true, jsonc: true }))
      ?.value
  } catch (error) {
    notes.push(error instanceof Error ? error.message : String(error))
    return undefined
  }
}

function toPosix(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "")
}
