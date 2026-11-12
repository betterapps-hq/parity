import { readdir, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { basename, dirname, join, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"
import {
  appFiles,
  type ComponentReport,
  type ComponentScan,
  findComponents,
  readTsconfig,
  relativePath
} from "@parity-app/code"
import {
  applyLibraryEdits,
  iconAliases,
  iconVariants,
  type LibraryBreakpoint,
  type LibraryComponent,
  type LibraryComponents,
  type LibraryIcons,
  type LibraryEdits,
  type LibraryManifest,
  libraryManifestExtension,
  jsonText,
  type ParentSignal,
  parseData,
  parseLibraryManifest,
  plainObject,
  type TokenCategory
} from "@parity-app/core"
import {
  findPackage,
  findStyles,
  packageEntry,
  packageStylesheet,
  readPackage,
  readStylesheet,
  splitSpecifier
} from "@parity-app/project"
import { readLibraryEdits } from "@parity-app/registry"
import ts from "typescript"
import { z } from "zod"
import { type AnatomyCheck, checkAnatomy, readAnatomy } from "./anatomy.ts"
import {
  type ExampleFile,
  type ExampleSource,
  type ExampleUse,
  exampleItem,
  fetchExamples,
  readExamples
} from "./examples.ts"
import { hostedParts, type RenderCall, readRenders, renderedIn } from "./hosts.ts"
import { preferredExports, typesFor } from "./icon-exports.ts"
import { type DrawIcon, styleModules } from "./icon-styles.ts"
import { type ExportedIcon, readIconTags } from "./icon-tags.ts"
import { exported, isComponent, isFunction, isRecord, isText, type Live, type LiveObject, type Load } from "./live.ts"
import { type PartRelation, relateParts } from "./parts.ts"
import { presets } from "./presets.ts"
import { breakpointsOf, type CollectedToken, cssTokens, pairLineHeights, toDtcg } from "./tokens.ts"

export { componentOptions, findComponents, reactProbe, withReactProbe } from "@parity-app/code"

export { guessParent, relateParts } from "./parts.ts"

export { familyOf, fetchExamples, nearestParent, normalizeRepo, readExamples } from "./examples.ts"

export { parseLibraryEdits } from "@parity-app/core"

export { manifestText } from "./icon-tags.ts"

export { presets } from "./presets.ts"

export { cssTokens, toDtcg } from "./tokens.ts"

export type { Live } from "./live.ts"

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
  /** The file being regenerated, as JSON, to report what changed and keep what `only` leaves alone. */
  previous?: Live
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
  /** Whether to read an icon set's tags from its published metadata, at the installed version. Defaults to yes. */
  tags?: boolean
  /** Why parts failed in the running app, by part, as `parity lib check --record` keeps them. */
  appErrors?: Record<string, string>
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
  /** How many icons got tags from the set's published metadata, of how many, and where they were read. */
  iconTags?: { matched: number; of: number; source: string }
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
  /** How the chains compare with the anatomy the library's docs show, when its preset names them. */
  anatomy?: AnatomyCheck
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
  changed: ComponentChange[]
  removed: string[]
  unchanged: number
}

/** A component whose fingerprint changed: the props added, removed or retyped, and what it's now found as. */
export interface ComponentChange {
  name: string
  added: string[]
  removed: string[]
  retyped: string[]
  as?: string
}

/** A library's components by name, as its file lists them. */
type ComponentList = LibraryComponents["list"]

export interface GeneratedLibrary {
  /** A `.lib.par`, ready to write as JSON. */
  manifest: LibraryManifest
  report: GenerateReport
}

/** The file being regenerated: what it reads as, and its own object, whose authored fields are kept as written. */
interface PreviousLibrary {
  manifest: LibraryManifest
  file: LiveObject
}

/**
 * Describes a component library, an icon set or an app as a `.lib.par`: its components found with the type
 * checker, its tokens wherever it keeps them, written as DTCG in Parity's categories, its breakpoints, its icons' shape
 * and the decorators its components need.
 */
export async function generateLibrary(options: GenerateOptions): Promise<GeneratedLibrary> {
  return options.package ? describePackage(options, options.package) : describeApp(options)
}

async function describePackage(options: GenerateOptions, importName: string): Promise<GeneratedLibrary> {
  const root = resolve(options.root)
  const installed = await findPackage(root, importName)

  if (!installed) {
    throw new Error(`${importName} isn't installed in ${root}. Install it with the project's package manager first.`)
  }

  const { dir, manifest: pkg } = installed
  const name = pkg.name ?? importName
  const version = pkg.version ?? "0.0.0"
  const preset = presets.get(name)
  const notes = [...(preset?.notes ?? [])]

  const iconImport = preset?.icons?.import
  const componentImport = iconImport ?? preset?.components

  const entry = packageEntry(
    installed,
    "types",
    componentImport ? splitSpecifier(componentImport).subpath : "."
  )?.replaceAll("\\", "/")

  if (!entry) {
    notes.push("No type declarations were found, so no components could be read.")
  }

  const scan: ComponentReport = entry
    ? findComponents({ entries: [entry], root })
    : { components: [], ambiguous: [], rejected: [], reactTypes: false }

  if (entry && !scan.reactTypes) {
    notes.push("React's types (@types/react) aren't installed here; install them for exact results.")
  }

  const dataIcons = preset?.icons?.render !== undefined && preset.icons.render !== "export"
  const isIcons = preset?.icons !== undefined || looksLikeIcons(scan)

  const tokens = new Map<string, CollectedToken>()
  const styles = preset?.styles ?? packageStylesheet(installed)
  const stylesheet = styles && packageEntry(installed, "style", styles)

  if (stylesheet) {
    for (const token of cssTokens(await readStylesheet(stylesheet))) {
      tokens.set(token.var, token)
    }
  }

  let breakpoints: LibraryBreakpoint[] | undefined

  if (preset?.theme) {
    try {
      const theme = await preset.theme(loader(root, dir))

      for (const token of theme.tokens) {
        tokens.set(token.var, token)
      }

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

  const manifest: LibraryManifest = {
    version: 4,
    id: options.id ?? preset?.id ?? name.replace(/^@[^/]+\//, "").replace(/^react-/, ""),
    name: options.name ?? preset?.name ?? name
  }

  const description = options.description ?? preset?.description

  if (description) {
    manifest.description = description
  }

  manifest.package = { name, version, range: options.range ?? defaultRange(version) }

  if (styles && !isIcons) {
    manifest.styles = styles
  }

  if (breakpoints.length > 0) {
    manifest.breakpoints = breakpoints
    report.breakpoints = breakpoints.length
  }

  if (dtcgFile) {
    manifest.tokens = dtcgFile.tokens
    notes.push(`Tokens are its own DTCG file, ${dtcgFile.path}.`)
  } else if (tokens.size > 0) {
    manifest.tokens = toDtcg([...tokens.values()], commonPrefix([...tokens.keys()]))
  }

  if (isIcons) {
    const icons: LibraryIcons = { render: preset?.icons?.render ?? "export" }

    if (iconImport) {
      icons.import = iconImport
    }

    if (preset?.icons?.match) {
      icons.match = preset.icons.match
    }

    if (!dataIcons) {
      // Namespaces (Phosphor's `SSR`) aren't listed in the panel, so only top-level exports need leaving out.
      const notIcons = scan.components
        .filter((component) => component.requiredProps.length > 0 && !component.name.includes("."))
        .map((component) => component.name)

      if (notIcons.length > 0) {
        icons.exclude = notIcons
      }
    }

    if (preset?.icons?.variants) {
      icons.variants = preset.icons.variants
    }

    if (!dataIcons) {
      // Styles kept in modules of their own, as Heroicons keeps `16/solid` beside `24/outline`.
      const load = loader(root, dir)

      const entries = isRecord(pkg.exports) ? Object.keys(pkg.exports) : []

      const modules = await styleModules(name, entries, iconImport ?? name, load, await iconDrawer(load))

      if (modules) {
        const main = Object.keys(modules).find((style) => modules[style] === (iconImport ?? name))!
        icons.variants = {
          ...icons.variants,
          modules,
          styles: Object.keys(modules),
          default: { ...icons.variants?.default, style: main }
        }
      }
    }

    const exported = await exportedIcons(loader(root, dir), iconImport ?? name, icons)
    icons.count = exported.count
    // Where an icon has several names, the one its types say to insert (Phosphor's current `GearIcon`, not `Gear`).
    const typesFile = typesFor(iconImport ?? name, root)

    if (typesFile) {
      const usable = icons.match ? new RegExp(icons.match) : /^[A-Z]/
      const prefer = preferredExports(typesFile, exported.groups, (candidate) => usable.test(candidate))

      if (prefer.length > 0) {
        icons.prefer = prefer
      }
    }

    if (preset?.tags && options.tags !== false) {
      try {
        const found = await readIconTags(preset.tags, { name, version }, exported.icons)

        if (found.matched > 0) {
          icons.tags = found.tags
          icons.tagSource = found.source
        }

        report.iconTags = { matched: found.matched, of: exported.icons.length, source: found.source }
      } catch (error) {
        notes.push(`Its tags weren't read: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    manifest.icons = icons
    report.icons = icons.count
    report.components = 0
  } else {
    const providers = (preset?.decorators ?? []).flatMap((decorator) => (decorator.wrap ? [decorator.wrap] : []))
    let uses = new Map<string, ExampleUse>()
    let anatomy = new Map<string, string[][]>()
    let exampleFiles: ExampleFile[] = []

    if (options.examples !== false) {
      const fetched = await fetchExamples(pkg, dir, preset?.examples)

      if (fetched.note) {
        notes.push(fetched.note)
      }

      const componentNames = scan.components.map((component) => component.name)
      exampleFiles = fetched.files

      // The functions the package exports, which examples may import from where the package takes them (Chakra's
      // `parseDate`, from `@internationalized/date`).
      const own = pkg.name
        ? await loader(
            root,
            dir
          )(pkg.name)
            .then((module) => new Set(Object.keys(module).filter((key) => isFunction(module[key]))))
            .catch(() => new Set<string>())
        : new Set<string>()

      uses = readExamples(fetched.files, componentNames, pkg.name, own)
      anatomy = readAnatomy(fetched.docs ?? [], componentNames)

      if (fetched.source) {
        report.examples = { ...fetched.source, used: uses.size }
      }
    }

    // What the package's own components render, for parts no example shows and for what only a host renders.
    const names = scan.components.map((component) => component.name)
    const calls = new Map<string, RenderCall[]>()
    const made = new Set<string>()
    const renders = await readRenders(dir, names, calls, made)

    // Parts the package draws from a list it keeps (`toasts.map((toast) => <Toast toast={toast} />)`) get an item of
    // it from the examples: what they hand the package's own manager (`toast.add({ title })`) or a hook's result.
    const takesItem = new Set(
      [...calls].flatMap(([part, list]) =>
        list.some((call) => Object.values(call.props).some((passed) => "item" in passed)) ? [part] : []
      )
    )

    const listItem = takesItem.size > 0 ? exampleItem(exampleFiles, made) : undefined

    const parts = await relateParts(
      loader(root, dir),
      componentImport ?? name,
      scan.components,
      providers,
      options.trialEdits?.components,
      uses,
      renderedIn(renders),
      calls,
      listItem,
      options.appErrors
    )

    if (parts.note) {
      notes.push(parts.note)
    }

    // Parts only a host the decorators add renders, and no example places, aren't for placing, unless they render with
    // the list item the host draws them from (Buildkit's Toast and the parts inside it).
    const hosts = (preset?.decorators ?? []).flatMap((decorator) =>
      decorator.add && !decorator.add.component.includes(".") ? [decorator.add.component] : []
    )

    const drawnTree = new Set(parts.drawn)

    if (hosts.length > 0) {
      for (const hosted of hostedParts(renders, hosts, names)) {
        if (uses.has(hosted)) {
          continue
        }

        const relation = parts.relations.get(hosted)

        if (listItem && drawnTree.has(hosted) && !relation?.inside) {
          continue
        }

        parts.relations.set(hosted, { ...relation, visual: false })
      }
    }

    // Parts every example draws from a list a hook returns (toasts from the toast manager) stay placeable, with the
    // item the examples hand the hook as their sample; the report names them, as they render only with that item.
    const fromHook = [...uses].flatMap(([part, use]) => (use.fromHook ? [part] : []))

    if (fromHook.length > 0) {
      notes.push(`Drawn from a hook's list in every example, sampled with the item it's given: ${fromHook.join(", ")}`)
    }

    // Parts the package renders inside its own components, and that no example or docs page places, are internal.
    const owners = renderedIn(renders)

    const internal = new Set(
      names.filter(
        (part) =>
          // Only when examples were read: without them nothing is known to be placed.
          uses.size > 0 &&
          !uses.has(part) &&
          !anatomy.has(part) &&
          !hosts.includes(part) &&
          (owners.get(part) ?? []).some((owner) => owner !== part && names.includes(owner))
      )
    )

    const list: ComponentList = {}

    for (const component of scan.components) {
      const inside = component.file.startsWith(dir.replaceAll(sep, "/")) || component.file.startsWith(dir)
      const relation = parts.relations.get(component.name)
      const entry: LibraryComponent = { as: component.as }

      if (inside && exportsByName(component.file, component.name)) {
        entry.declaration = relativePath(dir, component.file)
      }

      entry.group = component.group

      if (relation?.parents) {
        entry.parents = relation.parents
        entry.parentsFrom = relation.parentsFrom ?? "prefix"
      }

      if (relation?.optionalParents) {
        entry.optionalParents = relation.optionalParents
      }

      if (relation?.parentParts) {
        entry.parentParts = true
      }

      if (relation?.visual === false) {
        entry.visual = false
      }

      if (internal.has(component.name)) {
        entry.internal = true
      }

      if (relation?.sample) {
        entry.sample = relation.sample
      }

      entry.fingerprint = component.fingerprint

      if (Object.keys(component.props).length > 0) {
        entry.props = component.props
      }

      list[component.name] = entry
    }

    if (parts.tried) {
      report.parts = summarizeParts(parts.relations)
    }

    // The docs' own anatomy, as a check on every chain each time the file is made.
    if (anatomy.size > 0) {
      report.anatomy = checkAnatomy(anatomy, list)
    }

    if (Object.keys(list).length > 0) {
      manifest.components = componentImport ? { import: componentImport, list } : { list }
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
  const read = readPrevious(options.previous)
  const previous = read?.manifest.components?.list
  const components = manifest.components

  if (previous && components) {
    report.changes = compareComponents(previous, components.list)
    manifest.components = {
      ...components,
      list: selectComponents(previous, components.list, report.changes, options.only ?? "all")
    }
  }

  // SAFETY: the file read through the library schema in readPrevious, so its edits, kept as written, are a path or
  // edits the schema reads.
  const kept = read?.file.edits as LibraryManifest["edits"]
  const edits = options.edits ?? kept

  if (edits !== undefined) {
    manifest.edits = edits
    const resolved = await readLibraryEdits(edits, resolve(options.editsBase ?? options.root))
    const { orphans } = applyLibraryEdits(parseLibraryManifest(manifest), resolved)

    if (orphans.length > 0) {
      report.orphanEdits = orphans
    }
  }

  return { manifest, report }
}

/**
 * The library file being regenerated, read through the library schema (PAR-594), and the file's own object, whose
 * edits and authored fields are kept as written. One that doesn't read stops generation, naming the field, since
 * writing over it would lose what a person wrote there.
 */
function readPrevious(previous: Live): PreviousLibrary | undefined {
  if (previous === undefined) {
    return undefined
  }

  try {
    const manifest = parseLibraryManifest(previous)
    parseData(plainObject, previous)

    // The schema reads only an object, so a file that read is one.
    return isRecord(previous) ? { manifest, file: previous } : undefined
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new TypeError(`The library file being replaced doesn't read, so fix or delete it first: ${reason}`, {
      cause: error
    })
  }
}

/**
 * What changed between two versions of a library's components, by fingerprint: new, removed, and changed ones with the
 * props added, removed or retyped. A file written before fingerprints counts every component as changed.
 */
export function compareComponents(before: ComponentList, after: ComponentList): ComponentChanges {
  const changes: ComponentChanges = { added: [], changed: [], removed: [], unchanged: 0 }

  for (const [name, now] of Object.entries(after)) {
    const then = before[name]

    if (!then) {
      changes.added.push(name)
    } else if (then.fingerprint && then.fingerprint === now.fingerprint) {
      changes.unchanged++
    } else {
      const old = propTypes(then.props)
      const fresh = propTypes(now.props)

      const change: ComponentChange = {
        name,
        added: [...fresh.keys()].filter((prop) => !old.has(prop)),
        removed: [...old.keys()].filter((prop) => !fresh.has(prop)),
        retyped: [...fresh.keys()].filter((prop) => old.has(prop) && old.get(prop) !== fresh.get(prop))
      }

      if (then.as !== now.as) {
        change.as = `${then.as} to ${now.as}`
      }

      changes.changed.push(change)
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
  before: ComponentList,
  after: ComponentList,
  changes: ComponentChanges,
  only: "all" | "new" | string[]
): ComponentList {
  if (only === "all") {
    return after
  }

  const picked = new Set(only === "new" ? changes.added : only)
  const list: ComponentList = {}

  for (const name of Object.keys(after)) {
    const chosen = picked.has(name) ? after[name] : before[name]

    if (chosen) {
      list[name] = chosen
    }
  }

  return list
}

function summarizeParts(relations: Map<string, PartRelation>): PartsSummary {
  const summary: PartsSummary = { failedAlone: 0, parents: {}, fixed: 0, failing: [], notVisual: 0 }

  for (const [name, relation] of relations) {
    if (relation.visual === false) {
      summary.notVisual++
    }

    if (relation.parentsFrom) {
      summary.parents[relation.parentsFrom] = (summary.parents[relation.parentsFrom] ?? 0) + 1
    }

    // Contexts and RootProviders draw nothing, so they're neither failures nor fixes.
    if (!relation.alone || relation.visual === false) {
      continue
    }

    summary.failedAlone++

    if (relation.inside) {
      summary.failing.push({ name, error: relation.inside })
    } else {
      summary.fixed++
    }
  }

  return summary
}

/** The files an app library's components are read from: the type checker finds React components in JSX files. */
const appExtensions = [".tsx", ".jsx"]

async function describeApp(options: GenerateOptions): Promise<GeneratedLibrary> {
  const root = resolve(options.root)
  const pkg = (await readPackage(root))?.manifest ?? {}
  const notes: string[] = []
  // The same configs and files project detection reads: references followed, tests and build output left out.
  const tsconfig = readTsconfig(root)
  const { files } = await appFiles(root, { componentExtensions: appExtensions }, tsconfig)

  if (tsconfig.configs.length === 0) {
    notes.push("No tsconfig.json or jsconfig.json, so every .tsx and .jsx file in the project was read.")
  } else if (!tsconfig.configs.some((config) => config.files.length > 0)) {
    const names = tsconfig.configs.map((config) => config.path).join(", ")
    const verb = tsconfig.configs.length === 1 ? "includes" : "include"
    notes.push(`${names} ${verb} no files, so every .tsx and .jsx file in the project was read.`)
  }

  const request: ComponentScan = { entries: files.map((file) => join(root, file).replaceAll("\\", "/")), root }

  if (tsconfig.app) {
    request.compilerOptions = tsconfig.app.options
  }

  request.defaultExports = true
  const scan = findComponents(request)

  // One name in two files gains its folder, as in `ui/FieldError`, so neither is lost.
  const counts = new Map<string, number>()

  for (const component of scan.components) {
    counts.set(component.name, (counts.get(component.name) ?? 0) + 1)
  }

  const list: ComponentList = {}

  for (const component of scan.components) {
    const folder = basename(dirname(component.file))
    const id = (counts.get(component.name) ?? 0) > 1 ? `${folder}/${component.name}` : component.name
    list[id] = { as: component.as, declaration: relativePath(root, component.file), group: component.group }
  }

  const tokens = new Map<string, CollectedToken>()

  // The stylesheets project detection loads on the canvas, so the library's tokens are the ones the app renders with.
  for (const stylesheet of (await findStyles(root)).styles) {
    for (const token of cssTokens(await readStylesheet(join(root, stylesheet)))) {
      tokens.set(token.var, token)
    }
  }

  pairLineHeights(tokens)
  const breakpoints = breakpointsOf([...tokens.values()])
  const name = pkg.name ?? basename(root)

  const manifest: LibraryManifest = {
    version: 4,
    id: options.id ?? name.replace(/^@[^/]+\//, ""),
    name: options.name ?? name
  }

  if (options.description) {
    manifest.description = options.description
  }

  if (breakpoints.length > 0) {
    manifest.breakpoints = breakpoints
  }

  if (tokens.size > 0) {
    manifest.tokens = toDtcg([...tokens.values()])
  }

  if (Object.keys(list).length > 0) {
    manifest.components = { list }
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

  if (existing) {
    return join(root, existing)
  }

  const name = (await readPackage(root))?.manifest.name ?? basename(root)

  return join(root, `${name.replace(/^@[^/]+\//, "")}${libraryManifestExtension}`)
}

/**
 * A generated manifest laid over the file already there: what generating finds replaces what it found before, and
 * what a person wrote (the canvas, decorators, a name or description) stays.
 */
export function mergeManifest(existing: Live, generated: LibraryManifest): LibraryManifest {
  const kept = readPrevious(existing)?.file

  if (!kept) {
    return generated
  }

  const authored = ["$schema", "id", "name", "description", "decorators", "edits", "canvas"]
  const written = Object.fromEntries(authored.flatMap((key) => (kept[key] === undefined ? [] : [[key, kept[key]]])))

  // SAFETY: the file read through the library schema in readPrevious, so each authored field it has holds what the
  // manifest's does, as its author wrote it.
  return { ...generated, ...written } as LibraryManifest
}

function baseReport(
  kind: GenerateReport["kind"],
  scan: ComponentReport,
  tokens: CollectedToken[],
  notes: string[]
): GenerateReport {
  const counts: Partial<Record<TokenCategory, number>> = {}

  for (const token of tokens) {
    counts[token.category] = (counts[token.category] ?? 0) + 1
  }

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

  if (decorator.wrap) {
    return `wraps in ${decorator.wrap.component} from ${decorator.wrap.import}${when}`
  }

  if (decorator.add) {
    return `adds ${decorator.add.component} from ${decorator.add.import}${when}`
  }

  if (decorator.class !== undefined) {
    return `adds a class to the frame${when}`
  }

  if (decorator.attributes) {
    return `sets ${Object.keys(decorator.attributes).join(", ")} on the frame${when}`
  }

  return `styles the frame${when}`
}

/**
 * Whether a package is an icon set: hundreds of components that take no required props and nearly all share one type,
 * as Lucide's `LucideIcon` or Fluent's `FluentIcon`. A component library's components each have their own props.
 */
function looksLikeIcons(scan: ComponentReport): boolean {
  if (scan.components.length < 200) {
    return false
  }

  const types = new Map<string, number>()

  for (const component of scan.components) {
    if (component.requiredProps.length === 0) {
      types.set(component.type, (types.get(component.type) ?? 0) + 1)
    }
  }

  return Math.max(0, ...types.values()) / scan.components.length > 0.9
}

/** `^9.0.0` for 9.5.0, and `^0.4.0` for 0.4.1, since a 0.x minor can break. */
function defaultRange(version: string): string {
  const [major = "0", minor = "0"] = version.split(/[.-]/)

  return major === "0" ? `^0.${minor}.0` : `^${major}.0.0`
}

/** A DTCG token file or resolver: a JSON object, with a resolver's `resolutionOrder` a list. */
const tokenFile = jsonText(plainObject.pipe(z.looseObject({ resolutionOrder: z.array(z.unknown()).optional() })))

type TokenFile = z.output<typeof tokenFile>

/** A DTCG token file or resolver the package ships, such as each Buildkit style's `dist/tokens.json`. */
async function dtcgIn(dir: string): Promise<{ path: string; tokens: TokenFile } | undefined> {
  for (const candidate of ["tokens.json", "dist/tokens.json", "tokens.resolver.json", "dist/tokens.resolver.json"]) {
    const text = await readFile(join(dir, candidate), "utf8").catch(() => undefined)

    if (!text) {
      continue
    }

    // A file that isn't a JSON object isn't tokens. What's in it is checked when the tokens are read (PAR-591).
    const parsed = tokenFile.safeParse(text).data

    if (parsed && (parsed.resolutionOrder !== undefined || /"\$value"\s*:/.test(text))) {
      return { path: candidate, tokens: parsed }
    }
  }

  return undefined
}

/** The prefix most custom properties share, as in `mantine-`, which token paths leave out. */
function commonPrefix(names: string[]): string {
  const counts = new Map<string, number>()

  for (const name of names) {
    const first = /^([a-z]+)-/.exec(name)?.[1]

    if (first) {
      counts.set(first, (counts.get(first) ?? 0) + 1)
    }
  }

  const [best, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ["", 0]

  return count / Math.max(names.length, 1) > 0.5 ? `${best}-` : ""
}

/**
 * A set's icons as the Icons panel lists them: its matching exports, each alias of one icon (Lucide's `Heart` and
 * `HeartIcon`) once, counted, and grouped by label with every name each is exported under, for matching tags. The
 * package is loaded to tell aliases apart, since types can't.
 */
async function exportedIcons(
  load: Load,
  specifier: string,
  icons: LibraryIcons
): Promise<{ count: number; icons: ExportedIcon[]; groups: string[][] }> {
  const module = await load(specifier).catch((): LiveObject => ({}))

  // Each icon once, by the name the guest lists it under, as core's one grouping gives both. Labelled as the panel
  // labels them, without a style or size for sets that write those in.
  const kept = iconAliases(module, icons, (value) =>
    icons.render === "export" ? isComponent(value) : value !== undefined && !isFunction(value)
  )

  const read = icons.variants?.pattern
    ? iconVariants(
        kept.map(({ name }) => name),
        icons.variants
      )
    : undefined

  const byLabel = new Map<string, Set<string>>()

  for (const { name, names } of kept) {
    const label = read?.get(name)?.label ?? name
    const all = byLabel.get(label) ?? new Set()

    for (const each of names) {
      all.add(each)
    }

    byLabel.set(label, all)
  }

  return {
    count: kept.length,
    icons: [...byLabel].map(([label, names]) => ({ label, names: [...names] })),
    groups: kept.map(({ names }) => names)
  }
}

/** Draws an icon with the project's own React, to tell a set's styles apart; nothing draws where React can't load. */
async function iconDrawer(load: Load): Promise<DrawIcon> {
  try {
    const createElement = exported(await load("react"), "createElement")
    const renderToStaticMarkup = exported(await load("react-dom/server"), "renderToStaticMarkup")

    if (!isFunction(createElement) || !isFunction(renderToStaticMarkup)) {
      return () => undefined
    }

    return (component) => {
      try {
        const markup = renderToStaticMarkup(createElement(component))

        return isText(markup) ? markup : undefined
      } catch {
        return undefined
      }
    }
  } catch {
    return () => undefined
  }
}

/** Whether a declaration file exports a name directly, so the props reader can find it there. */
function exportsByName(file: string, name: string): boolean {
  if (name.includes(".")) {
    return false
  }

  const source = ts.sys.readFile(file) ?? ""

  return new RegExp(
    `export\\s+(?:declare\\s+)?(?:const|function|class|let|var)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`
  ).test(source)
}

/**
 * Imports a module from the project, as the project's code would, for reading theme objects and counting icons.
 * Packages a library depends on, such as Fluent's `@fluentui/tokens`, may only be reachable from the library itself.
 */
export function loader(root: string, packageDir: string): Load {
  return async (specifier) => {
    for (const from of [root, packageDir]) {
      const esm = await resolveImport(from, specifier)
      const cjs = resolveRequire(from, specifier)
      const path = esm ?? cjs

      if (!path) {
        continue
      }

      try {
        // A module's namespace is an object of its exports.
        return await import(pathToFileURL(path).href)
      } catch (error) {
        // A `module` entry Node can't run, as Recharts' `es6` build imports its files without extensions, loads
        // through `main` instead, as bundlers fall back to it.
        if (!cjs || cjs === path) {
          throw error
        }

        return await import(pathToFileURL(cjs).href)
      }
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
  const { name, subpath } = splitSpecifier(specifier)
  const installed = await findPackage(from, name)

  return installed && packageEntry(installed, "runtime", subpath)
}
