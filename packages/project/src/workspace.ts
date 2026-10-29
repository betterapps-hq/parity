import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { dirname, join, posix, relative, resolve } from "node:path"
import type { ComponentEvidence, ComponentSource, LibraryInfo, PackageManifest, RendererAdapter } from "@parity/core"
import { parseJsonc } from "./jsonc.ts"

/** A monorepo's root and the packages in it, by name. */
export interface Workspace {
  root: string
  packages: Map<string, { dir: string; manifest: WorkspaceManifest }>
}

interface WorkspaceManifest extends PackageManifest {
  name?: string
  version?: string
  exports?: unknown
  types?: string
  typings?: string
  module?: string
  main?: string
  workspaces?: string[] | { packages?: string[] }
}

/**
 * The workspace an app is in, found the way package managers find it: the nearest folder above the app with a
 * `pnpm-workspace.yaml`, or a package.json with `workspaces` (npm, Yarn and bun), whose patterns include the app.
 */
export async function findWorkspace(root: string): Promise<Workspace | undefined> {
  for (let folder = dirname(resolve(root)); ; folder = dirname(folder)) {
    const patterns = await workspacePatterns(folder)
    if (patterns) {
      const packages = new Map<string, { dir: string; manifest: WorkspaceManifest }>()
      for (const dir of await expand(folder, patterns)) {
        const manifest = await readManifest(dir)
        if (manifest?.name) packages.set(manifest.name, { dir, manifest })
      }
      const app = resolve(root)
      if ([...packages.values()].some((entry) => resolve(entry.dir) === app)) return { root: folder, packages }
    }
    if (dirname(folder) === folder) return undefined
  }
}

/** The packages a workspace has that the app depends on, apart from those a library already describes. */
export function workspaceDependencies(
  workspace: Workspace,
  pkg: PackageManifest,
  described: ReadonlySet<string>
): { name: string; dir: string; manifest: WorkspaceManifest }[] {
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  return names.flatMap((name) => {
    const found = workspace.packages.get(name)
    return found && !described.has(name) ? [{ name, ...found }] : []
  })
}

export interface WorkspaceSection {
  library: LibraryInfo
  components: Record<string, ComponentSource>
}

/**
 * A workspace package's components, as a section of the Components panel: what its entry exports, read from source
 * through the workspace link and following its re-exports, and imported by the package's name as the app imports it.
 * Exports the parse can't decide are left out, as they are outside the app's UI kit.
 */
export async function workspaceSection(
  root: string,
  entry: { name: string; dir: string; manifest: WorkspaceManifest },
  renderer: RendererAdapter,
  taken: ReadonlySet<string>
): Promise<WorkspaceSection | undefined> {
  const source = await sourceEntry(entry.dir, entry.manifest)
  if (!source) return undefined
  const exported = await exportsOf(source, renderer, new Set())
  if (exported.size === 0) return undefined
  const id = sectionId(entry.name, taken)
  const library: LibraryInfo = {
    id,
    name: entry.name,
    kind: "components",
    description: "A package in this workspace",
    package: entry.name,
    importName: entry.name,
    ...(entry.manifest.version ? { version: entry.manifest.version } : {}),
    stylesImported: true,
    workspace: slashes(relative(root, entry.dir))
  }
  const components: Record<string, ComponentSource> = {}
  for (const [name, found] of exported) {
    components[`${id}/${name}`] = {
      path: entry.name,
      export: name,
      library: id,
      declaration: slashes(relative(root, found.file)),
      as: found.as
    }
  }
  return { library, components }
}

/**
 * The file a package's entry is written in: what `exports` names for `.` (its `source`, `types`, `import` or `default`
 * condition), else `types`, `module` or `main`. A built file (`dist/index.js`, `dist/index.d.ts`) is traced back to its
 * source, `src/index.tsx` or `src/index.ts`, since the canvas builds a workspace package the way the app does.
 */
async function sourceEntry(dir: string, manifest: WorkspaceManifest): Promise<string | undefined> {
  const named =
    exportedEntry(manifest.exports) ?? manifest.types ?? manifest.typings ?? manifest.module ?? manifest.main
  const candidates = [
    ...(named && !isBuilt(named) ? [named] : []),
    "src/index.tsx",
    "src/index.ts",
    "src/index.jsx",
    "src/index.js",
    "index.tsx",
    "index.ts"
  ]
  for (const candidate of candidates) {
    const file = join(dir, candidate)
    if (existsSync(file)) return file
  }
  return undefined
}

function exportedEntry(exports: unknown): string | undefined {
  const pick = (value: unknown): string | undefined => {
    if (typeof value === "string") return value
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
    const record = value as Record<string, unknown>
    for (const key of ["source", "types", "import", "default"]) {
      const found = pick(record[key])
      if (found) return found
    }
    return undefined
  }
  if (typeof exports === "string") return exports
  if (typeof exports !== "object" || exports === null) return undefined
  const record = exports as Record<string, unknown>
  return pick("." in record ? record["."] : record)
}

function isBuilt(path: string): boolean {
  return /\.d\.[cm]?ts$/.test(path) || /(^|\/)(dist|build|lib|out|esm|cjs)\//.test(path.replace(/^\.\//, ""))
}

/**
 * What a module exports that the renderer recognises as components, by export name, following `export * from` and
 * `export { A as B } from` into the package's own files. Re-exports from other packages are left out.
 */
async function exportsOf(
  file: string,
  renderer: RendererAdapter,
  seen: Set<string>
): Promise<Map<string, { file: string; as: ComponentEvidence }>> {
  const found = new Map<string, { file: string; as: ComponentEvidence }>()
  if (seen.has(file)) return found
  seen.add(file)
  const source = await readFile(file, "utf8").catch(() => undefined)
  if (source === undefined) return found
  for (const component of renderer.findComponents(source, file)) {
    if (component.as) found.set(component.name, { file, as: component.as })
  }
  for (const reexport of reexportsOf(source)) {
    const target = resolveRelative(file, reexport.from)
    if (!target) continue
    const inner = await exportsOf(target, renderer, seen)
    if (!reexport.names) {
      for (const [name, value] of inner) if (!found.has(name)) found.set(name, value)
      continue
    }
    for (const [name, as] of reexport.names) {
      const value = inner.get(name) ?? (name === "default" ? [...inner.values()][0] : undefined)
      if (value) found.set(as, value)
    }
  }
  return found
}

/** A module's re-exports: `export * from "./x"` (every name), and `export { A, B as C } from "./x"`. Types are left out. */
function reexportsOf(source: string): { from: string; names?: [string, string][] }[] {
  const found: { from: string; names?: [string, string][] }[] = []
  for (const match of source.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)) found.push({ from: match[1]! })
  for (const match of source.matchAll(/export\s+(type\s+)?\{([^}]*)\}\s*from\s+["']([^"']+)["']/g)) {
    if (match[1]) continue
    const names = match[2]!
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith("type "))
      .map((part): [string, string] => {
        const [name, as] = part.split(/\s+as\s+/).map((text) => text.trim())
        return [name!, as ?? name!]
      })
    found.push({ from: match[3]!, names })
  }
  return found
}

const extensions = [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"]

/** A relative specifier as a file: `./button` or `./button.js` written for `./button.tsx`, or a folder's index. */
function resolveRelative(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined
  const base = join(dirname(from), specifier)
  const stem = base.replace(/\.[cm]?jsx?$/, "")
  for (const candidate of [base, ...extensions.map((extension) => stem + extension)]) {
    if (/\.[cm]?[jt]sx?$/.test(candidate) && existsSync(candidate)) return candidate
  }
  return undefined
}

/** A section's id: the package's name without its scope, as `@acme/ui` is `ui`, unless something already has it. */
function sectionId(name: string, taken: ReadonlySet<string>): string {
  const short = name.replace(/^@[^/]+\//, "")
  const prefixed = (id: string) => [...taken].some((key) => key.startsWith(`${id}/`))
  if (!prefixed(short)) return short
  return name.replace(/^@/, "").replace("/", "-")
}

async function workspacePatterns(folder: string): Promise<string[] | undefined> {
  const yaml = await readFile(join(folder, "pnpm-workspace.yaml"), "utf8").catch(() => undefined)
  if (yaml !== undefined) return pnpmPackages(yaml)
  const manifest = await readManifest(folder)
  const workspaces = manifest?.workspaces
  if (Array.isArray(workspaces)) return workspaces
  if (workspaces && Array.isArray(workspaces.packages)) return workspaces.packages
  return undefined
}

/** The `packages` list of a pnpm-workspace.yaml, read without a YAML parser: it's a list of quoted or bare globs. */
export function pnpmPackages(yaml: string): string[] {
  const patterns: string[] = []
  let inPackages = false
  for (const line of yaml.split(/\r?\n/)) {
    if (/^packages\s*:/.test(line)) {
      inPackages = true
      continue
    }
    if (!inPackages) continue
    const item = /^\s+-\s*["']?([^"'#]+?)["']?\s*(#.*)?$/.exec(line)
    if (item) patterns.push(item[1]!)
    else if (/^\S/.test(line)) break
  }
  return patterns
}

/** The folders a workspace's patterns match: `apps/*`, `packages/**`, or a folder named outright. `!` excludes. */
async function expand(root: string, patterns: string[]): Promise<string[]> {
  const included = new Set<string>()
  const excluded = new Set<string>()
  for (const pattern of patterns) {
    const negated = pattern.startsWith("!")
    const parts = pattern.replace(/^!/, "").replace(/\/+$/, "").split("/")
    for (const dir of await match(root, parts)) (negated ? excluded : included).add(dir)
  }
  return [...included].filter((dir) => !excluded.has(dir)).sort()
}

async function match(folder: string, parts: string[], depth = 0): Promise<string[]> {
  if (parts.length === 0) return existsSync(join(folder, "package.json")) ? [folder] : []
  const [part, ...rest] = parts as [string, ...string[]]
  if (part === "**") {
    if (depth > 4) return []
    const here = await match(folder, rest, depth)
    const below = await Promise.all((await subfolders(folder)).map((dir) => match(dir, parts, depth + 1)))
    return [...here, ...below.flat()]
  }
  if (part.includes("*")) {
    const pattern = new RegExp(`^${part.replaceAll(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*")}$`)
    const dirs = (await subfolders(folder)).filter((dir) => pattern.test(posix.basename(slashes(dir))))
    return (await Promise.all(dirs.map((dir) => match(dir, rest, depth)))).flat()
  }
  const next = join(folder, part)
  return existsSync(next) ? match(next, rest, depth) : []
}

async function subfolders(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith("."))
    .map((entry) => join(folder, entry.name))
}

async function readManifest(dir: string): Promise<WorkspaceManifest | undefined> {
  const text = await readFile(join(dir, "package.json"), "utf8").catch(() => undefined)
  if (text === undefined) return undefined
  try {
    return parseJsonc(text) as WorkspaceManifest
  } catch {
    return undefined
  }
}

function slashes(path: string): string {
  return path.replaceAll("\\", "/")
}
