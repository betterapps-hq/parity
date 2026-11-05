import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { dirname, join, posix, relative, resolve } from "node:path"
import type { ComponentSource, LibraryInfo, PackageManifest, RendererAdapter } from "@parity-app/core"
import { exportedComponents, type PackageFolder, packageEntry, readPackage } from "./packages.ts"

/** A monorepo's root and the packages in it, by name. */
export interface Workspace {
  root: string
  packages: Map<string, PackageFolder>
}

/**
 * The workspace an app is in, found the way package managers find it: the nearest folder above the app with a
 * `pnpm-workspace.yaml`, or a package.json with `workspaces` (npm, Yarn and bun), whose patterns include the app.
 */
export async function findWorkspace(root: string): Promise<Workspace | undefined> {
  for (let folder = dirname(resolve(root)); ; folder = dirname(folder)) {
    const patterns = await workspacePatterns(folder)
    if (patterns) {
      const packages = new Map<string, PackageFolder>()
      for (const dir of await expand(folder, patterns)) {
        const found = await readWorkspacePackage(dir)
        if (found?.manifest.name) packages.set(found.manifest.name, found)
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
): (PackageFolder & { name: string })[] {
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
  entry: PackageFolder & { name: string },
  renderer: RendererAdapter,
  taken: ReadonlySet<string>
): Promise<WorkspaceSection | undefined> {
  const source = packageEntry(entry, "source")
  if (!source) return undefined
  const exported = [...(await exportedComponents(source, renderer))].filter(([, component]) => component.as)
  if (exported.length === 0) return undefined
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
    components[`${id}/${name === "default" ? found.name : name}`] = {
      path: entry.name,
      export: name,
      library: id,
      declaration: slashes(relative(root, found.file)),
      ...(found.as ? { as: found.as } : {})
    }
  }
  return { library, components }
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
  const workspaces = (await readWorkspacePackage(folder))?.manifest.workspaces
  return Array.isArray(workspaces) ? workspaces : workspaces?.packages
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

/** A folder's package, or nothing when its package.json is missing or isn't a package's, as package managers skip it. */
async function readWorkspacePackage(dir: string): Promise<PackageFolder | undefined> {
  return readPackage(dir).catch(() => undefined)
}

function slashes(path: string): string {
  return path.replaceAll("\\", "/")
}
