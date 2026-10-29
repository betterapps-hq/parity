import { readdir, readFile } from "node:fs/promises"
import { extname, join, posix, relative } from "node:path"
import type { ComponentEvidence, ComponentSource, RendererAdapter } from "@parity/core"
import type { ProjectTsconfig } from "./tsconfig.ts"

/** A component found in the app's source, before it has an id. */
export interface FoundComponent {
  name: string
  /** Its file, relative to the project root. */
  path: string
  export: string
  /** How it was recognised; unset for an export only the type checker can decide. */
  as?: ComponentEvidence
  /** Whether it's in the UI kit folder, the one folder Parity read before it read the whole app. */
  uiKit: boolean
}

/** Installed packages, build output, and folders of tests and scratch files. */
const skippedFolders = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "storybook-static",
  "__tests__",
  "__mocks__",
  "e2e",
  "tmp",
  "temp"
])
/** Stories, tests and generated files sit beside components and export everything but components. */
const notComponents = /\.(stories|story|test|spec|gen|generated)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/
/** Code that mounts the app into the page, which the canvas must never run. */
const mountsApp = /\b(createRoot|hydrateRoot)\s*\(|\bReactDOM\.render\s*\(/

/**
 * Every component the app's own source exports, found by the renderer's parse of each file: the files the app's
 * tsconfigs include, or without one, every file under the root. Files outside the root (workspace packages), stories,
 * tests, generated files and the app's entry, which mounts the app, are left out.
 *
 * Exports the parse can't decide, such as `const Select = SelectPrimitive.Root`, wait for the type checker, except in
 * the UI kit folder, where every capitalised export was listed before and still is. `files` are the ones read, for the
 * checker to read again.
 */
export async function findAppComponents(
  root: string,
  renderer: RendererAdapter,
  tsconfig: ProjectTsconfig,
  uiKit: string | undefined,
  notes: string[]
): Promise<{ found: FoundComponent[]; files: string[] }> {
  const fromConfigs = tsconfig.configs.flatMap((config) => config.files)
  const files = (fromConfigs.length > 0 ? fromConfigs : await walk(root, renderer.componentExtensions))
    .map((file) => slashes(relative(root, file)))
    .filter((path) => isCandidate(path, renderer.componentExtensions))
  const unique = [...new Set(files)].sort()
  const found: FoundComponent[] = []
  const entries: string[] = []
  const read: string[] = []
  await Promise.all(
    unique.map(async (path) => {
      const source = await readFile(join(root, path), "utf8").catch(() => undefined)
      if (source === undefined) return
      if (mountsApp.test(source)) {
        entries.push(path)
        return
      }
      read.push(path)
      const inUiKit = uiKit !== undefined && posix.dirname(path) === uiKit
      for (const component of renderer.findComponents(source, path)) {
        if (!component.as && !inUiKit) continue
        found.push({ ...component, path, uiKit: inUiKit })
      }
    })
  )
  found.sort((a, b) => (a.path === b.path ? a.name.localeCompare(b.name, "en") : a.path < b.path ? -1 : 1))
  const source = fromConfigs.length > 0 ? (tsconfig.app?.path ?? tsconfig.configs[0]!.path) : "the project's files"
  notes.push(`${count(found.length, "component")} in ${count(unique.length, "file")} from ${source}`)
  if (entries.length > 0) notes.push(`not read, since they mount the app: ${entries.sort().join(", ")}`)
  return { found, files: read.sort() }
}

/** A component the type checker found, by the file it's exported from. */
export interface CheckedComponent {
  name: string
  path: string
  export: string
  as: ComponentEvidence
}

/**
 * What the type checker changes in the list the parse made. Components the parse recognised keep their ids. Exports
 * only the checker could decide are `added`, loading as they're drawn, with ids that don't clash with any given
 * already. The UI kit's undecided exports that it didn't confirm are `removed`. Libraries' components aren't touched.
 */
export function checkedChanges(
  sources: Record<string, ComponentSource>,
  checked: CheckedComponent[]
): { added: Record<string, ComponentSource>; confirmed: Record<string, ComponentSource>; removed: string[] } {
  const key = (path: string, name: string) => `${path}#${name}`
  const byKey = new Map(checked.map((component) => [key(component.path, component.export), component]))
  const listed = new Set<string>()
  const confirmed: Record<string, ComponentSource> = {}
  const removed: string[] = []
  for (const [id, source] of Object.entries(sources)) {
    if (source.library) continue
    listed.add(key(source.path, source.export))
    if (source.as) continue
    const found = byKey.get(key(source.path, source.export))
    if (found) confirmed[id] = { ...source, as: found.as }
    else removed.push(id)
  }
  const missed = checked
    .filter((component) => !listed.has(key(component.path, component.export)))
    .map((component) => ({ ...component, uiKit: false }))
  const added = componentIds(missed, new Set(Object.keys(sources).filter((id) => !removed.includes(id))))
  return { added, confirmed, removed }
}

/**
 * Ids for the app's components: each one's name while it's unique. A name used by more than one component gains as
 * many of its folders as it takes to tell them apart (`ui/FieldError`, `packing-fields/FieldError`), except that the
 * first one in the UI kit folder keeps the bare name, so designs made before the whole app was read still find it.
 * Ids already `taken`, such as libraries' `nova/Button`, are skipped the same way.
 */
export function componentIds(
  found: FoundComponent[],
  taken: ReadonlySet<string> = new Set()
): Record<string, ComponentSource> {
  const byName = new Map<string, FoundComponent[]>()
  for (const component of found) {
    const same = byName.get(component.name) ?? []
    // One component exported twice from its file, by name and as the default, is listed once.
    if (same.some((other) => other.path === component.path)) continue
    byName.set(component.name, [...same, component])
  }
  const ids: Record<string, ComponentSource> = {}
  // The UI kit loads with the canvas; the rest of the app, which can import much more, loads as it's drawn.
  const add = (id: string, component: FoundComponent) => {
    ids[id] = {
      path: component.path,
      export: component.export,
      ...(component.as ? { as: component.as } : {}),
      ...(component.uiKit ? {} : { lazy: true })
    }
  }
  for (const [name, group] of byName) {
    if (group.length === 1 && !taken.has(name)) {
      add(name, group[0]!)
      continue
    }
    const kept = group.find((component) => component.uiKit)
    if (kept && !taken.has(name)) add(name, kept)
    const rest = group.filter((component) => component !== kept)
    for (const component of rest) add(`${qualifier(component, rest, taken, name)}/${name}`, component)
  }
  return ids
}

/**
 * What tells a component apart from the others with its name: the fewest of its folders, counted from the innermost,
 * that no other one ends with. Two in one folder are told apart by that folder and their file's name, and the whole
 * path is the last resort.
 */
function qualifier(
  component: FoundComponent,
  group: FoundComponent[],
  taken: ReadonlySet<string>,
  name: string
): string {
  const own = folders(component.path)
  const others = group.filter((other) => other !== component).map((other) => folders(other.path))
  const free = (id: string) => !taken.has(`${id}/${name}`)
  for (let count = 1; count <= own.length; count++) {
    const suffix = own.slice(-count).join("/")
    const shared = others.some((path) => path.length >= count && path.slice(-count).join("/") === suffix)
    if (!shared && free(suffix)) return suffix
  }
  const near = folderAndFile(component.path)
  const clashes = group.some((other) => other !== component && folderAndFile(other.path) === near)
  return clashes || !free(near) ? withoutExtension(component.path) : near
}

/** A file's innermost folder and its name, as in `base-demos/sidebar-footer`. */
function folderAndFile(path: string): string {
  return [...folders(path).slice(-1), posix.basename(withoutExtension(path))].join("/")
}

function withoutExtension(path: string): string {
  return path.replace(/\.[cm]?[jt]sx?$/, "")
}

function folders(path: string): string[] {
  return posix
    .dirname(path)
    .split("/")
    .filter((part) => part && part !== ".")
}

function isCandidate(path: string, extensions: string[]): boolean {
  if (path.startsWith("../") || path.includes(":")) return false
  if (!extensions.includes(extname(path)) || notComponents.test(path)) return false
  return !path.split("/").some((part) => skippedFolders.has(part) || part.startsWith("."))
}

async function walk(folder: string, extensions: string[]): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(folder, entry.name)
      if (entry.isDirectory()) {
        return skippedFolders.has(entry.name) || entry.name.startsWith(".") ? [] : walk(path, extensions)
      }
      return extensions.includes(extname(entry.name)) ? [path] : []
    })
  )
  return files.flat()
}

export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`
}

function slashes(path: string): string {
  return path.replaceAll("\\", "/")
}
