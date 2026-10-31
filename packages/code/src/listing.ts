import { readdir, readFile } from "node:fs/promises"
import { extname, join, posix, relative } from "node:path"
import type {
  ComponentEvidence,
  ComponentRef,
  ComponentSource,
  DetectionCorrections,
  LeftOutExport,
  RendererAdapter
} from "@parity-app/core"
import { type ProjectTsconfig, resolvePathAlias } from "./tsconfig.ts"

/** A component found in the app's source, before it has an id. */
export interface ParsedComponent {
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
/** Stories, tests, generated and config files sit beside components and export everything but components. */
const notComponents = /\.(stories|story|test|spec|gen|generated|config)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/
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
): Promise<{ found: ParsedComponent[]; files: string[] }> {
  const { files: unique, from } = await appFiles(root, renderer, tsconfig)
  const found: ParsedComponent[] = []
  const entries: string[] = []
  const read: string[] = []
  await Promise.all(
    unique.map(async (path) => {
      const parsed = await parseFile(root, renderer, path, uiKit)
      if (parsed === "mounts") entries.push(path)
      if (typeof parsed === "string") return
      read.push(path)
      found.push(...parsed.filter((component) => component.as || component.uiKit))
    })
  )
  found.sort((a, b) => {
    if (a.path === b.path) return a.name.localeCompare(b.name, "en")
    return a.path < b.path ? -1 : 1
  })
  notes.push(`${count(found.length, "component")} in ${count(unique.length, "file")} from ${from}`)
  if (entries.length > 0) notes.push(`not read, since they mount the app: ${entries.sort().join(", ")}`)
  return { found, files: read.sort() }
}

/**
 * The app's files the parse reads, relative to the root: those its tsconfigs include (references followed), else every
 * file under it. App libraries are generated from the same files, with their own extensions.
 */
export async function appFiles(
  root: string,
  renderer: Pick<RendererAdapter, "componentExtensions">,
  tsconfig: ProjectTsconfig
): Promise<{ files: string[]; from: string }> {
  const fromConfigs = tsconfig.configs.flatMap((config) => config.files)
  const files = (fromConfigs.length > 0 ? fromConfigs : await walk(root, renderer.componentExtensions))
    .map((file) => slashes(relative(root, file)))
    .filter((path) => isCandidate(path, renderer.componentExtensions))
  const from = fromConfigs.length > 0 ? (tsconfig.app?.path ?? tsconfig.configs[0]!.path) : "the project's files"
  return { files: [...new Set(files)].sort(), from }
}

/** A file's exports the renderer recognises, decided or not; `mounts` for the app's entry, `gone` when it can't be read. */
async function parseFile(
  root: string,
  renderer: RendererAdapter,
  path: string,
  uiKit: string | undefined
): Promise<ParsedComponent[] | "mounts" | "gone"> {
  const source = await readFile(join(root, path), "utf8").catch(() => undefined)
  if (source === undefined) return "gone"
  if (mountsApp.test(source)) return "mounts"
  const inUiKit = uiKit !== undefined && posix.dirname(path) === uiKit
  return renderer.findComponents(source, path).map((component) => ({ ...component, path, uiKit: inUiKit }))
}

/**
 * Changed files read again, for `filesChanged`: each one's exports the renderer recognises, or `undefined` for a file
 * that's gone, is no longer one of the app's files, or now mounts the app. `files` are the app's files as they are now.
 */
export async function readChangedFiles(
  root: string,
  renderer: RendererAdapter,
  files: readonly string[],
  uiKit: string | undefined,
  changed: Iterable<string>
): Promise<Map<string, ParsedComponent[] | undefined>> {
  const inApp = new Set(files)
  const read = new Map<string, ParsedComponent[] | undefined>()
  await Promise.all(
    [...new Set(changed)].map(async (path) => {
      const parsed = inApp.has(path) ? await parseFile(root, renderer, path, uiKit) : "gone"
      read.set(path, typeof parsed === "string" ? undefined : parsed)
    })
  )
  return read
}

/**
 * The list after files changed, from what the parse reads in them now. A component still exported keeps its id, and one
 * whose file is gone or no longer exports it is `removed`. New ones are `added`, with ids that don't clash, so a
 * component moved to another file keeps its id while its name stays unique. An export the parse can no longer decide
 * stays listed for the type checker to settle, as do new ones in the UI kit, and other new undecided exports wait for
 * it. Libraries' components and other files' aren't touched. New ids start with a library project's `namespace`.
 */
export function filesChanged(
  sources: Record<string, ComponentSource>,
  read: ReadonlyMap<string, ParsedComponent[] | undefined>,
  namespace?: string
): { sources: Record<string, ComponentSource>; added: string[]; removed: string[] } {
  const key = (path: string, name: string) => `${path}#${name}`
  const next: Record<string, ComponentSource> = {}
  const removed: string[] = []
  const listed = new Set<string>()
  for (const [id, source] of Object.entries(sources)) {
    if (source.library || !read.has(source.path)) {
      next[id] = source
      continue
    }
    const now = read.get(source.path)?.find((component) => component.export === source.export)
    if (!now) {
      removed.push(id)
      continue
    }
    listed.add(key(source.path, source.export))
    const { as: _, ...undecided } = source
    next[id] = now.as ? { ...source, as: now.as } : undecided
  }
  const fresh = [...read.values()]
    .flatMap((found) => found ?? [])
    .filter((component) => (component.as || component.uiKit) && !listed.has(key(component.path, component.export)))
  const added = componentIds(fresh, new Set(Object.keys(next)), namespace)
  return { sources: { ...next, ...added }, added: Object.keys(added), removed }
}

/**
 * The app's files that import one of `changed`, by a relative path or a tsconfig alias. The type checker reads them
 * again with the changed files, since what a file exports can depend on what it imports.
 */
export async function importersOf(
  root: string,
  files: readonly string[],
  changed: Iterable<string>,
  tsconfig: ProjectTsconfig
): Promise<string[]> {
  const targets = new Set([...changed].map(moduleId))
  const found: string[] = []
  await Promise.all(
    files.map(async (path) => {
      if (targets.has(moduleId(path))) return
      const source = await readFile(join(root, path), "utf8").catch(() => "")
      for (const match of source.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g)) {
        const specifier = match[1]!
        const target = specifier.startsWith(".")
          ? posix.join(posix.dirname(path), specifier)
          : resolvePathAlias(root, tsconfig, specifier)
        if (target && targets.has(moduleId(target))) {
          found.push(path)
          return
        }
      }
    })
  )
  return found.sort()
}

/** A module by its path without extension or `/index`, as imports name it. */
function moduleId(path: string): string {
  return path.replace(/\.[cm]?[jt]sx?$/, "").replace(/\/index$/, "")
}

/** A component the type checker found, by the file it's exported from. */
export interface CheckedComponent {
  name: string
  path: string
  export: string
  as: ComponentEvidence
}

/** What the type checker read in some of the app's files: the components, and the exports it left out, with why. */
export interface CheckResult {
  components: CheckedComponent[]
  leftOut: LeftOutExport[]
}

/** The left-out exports after the checker read `files` again: theirs replaced, the rest kept, in file order. */
export function leftOutChanges(
  before: readonly LeftOutExport[],
  files: ReadonlySet<string>,
  checked: readonly LeftOutExport[]
): LeftOutExport[] {
  return [...before.filter((entry) => !files.has(entry.path)), ...checked].sort(
    (a, b) => a.path.localeCompare(b.path, "en") || a.name.localeCompare(b.name, "en")
  )
}

/**
 * What the type checker changes in the list the parse made. Components the parse recognised keep their ids. Exports
 * only the checker could decide are `added`, loading as they're drawn, with ids that don't clash with any given
 * already. The UI kit's undecided exports that it didn't confirm are `removed`. Libraries' components aren't touched.
 * When the checker read only some `files`, only their components are settled. New ids start with a library project's
 * `namespace`.
 */
export function checkedChanges(
  sources: Record<string, ComponentSource>,
  checked: CheckedComponent[],
  files?: ReadonlySet<string>,
  namespace?: string
): { added: Record<string, ComponentSource>; confirmed: Record<string, ComponentSource>; removed: string[] } {
  const key = (path: string, name: string) => `${path}#${name}`
  const byKey = new Map(checked.map((component) => [key(component.path, component.export), component]))
  const listed = new Set<string>()
  const confirmed: Record<string, ComponentSource> = {}
  const removed: string[] = []
  for (const [id, source] of Object.entries(sources)) {
    if (source.library) continue
    listed.add(key(source.path, source.export))
    if (source.as || source.included || (files && !files.has(source.path))) continue
    const found = byKey.get(key(source.path, source.export))
    if (found) confirmed[id] = { ...source, as: found.as }
    else removed.push(id)
  }
  const missed = checked
    .filter((component) => !listed.has(key(component.path, component.export)))
    .map((component) => ({ ...component, uiKit: false }))
  const added = componentIds(missed, new Set(Object.keys(sources).filter((id) => !removed.includes(id))), namespace)
  return { added, confirmed, removed }
}

/**
 * The list with the person's corrections: the components they took off it are dropped, and the exports they put on it
 * are added, marked `included` and loading as they're drawn, with ids that don't clash. Libraries' components aren't
 * touched. Applied after each pass of detection, so the corrections outlast files changing. New ids start with a library
 * project's `namespace`.
 */
export function correctedSources(
  sources: Record<string, ComponentSource>,
  corrections: DetectionCorrections | undefined,
  namespace?: string
): Record<string, ComponentSource> {
  if (!corrections?.include && !corrections?.exclude) return sources
  const key = (ref: ComponentRef) => `${ref.path}#${ref.export}`
  const excluded = new Set((corrections.exclude ?? []).map(key))
  const next = Object.fromEntries(
    Object.entries(sources).filter(([, source]) => source.library || !excluded.has(key(source)))
  )
  const listed = new Set(Object.values(next).map(key))
  const missing = (corrections.include ?? []).filter((ref) => !listed.has(key(ref)) && !excluded.has(key(ref)))
  const added = componentIds(
    missing.map((ref) => ({ name: refName(ref), path: ref.path, export: ref.export, uiKit: false })),
    new Set(Object.keys(next)),
    namespace
  )
  for (const [id, source] of Object.entries(added)) next[id] = { ...source, included: true }
  return next
}

/** What an export is called: its name, or for a default export, its file's (`user-card.tsx` is `UserCard`). */
function refName(ref: ComponentRef): string {
  if (ref.export !== "default") return ref.export
  const base = posix.basename(ref.path).replace(/\.[cm]?[jt]sx?$/, "")
  return (base === "index" ? posix.basename(posix.dirname(ref.path)) : base)
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("")
}

/**
 * Ids for the app's components: each one's name while it's unique. A name used by more than one component gains as
 * many of its folders as it takes to tell them apart (`ui/FieldError`, `packing-fields/FieldError`), except that the
 * first one in the UI kit folder keeps the bare name, so designs made before the whole app was read still find it.
 * Ids already `taken`, such as libraries' `nova/Button`, are skipped the same way. In a library's own project, every id
 * starts with the library's `namespace` (`nova/Button`), as the apps that install it name them.
 */
export function componentIds(
  found: ParsedComponent[],
  taken: ReadonlySet<string> = new Set(),
  namespace?: string
): Record<string, ComponentSource> {
  if (!namespace) return localIds(found, taken)
  const prefix = `${namespace}/`
  const local = new Set([...taken].filter((id) => id.startsWith(prefix)).map((id) => id.slice(prefix.length)))
  return Object.fromEntries(Object.entries(localIds(found, local)).map(([id, source]) => [prefix + id, source]))
}

function localIds(found: ParsedComponent[], taken: ReadonlySet<string>): Record<string, ComponentSource> {
  const byName = new Map<string, ParsedComponent[]>()
  for (const component of found) {
    const same = byName.get(component.name) ?? []
    // One component exported twice from its file, by name and as the default, is listed once.
    if (same.some((other) => other.path === component.path)) continue
    byName.set(component.name, [...same, component])
  }
  const ids: Record<string, ComponentSource> = {}
  // The UI kit loads with the canvas; the rest of the app, which can import much more, loads as it's drawn.
  const add = (id: string, component: ParsedComponent) => {
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
  component: ParsedComponent,
  group: ParsedComponent[],
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

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`
}

function slashes(path: string): string {
  return path.replaceAll("\\", "/")
}
