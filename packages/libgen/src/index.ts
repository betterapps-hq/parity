import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { basename, dirname, join, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"
import {
  applyLibraryEdits,
  type LibraryBreakpoint,
  type LibraryComponent,
  type LibraryIcons,
  type LibraryEdits,
  type LibraryManifest,
  libraryManifestExtension,
  type ParentSignal,
  parseLibraryEdits,
  parseLibraryManifest,
  type TokenCategory
} from "@parity/core"
import { installedPackage, parseJsonc } from "@parity/project"
import ts from "typescript"
import { type ComponentReport, findComponents, relativePath } from "./components.ts"
import { type ExampleSource, type ExampleUse, fetchExamples, readExamples } from "./examples.ts"
import { type PartRelation, relateParts } from "./parts.ts"
import { type Load, type Preset, presets } from "./presets.ts"
import { breakpointsOf, type CollectedToken, cssTokens, pairLineHeights, toDtcg } from "./tokens.ts"

export { componentOptions, findComponents, reactProbe, withReactProbe } from "./components.ts"
export { guessParent, relateParts } from "./parts.ts"
export { familyOf, fetchExamples, nearestParent, normalizeRepo, readExamples } from "./examples.ts"
export { parseLibraryEdits } from "@parity/core"
export { presets } from "./presets.ts"
export { categorizeVar, cssTokens, toDtcg } from "./tokens.ts"

export interface GenerateOptions {
  /** The project: the folder a package is installed in, or the app to describe. */
  root: string
  /** The package to describe, by the name the project depends on it by. Unset describes the app at `root`. */
  package?: string
  id?: string
  name?: string
  description?: string
  /** The versions the file covers, as a semver range. Defaults to the installed version's major. */
  range?: string
  /** The file being regenerated, to report what changed and keep what `only` leaves alone. */
  previous?: unknown
  /** Which components to write: `all` (the default), `new` ones only, or these names. */
  only?: "all" | "new" | string[]
  /** A shared file of hand edits, relative to where the file is written, set as its `edits`. */
  edits?: string
  /** Where the file is written, which `edits` is resolved from. */
  editsBase?: string
  /** Hand edits to try while generating, so the report counts what they fix. */
  trialEdits?: LibraryEdits
  /** Whether to read the library's examples from its repository, at the installed version. Defaults to yes. */
  examples?: boolean
}

/** What generating found, for the person to check: counts, and what couldn't be decided. */
export interface GenerateReport {
  kind: "components" | "icons" | "app"
  package?: { name: string; version: string }
  components: number
  /** Exports the types can't decide about. They're left out, never guessed. */
  ambiguous: { name: string; reason: string }[]
  /** Capitalised exports that aren't components. */
  rejected: number
  tokens: Partial<Record<TokenCategory, number>>
  /** The themes tokens have values for, besides the default. */
  themes: string[]
  breakpoints: number
  icons?: number
  decorators: string[]
  /** Exports named like providers or toast hosts, which decorators may need. */
  providers: string[]
  notes: string[]
  /** How parts fit together, when they could be rendered: see `relateParts`. */
  parts?: PartsSummary
  /** What changed since the file being regenerated. */
  changes?: ComponentChanges
  /** Hand-edited exports the package no longer has. */
  orphanEdits?: string[]
  /** Where the examples parts were read from, and how many of its components they use. */
  examples?: ExampleSource & { used: number }
}

export interface PartsSummary {
  /** Components that throw when rendered alone with no props. */
  failedAlone: number
  /** Components given parents, by the signal that placed them. */
  parents: Partial<Record<ParentSignal, number>>
  /** Components that failed alone and render inside their parents with their samples. */
  fixed: number
  /** Components that still fail, with why, for a hand edit. */
  failing: { name: string; error: string }[]
  /** Exports that draw nothing of their own. */
  notVisual: number
}

export interface ComponentChanges {
  added: string[]
  /** Changed components, with the props added, removed or retyped. */
  changed: { name: string; added: string[]; removed: string[]; retyped: string[]; as?: string }[]
  removed: string[]
  unchanged: number
}

export interface GeneratedLibrary {
  /** A version 3 `.lib.par`, ready to write as JSON. */
  manifest: Record<string, unknown>
  report: GenerateReport
}

interface PackageJson {
  name?: string
  version?: string
  types?: string
  typings?: string
  style?: string
  exports?: unknown
}

/**
 * Describes a component library, an icon set or an app as a version 3 `.lib.par`: its components found with the type
 * checker, its tokens wherever it keeps them, written as DTCG in Parity's categories, its breakpoints, its icons' shape
 * and the decorators its components need.
 */
export async function generateLibrary(options: GenerateOptions): Promise<GeneratedLibrary> {
  return options.package ? describePackage(options, options.package) : describeApp(options)
}

async function describePackage(options: GenerateOptions, importName: string): Promise<GeneratedLibrary> {
  const root = resolve(options.root)
  const dir = await installedPackage(root, importName)
  if (!dir)
    throw new Error(`${importName} isn't installed in ${root}. Install it with the project's package manager first.`)
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as PackageJson
  const name = pkg.name ?? importName
  const version = pkg.version ?? "0.0.0"
  const preset: Preset | undefined = presets[name]
  const notes = [...(preset?.notes ?? [])]

  const iconImport = preset?.icons?.import
  const componentImport = iconImport ?? preset?.components
  const entry = typesEntry(dir, pkg, componentImport ? subpath(componentImport, name) : ".")
  if (!entry) notes.push("No type declarations were found, so no components could be read.")
  const scan: ComponentReport = entry
    ? findComponents({ entries: [entry], root })
    : { components: [], ambiguous: [], rejected: [], reactTypes: false }
  if (entry && !scan.reactTypes)
    notes.push("React's types (@types/react) aren't installed here; install them for exact results.")

  const dataIcons = preset?.icons?.render !== undefined && preset.icons.render !== "export"
  const isIcons = preset?.icons !== undefined || looksLikeIcons(scan)

  const tokens = new Map<string, CollectedToken>()
  const styles = preset?.styles ?? stylesheetOf(dir, pkg)
  if (styles) {
    for (const token of cssTokens(await readCss(exportedFile(dir, pkg, styles)))) tokens.set(token.var, token)
  }
  let breakpoints: LibraryBreakpoint[] | undefined
  if (preset?.theme) {
    try {
      const theme = await preset.theme(loader(root, dir))
      for (const token of theme.tokens) tokens.set(token.var, token)
      breakpoints = theme.breakpoints
    } catch (error) {
      notes.push(`Its theme object couldn't be read: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  pairLineHeights(tokens)
  const dtcgFile = await dtcgIn(dir)
  breakpoints ??= breakpointsOf([...tokens.values()])

  const report = baseReport(isIcons ? "icons" : "components", scan, [...tokens.values()], notes)
  report.package = { name, version }
  const manifest: Record<string, unknown> = {
    version: 3,
    id: options.id ?? preset?.id ?? name.replace(/^@[^/]+\//, "").replace(/^react-/, ""),
    name: options.name ?? preset?.name ?? name,
    ...((options.description ?? preset?.description)
      ? { description: options.description ?? preset?.description }
      : {}),
    package: { name, version, range: options.range ?? defaultRange(version) }
  }
  if (styles && !isIcons) manifest.styles = styles
  if (breakpoints.length > 0) {
    manifest.breakpoints = breakpoints
    report.breakpoints = breakpoints.length
  }
  if (dtcgFile) {
    manifest.tokens = dtcgFile.tokens
    notes.push(`Tokens are its own DTCG file, ${dtcgFile.path}.`)
  } else if (tokens.size > 0) manifest.tokens = toDtcg([...tokens.values()], commonPrefix([...tokens.keys()]))

  if (isIcons) {
    const icons: LibraryIcons = { render: preset?.icons?.render ?? "export" }
    if (iconImport) icons.import = iconImport
    if (preset?.icons?.match) icons.match = preset.icons.match
    if (!dataIcons) {
      // Namespaces (Phosphor's `SSR`) aren't listed in the panel, so only top-level exports need leaving out.
      const notIcons = scan.components
        .filter((component) => component.requiredProps.length > 0 && !component.name.includes("."))
        .map((component) => component.name)
      if (notIcons.length > 0) icons.exclude = notIcons
    }
    if (preset?.icons?.variants) icons.variants = preset.icons.variants
    icons.count = await countIcons(loader(root, dir), iconImport ?? name, icons)
    manifest.icons = icons
    report.icons = icons.count
    report.components = 0
  } else {
    const providers = (preset?.decorators ?? []).flatMap((decorator) => (decorator.wrap ? [decorator.wrap] : []))
    let uses = new Map<string, ExampleUse>()
    if (options.examples !== false) {
      const fetched = await fetchExamples(pkg, dir, preset?.examples)
      if (fetched.note) notes.push(fetched.note)
      uses = readExamples(
        fetched.files,
        scan.components.map((component) => component.name)
      )
      if (fetched.source) report.examples = { ...fetched.source, used: uses.size }
    }
    const parts = await relateParts(
      loader(root, dir),
      componentImport ?? name,
      scan.components,
      providers,
      options.trialEdits?.components,
      uses
    )
    if (parts.note) notes.push(parts.note)
    const list: Record<string, LibraryComponent> = {}
    for (const component of scan.components) {
      const inside = component.file.startsWith(dir.replaceAll(sep, "/")) || component.file.startsWith(dir)
      const relation = parts.relations.get(component.name)
      list[component.name] = {
        as: component.as,
        ...(inside && exportsByName(component.file, component.name)
          ? { declaration: relativePath(dir, component.file) }
          : {}),
        group: component.group,
        ...(relation?.parents ? { parents: relation.parents, parentsFrom: relation.parentsFrom ?? "prefix" } : {}),
        ...(relation?.visual === false ? { visual: false } : {}),
        ...(relation?.sample ? { sample: relation.sample } : {}),
        fingerprint: component.fingerprint,
        ...(Object.keys(component.props).length > 0 ? { props: component.props } : {})
      }
    }
    if (parts.tried) report.parts = summarizeParts(parts.relations)
    if (Object.keys(list).length > 0) {
      manifest.components = { ...(componentImport ? { import: componentImport } : {}), list }
    }
  }
  if (preset?.decorators?.length) {
    manifest.decorators = preset.decorators
    report.decorators = preset.decorators.map(describeDecorator)
  }
  // Checking against the schema here means a bad preset fails at generation, not when the app loads it.
  parseLibraryManifest(manifest)
  return reviseLibrary({ manifest, report }, options)
}

/**
 * Lays a freshly generated file over the one it replaces: reports which components are new, changed and removed,
 * keeps the old entries `only` leaves alone, and carries the hand edits over (or points at shared ones), reporting
 * any whose export has gone. Edits are never dropped silently.
 */
export async function reviseLibrary(
  generated: GeneratedLibrary,
  options: Pick<GenerateOptions, "previous" | "only" | "edits" | "editsBase" | "root">
): Promise<GeneratedLibrary> {
  const manifest = { ...generated.manifest }
  const report = { ...generated.report }
  const previous = previousComponents(options.previous)
  const components = manifest.components as { import?: string; list: Record<string, LibraryComponent> } | undefined
  if (previous && components) {
    report.changes = compareComponents(previous, components.list)
    manifest.components = {
      ...components,
      list: selectComponents(previous, components.list, report.changes, options.only ?? "all")
    }
  }
  const kept = (options.previous as Record<string, unknown> | undefined)?.edits
  const edits = options.edits ?? kept
  if (edits !== undefined) {
    manifest.edits = edits
    const resolved = parseLibraryEdits(
      typeof edits === "string"
        ? parseJsonc(await readFile(resolve(options.editsBase ?? options.root, edits), "utf8"))
        : edits
    )
    const { orphans } = applyLibraryEdits(parseLibraryManifest(manifest), resolved)
    if (orphans.length > 0) report.orphanEdits = orphans
  }
  return { manifest, report }
}

function previousComponents(previous: unknown): Record<string, LibraryComponent> | undefined {
  if (typeof previous !== "object" || previous === null) return undefined
  try {
    return parseLibraryManifest(previous).components?.list
  } catch {
    return undefined
  }
}

/**
 * What changed between two versions of a library's components, by fingerprint: new, removed, and changed ones with the
 * props added, removed or retyped. A file written before fingerprints counts every component as changed.
 */
export function compareComponents(
  before: Record<string, LibraryComponent>,
  after: Record<string, LibraryComponent>
): ComponentChanges {
  const changes: ComponentChanges = { added: [], changed: [], removed: [], unchanged: 0 }
  for (const [name, now] of Object.entries(after)) {
    const then = before[name]
    if (!then) changes.added.push(name)
    else if (then.fingerprint && then.fingerprint === now.fingerprint) changes.unchanged++
    else {
      const old = propTypes(then.props)
      const fresh = propTypes(now.props)
      changes.changed.push({
        name,
        added: [...fresh.keys()].filter((prop) => !old.has(prop)),
        removed: [...old.keys()].filter((prop) => !fresh.has(prop)),
        retyped: [...fresh.keys()].filter((prop) => old.has(prop) && old.get(prop) !== fresh.get(prop)),
        ...(then.as === now.as ? {} : { as: `${then.as} to ${now.as}` })
      })
    }
  }
  changes.removed = Object.keys(before).filter((name) => !(name in after))
  return changes
}

/** Each prop by name, without the `?` that marks it optional, to its type hash and whether it's optional. */
function propTypes(props: Record<string, string> | undefined): Map<string, string> {
  return new Map(
    Object.entries(props ?? {}).map(([prop, kind]) => [
      prop.endsWith("?") ? prop.slice(0, -1) : prop,
      prop.endsWith("?") ? `${kind}?` : kind
    ])
  )
}

/**
 * The components to write: every one found (`all`), or the file as it was plus new components (`new`) or plus
 * these named ones. Components the package no longer has are dropped either way, since they can't be imported.
 */
export function selectComponents(
  before: Record<string, LibraryComponent>,
  after: Record<string, LibraryComponent>,
  changes: ComponentChanges,
  only: "all" | "new" | string[]
): Record<string, LibraryComponent> {
  if (only === "all") return after
  const picked = new Set(only === "new" ? changes.added : only)
  const list: Record<string, LibraryComponent> = {}
  for (const name of Object.keys(after)) {
    const chosen = picked.has(name) ? after[name] : before[name]
    if (chosen) list[name] = chosen
  }
  return list
}

function summarizeParts(relations: Map<string, PartRelation>): PartsSummary {
  const summary: PartsSummary = { failedAlone: 0, parents: {}, fixed: 0, failing: [], notVisual: 0 }
  for (const [name, relation] of relations) {
    if (relation.visual === false) summary.notVisual++
    if (relation.parentsFrom) summary.parents[relation.parentsFrom] = (summary.parents[relation.parentsFrom] ?? 0) + 1
    // Contexts and RootProviders draw nothing, so they're neither failures nor fixes.
    if (!relation.alone || relation.visual === false) continue
    summary.failedAlone++
    if (relation.inside) summary.failing.push({ name, error: relation.inside })
    else summary.fixed++
  }
  return summary
}

async function describeApp(options: GenerateOptions): Promise<GeneratedLibrary> {
  const root = resolve(options.root)
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as PackageJson
  const notes: string[] = []
  const config = appConfig(root)
  if (!config) notes.push("No tsconfig.json or jsconfig.json, so every .tsx and .jsx file under src was read.")
  const files = (config?.fileNames ?? (await sourceFiles(join(root, "src")))).filter(
    (file) => /\.[jt]sx$/.test(file) && !/\.(stories|test|spec)\.[jt]sx$/.test(file) && !file.includes("/node_modules/")
  )
  const scan = findComponents({
    entries: files,
    root,
    ...(config ? { compilerOptions: config.options } : {}),
    defaultExports: true
  })
  // One name in two files gains its folder, as in `ui/FieldError`, so neither is lost.
  const counts = new Map<string, number>()
  for (const component of scan.components) counts.set(component.name, (counts.get(component.name) ?? 0) + 1)
  const list: Record<string, LibraryComponent> = {}
  for (const component of scan.components) {
    const folder = basename(dirname(component.file))
    const id = (counts.get(component.name) ?? 0) > 1 ? `${folder}/${component.name}` : component.name
    list[id] = { as: component.as, declaration: relativePath(root, component.file), group: component.group }
  }
  const tokens = new Map<string, CollectedToken>()
  for (const stylesheet of await appStylesheets(root)) {
    for (const token of cssTokens(await readCss(join(root, stylesheet)))) tokens.set(token.var, token)
  }
  pairLineHeights(tokens)
  const breakpoints = breakpointsOf([...tokens.values()])
  const name = pkg.name ?? basename(root)
  const manifest: Record<string, unknown> = {
    version: 3,
    id: options.id ?? name.replace(/^@[^/]+\//, ""),
    name: options.name ?? name,
    ...(options.description ? { description: options.description } : {}),
    ...(breakpoints.length > 0 ? { breakpoints } : {}),
    ...(tokens.size > 0 ? { tokens: toDtcg([...tokens.values()]) } : {}),
    ...(Object.keys(list).length > 0 ? { components: { list } } : {})
  }
  const report = baseReport("app", scan, [...tokens.values()], notes)
  report.breakpoints = breakpoints.length
  parseLibraryManifest(manifest)
  return { manifest, report }
}

/**
 * Where an app's `.lib.par` goes: an existing one at its root, else `<package name>.lib.par`. Writing it there makes
 * the app a library Parity opens on the canvas.
 */
export async function appManifestPath(root: string): Promise<string> {
  const existing = (await readdir(root)).find((file) => file.endsWith(libraryManifestExtension))
  if (existing) return join(root, existing)
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as PackageJson
  return join(root, `${(pkg.name ?? basename(root)).replace(/^@[^/]+\//, "")}${libraryManifestExtension}`)
}

/**
 * A generated manifest laid over the file already there: what generating finds replaces what it found before, and
 * what a person wrote (the canvas, decorators, a name or description) stays.
 */
export function mergeManifest(existing: unknown, generated: Record<string, unknown>): Record<string, unknown> {
  if (typeof existing !== "object" || existing === null) return generated
  const kept = existing as Record<string, unknown>
  const authored = ["$schema", "id", "name", "description", "decorators", "edits", "canvas"]
  const merged: Record<string, unknown> = { ...generated }
  for (const key of authored) if (kept[key] !== undefined) merged[key] = kept[key]
  return merged
}

function baseReport(
  kind: GenerateReport["kind"],
  scan: ComponentReport,
  tokens: CollectedToken[],
  notes: string[]
): GenerateReport {
  const counts: Partial<Record<TokenCategory, number>> = {}
  for (const token of tokens) counts[token.category] = (counts[token.category] ?? 0) + 1
  return {
    kind,
    components: scan.components.length,
    ambiguous: scan.ambiguous,
    rejected: scan.rejected.length,
    tokens: counts,
    themes: [...new Set(tokens.flatMap((token) => Object.keys(token.values)))].filter((theme) => theme !== "default"),
    breakpoints: 0,
    decorators: [],
    providers: scan.components
      .map((component) => component.name)
      .filter((name) => /(?:Provider|Toaster|Toast\.Viewport|Notifications)$/.test(name))
      // Chakra gives each component a `…PropsProvider` and `…RootProvider`; those pass props, not the app's context.
      .filter((name) => !/(?:Props|Root|Node|Adapter)Provider$/.test(name)),
    notes
  }
}

function describeDecorator(decorator: NonNullable<LibraryManifest["decorators"]>[number]): string {
  const when = decorator.when
    ? ` when ${Object.entries(decorator.when)
        .map(([key, value]) => `${key} is ${value}`)
        .join(" and ")}`
    : ""
  if (decorator.wrap) return `wraps in ${decorator.wrap.component} from ${decorator.wrap.import}${when}`
  if (decorator.add) return `adds ${decorator.add.component} from ${decorator.add.import}${when}`
  if (decorator.class !== undefined) return `adds a class to the frame${when}`
  if (decorator.attributes) return `sets ${Object.keys(decorator.attributes).join(", ")} on the frame${when}`
  return `styles the frame${when}`
}

/**
 * Whether a package is an icon set: hundreds of components that take no required props and nearly all share one type,
 * as Lucide's `LucideIcon` or Fluent's `FluentIcon`. A component library's components each have their own props.
 */
function looksLikeIcons(scan: ComponentReport): boolean {
  if (scan.components.length < 200) return false
  const types = new Map<string, number>()
  for (const component of scan.components) {
    if (component.requiredProps.length === 0) types.set(component.type, (types.get(component.type) ?? 0) + 1)
  }
  return Math.max(0, ...types.values()) / scan.components.length > 0.9
}

/** `^9.0.0` for 9.5.0, and `^0.4.0` for 0.4.1, since a 0.x minor can break. */
function defaultRange(version: string): string {
  const [major = "0", minor = "0"] = version.split(/[.-]/)
  return major === "0" ? `^0.${minor}.0` : `^${major}.0.0`
}

function subpath(specifier: string, packageName: string): string {
  return specifier === packageName ? "." : `.${specifier.slice(packageName.length)}`
}

/** The type declarations for one of a package's entry points, from `exports`, else `types`, else `index.d.ts`. */
function typesEntry(dir: string, pkg: PackageJson, entry: string): string | undefined {
  const exported =
    typeof pkg.exports === "object" && pkg.exports !== null ? (pkg.exports as Record<string, unknown>) : {}
  const condition = (value: unknown): string | undefined => {
    if (typeof value === "string") return /\.d\.[cm]?ts$/.test(value) ? value : undefined
    if (typeof value !== "object" || value === null) return undefined
    const record = value as Record<string, unknown>
    for (const key of ["types", "import", "default", "require"]) {
      const found = condition(record[key])
      if (found) return found
    }
    return undefined
  }
  const candidates = [
    condition(exported[entry]),
    entry === "." ? (pkg.types ?? pkg.typings) : undefined,
    entry === "." ? "index.d.ts" : `${entry.slice(2)}/index.d.ts`,
    entry === "." ? undefined : `${entry.slice(2)}.d.ts`
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(join(dir, candidate))) return join(dir, candidate).replaceAll("\\", "/")
  }
  return undefined
}

/** The stylesheet a project imports to use a package: its `style` field, else the CSS its `exports` list first. */
function stylesheetOf(dir: string, pkg: PackageJson): string | undefined {
  if (pkg.style && existsSync(join(dir, pkg.style))) return pkg.style
  const exported = typeof pkg.exports === "object" && pkg.exports !== null ? Object.keys(pkg.exports) : []
  const css = exported.filter((key) => key.endsWith(".css")).map((key) => key.slice(2))
  const preferred = ["tailwind.css", "styles.css", "style.css", "index.css", "theme.css"]
  const pick = preferred.find((name) => css.includes(name)) ?? css[0]
  if (!pick) return undefined
  const target = (pkg.exports as Record<string, unknown>)[`./${pick}`]
  const file = typeof target === "string" ? target : (target as Record<string, unknown> | undefined)?.default
  return typeof file === "string" && existsSync(join(dir, file)) ? pick : undefined
}

/** The file an export such as `tailwind.css` points at: `dist/tailwind.css` for Buildkit's styles. */
function exportedFile(dir: string, pkg: PackageJson, specifier: string): string {
  const exported =
    typeof pkg.exports === "object" && pkg.exports !== null ? (pkg.exports as Record<string, unknown>) : {}
  const target = exported[`./${specifier}`]
  const file = typeof target === "string" ? target : (target as Record<string, unknown> | undefined)?.default
  return join(dir, typeof file === "string" ? file : specifier)
}

/** A stylesheet with its relative `@import`s inlined, so a Tailwind entry brings its theme file with it. */
async function readCss(path: string, seen = new Set<string>()): Promise<string> {
  if (seen.has(path)) return ""
  seen.add(path)
  const source = await readFile(path, "utf8").catch(() => "")
  const parts: string[] = []
  let last = 0
  for (const match of source.matchAll(/@import\s+(?:url\()?["'](\.{1,2}\/[^"']+\.css)["']\)?[^;]*;/g)) {
    parts.push(source.slice(last, match.index), await readCss(join(dirname(path), match[1]!), seen))
    last = match.index + match[0].length
  }
  parts.push(source.slice(last))
  return parts.join("")
}

/** A DTCG token file the package ships, if it has one in the format; Buildkit's `tokens.json` isn't yet. */
async function dtcgIn(dir: string): Promise<{ path: string; tokens: Record<string, unknown> } | undefined> {
  for (const candidate of ["tokens.json", "dist/tokens.json", "tokens.resolver.json", "dist/tokens.resolver.json"]) {
    const text = await readFile(join(dir, candidate), "utf8").catch(() => undefined)
    if (!text) continue
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      if (Array.isArray(parsed.resolutionOrder) || /"\$value"\s*:/.test(text))
        return { path: candidate, tokens: parsed }
    } catch {
      // Not JSON; not tokens.
    }
  }
  return undefined
}

/** The prefix most custom properties share, as in `mantine-`, which token paths leave out. */
function commonPrefix(names: string[]): string {
  const counts = new Map<string, number>()
  for (const name of names) {
    const first = /^([a-z]+)-/.exec(name)?.[1]
    if (first) counts.set(first, (counts.get(first) ?? 0) + 1)
  }
  const [best, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ["", 0]
  return count / Math.max(names.length, 1) > 0.5 ? `${best}-` : ""
}

/**
 * How many icons a set holds, counted the way the Icons panel lists them: its matching exports, each alias of one icon
 * (Lucide's `Heart` and `HeartIcon`) once. The package is loaded to tell aliases apart, since types can't.
 */
async function countIcons(load: Load, specifier: string, icons: LibraryIcons): Promise<number> {
  const module = await load(specifier).catch(() => ({}) as Record<string, unknown>)
  const pattern = icons.match ? new RegExp(icons.match) : /^[A-Z]/
  const excluded = new Set(icons.exclude)
  const drawable = (value: unknown) =>
    icons.render !== "export"
      ? value !== undefined && typeof value !== "function"
      : typeof value === "function" || (typeof value === "object" && value !== null && "$$typeof" in value)
  const values = Object.entries(module)
    .filter(([key, value]) => pattern.test(key) && !excluded.has(key) && drawable(value))
    .map(([, value]) => value)
  return new Set(values).size
}

/** Whether a declaration file exports a name directly, so the props reader can find it there. */
function exportsByName(file: string, name: string): boolean {
  if (name.includes(".")) return false
  const source = ts.sys.readFile(file) ?? ""
  return new RegExp(
    `export\\s+(?:declare\\s+)?(?:const|function|class|let|var)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`
  ).test(source)
}

/**
 * Imports a module from the project, as the project's code would, for reading theme objects and counting icons.
 * Packages a library depends on, such as Fluent's `@fluentui/tokens`, may only be reachable from the library itself.
 */
function loader(root: string, packageDir: string): Load {
  return async (specifier) => {
    for (const from of [root, packageDir]) {
      const path = (await resolveImport(from, specifier)) ?? resolveRequire(from, specifier)
      if (path) return (await import(pathToFileURL(path).href)) as Record<string, unknown>
    }
    throw new Error(`Can't find ${specifier} from ${root}`)
  }
}

function resolveRequire(from: string, specifier: string): string | undefined {
  try {
    return createRequire(join(from, "package.json")).resolve(specifier)
  } catch {
    return undefined
  }
}

/** An ESM-only package's entry, from the `import` condition of its `exports`, which `require` can't see. */
async function resolveImport(from: string, specifier: string): Promise<string | undefined> {
  const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!
  const dir = await installedPackage(from, name)
  if (!dir) return undefined
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as PackageJson & { module?: string }
  const exported =
    typeof pkg.exports === "object" && pkg.exports !== null ? (pkg.exports as Record<string, unknown>) : {}
  const pick = (value: unknown): string | undefined => {
    if (typeof value === "string") return /\.d\.[cm]?ts$/.test(value) ? undefined : value
    if (typeof value !== "object" || value === null) return undefined
    const record = value as Record<string, unknown>
    for (const key of ["node", "import", "default"]) {
      const found = pick(record[key])
      if (found) return found
    }
    return undefined
  }
  const file = pick(exported[subpath(specifier, name)]) ?? (specifier === name ? pkg.module : undefined)
  return file ? join(dir, file) : undefined
}

function appConfig(root: string): ts.ParsedCommandLine | undefined {
  for (const name of ["tsconfig.app.json", "tsconfig.json", "jsconfig.json"]) {
    const path = join(root, name)
    if (!existsSync(path)) continue
    const parsed = ts.getParsedCommandLineOfConfigFile(
      path,
      {},
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined }
    )
    if (parsed && parsed.fileNames.length > 0) return parsed
  }
  return undefined
}

async function sourceFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    const path = join(folder, entry.name).replaceAll("\\", "/")
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      files.push(...(await sourceFiles(path)))
    } else if (/\.[jt]sx?$/.test(entry.name)) files.push(path)
  }
  return files
}

/** An app's global stylesheets: shadcn's `components.json` names one; otherwise the usual places. */
async function appStylesheets(root: string): Promise<string[]> {
  const shadcn = await readFile(join(root, "components.json"), "utf8").then(
    (text) => JSON.parse(text) as { tailwind?: { css?: string } },
    () => undefined
  )
  if (shadcn?.tailwind?.css) return [shadcn.tailwind.css]
  return ["src/index.css", "src/styles.css", "src/app.css", "src/globals.css", "app/globals.css"].filter((path) =>
    existsSync(join(root, path))
  )
}
