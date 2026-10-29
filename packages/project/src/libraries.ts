import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { dirname, join, posix, relative, resolve } from "node:path"
import {
  applyLibraryEdits,
  type ComponentSample,
  type ComponentSource,
  type DescribedTokens,
  type LibraryInfo,
  type LibraryManifest,
  libraryManifestExtension,
  isMadeValue,
  isSampleElement,
  isSampleRender,
  type PackageManifest,
  parseLibraryEdits,
  parseLibraryManifest,
  readDesignTokens,
  type RendererAdapter,
  type SampleChild
} from "@parity/core"
import { type RegistryEntry, registryEntries, registryEntryFor } from "@parity/registry"
import { parseJsonc } from "./jsonc.ts"

/** A library that can be added to a project from the canvas: one Parity's registry describes. */
export interface LibraryDefinition {
  id: string
  name: string
  description: string
  package: string
  /** The library's Tailwind entry, relative to the package. */
  tailwindEntry?: string
  /** Icon libraries add icons rather than components to compose with. */
  kind?: "components" | "icons"
}

/**
 * Libraries that can be added to a project from the canvas: one per package in Parity's registry, from the file made
 * for its newest version. Buildkit's nova style comes first.
 */
export async function libraryCatalog(): Promise<LibraryDefinition[]> {
  const newest = new Map<string, RegistryEntry>()
  for (const entry of await registryEntries()) {
    const name = entry.manifest.package!.name
    const current = newest.get(name)
    if (!current || (entry.manifest.package?.version ?? "") > (current.manifest.package?.version ?? "")) {
      newest.set(name, entry)
    }
  }
  return [...newest.values()]
    .map((entry) => definitionOf(entry.manifest, entry.manifest.package!.name))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

function rank(library: LibraryDefinition): number {
  if (library.id === "nova") return 0
  return library.kind === "icons" ? 2 : 1
}

/** Buildkit publishes each shadcn style as its own package; any of them is recognized once installed. */
const buildkitStyle = /^@buildkitgg\/shadcn-(baseui|radix)-([a-z]+)$/

/** A Buildkit style the registry has no file for yet: its Tailwind entry is all Parity needs to know. */
function buildkitDefinition(packageName: string): LibraryDefinition | undefined {
  const style = buildkitStyle.exec(packageName)
  if (!style) return undefined
  const [, primitives, name] = style as unknown as [string, string, string]
  return {
    id: name,
    name: `Buildkit ${name}`,
    description: `Every shadcn component on ${primitives === "baseui" ? "Base UI" : "Radix"}, in the ${name} style.`,
    package: packageName,
    tailwindEntry: "tailwind.css"
  }
}

export interface FoundLibraries {
  libraries: LibraryInfo[]
  /** Each library's components, keyed `library/Export` so they never clash with the project's own. */
  components: Record<string, ComponentSource>
  /** The tokens libraries describe in their `.lib.par`. */
  describedTokens: DescribedTokens[]
  /** What the person may want to know: a file older than its package, or hand edits for exports that have gone. */
  notes: string[]
}

/**
 * The libraries a project depends on, with the components each exports. A dependency is a library when it ships a
 * `.lib.par` manifest, or when Parity's registry has one for its package at the installed version. Either is found by
 * what the package really is, so an alias such as `@buildkitgg/shadcn-baseui-kit` resolves to the style it was
 * installed as.
 */
export async function findLibraries(
  root: string,
  pkg: PackageManifest,
  stylesheets: string[],
  renderer: RendererAdapter,
  packageStyles: string[] = [],
  /** The registry's folder; the one Parity ships, unless a test gives another. */
  registry?: string
): Promise<FoundLibraries> {
  const css = (await Promise.all(stylesheets.map((path) => readFile(join(root, path), "utf8").catch(() => "")))).join(
    "\n"
  )
  const result: FoundLibraries = { libraries: [], components: {}, describedTokens: [], notes: [] }
  const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  for (const importName of dependencies) {
    const packageDir = await installedPackage(root, importName)
    if (!packageDir) continue
    const installed = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8")) as PackageManifest & {
      name?: string
      version?: string
      types?: string
      typings?: string
    }
    const packageName = installed.name ?? importName
    const own = await libraryManifestIn(packageDir)
    const fromRegistry = own ? undefined : await registryEntryFor(packageName, installed.version, registry)
    const described = own ?? fromRegistry
    const edited = described && (await withEdits(described.path, described.manifest))
    if (edited?.orphans.length) {
      result.notes.push(`${packageName}: hand edits for exports it no longer has: ${edited.orphans.join(", ")}`)
    }
    const manifest = edited?.manifest
    const definition = manifest ? definitionOf(manifest, packageName) : buildkitDefinition(packageName)
    if (!definition || result.libraries.some((library) => library.id === definition.id)) continue
    const manifestPath = own
      ? posix.normalize(relative(root, own.path).replaceAll("\\", "/"))
      : fromRegistry && `registry:${fromRegistry.file}`
    result.libraries.push({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      package: definition.package,
      importName,
      ...(installed.version ? { version: installed.version } : {}),
      ...(definition.tailwindEntry ? { tailwindEntry: definition.tailwindEntry } : {}),
      ...(definition.kind === "icons" ? { kind: "icons" as const } : {}),
      stylesImported:
        !definition.tailwindEntry ||
        css.includes(`${importName}/`) ||
        packageStyles.some((specifier) => specifier.startsWith(`${importName}/`)),
      ...(manifest?.breakpoints ? { breakpoints: manifest.breakpoints } : {}),
      ...(manifestPath ? { manifest: manifestPath } : {}),
      ...(manifest?.icons ? { icons: manifest.icons } : {}),
      ...(manifest?.decorators?.length ? { decorators: manifest.decorators } : {})
    })
    if (described && manifestPath) {
      const tokens = await describedTokens(root, described.path, described.manifest, manifestPath)
      if (tokens) result.describedTokens.push(tokens)
    }
    // Icons are used by name from the whole package, not listed one by one.
    if (definition.kind === "icons") continue
    const entry = join(packageDir, installed.types ?? installed.typings ?? "dist/index.d.ts")
    const listed = manifest?.components
    if (listed) {
      // A file made for an older version still describes it: components the package no longer exports are left
      // out, and ones it has gained are listed by name until the file is updated.
      const older = fromRegistry?.older ? await newerExports(entry, renderer, listed.list) : undefined
      if (older && fromRegistry) {
        const made = fromRegistry.manifest.package?.version ?? "an older version"
        result.notes.push(
          `${packageName} ${installed.version ?? ""} is newer than Parity's file for it (${made}): ${older.added.length} new components found by name, ${older.gone.size} gone. \`parity lib ${packageName} --registry\` updates it.`
        )
        for (const { name, file } of older.added) {
          result.components[`${definition.id}/${name}`] = {
            path: importName,
            export: name,
            library: definition.id,
            declaration: posix.normalize(relative(root, file).replaceAll("\\", "/"))
          }
        }
      }
      for (const [name, component] of Object.entries(listed.list)) {
        if (older?.gone.has(name) || component.visual === false) continue
        const declaration = component.declaration ? join(packageDir, component.declaration) : entry
        result.components[`${definition.id}/${name}`] = {
          path: importOf(listed.import, packageName, importName),
          export: name,
          library: definition.id,
          declaration: posix.normalize(relative(root, declaration).replaceAll("\\", "/")),
          ...(component.group ? { group: component.group } : {}),
          ...(component.parents ? { parents: component.parents.map((parent) => `${definition.id}/${parent}`) } : {}),
          ...(component.internal ? { internal: true as const } : {}),
          ...(component.optionalParents
            ? { optionalParents: component.optionalParents.map((parent) => `${definition.id}/${parent}`) }
            : {}),
          ...(component.parentParts ? { parentParts: true as const } : {}),
          ...(component.sample
            ? {
                sample: sampleIds(component.sample, definition.id, (specifier) =>
                  importOf(specifier, packageName, importName)
                )
              }
            : {})
        }
      }
      continue
    }
    for (const { name, file } of await declaredComponents(entry, renderer)) {
      result.components[`${definition.id}/${name}`] = {
        path: importName,
        export: name,
        library: definition.id,
        declaration: posix.normalize(relative(root, file).replaceAll("\\", "/"))
      }
    }
  }
  return result
}

/**
 * A sample with its children's components named by id, as `nova/AccordionItem`; HTML elements keep their tag. A value the
 * package makes (`{ $call: { import: "@chakra-ui/react", ... } }`) imports it by the name the project depends on.
 */
function sampleIds(
  sample: ComponentSample,
  library: string,
  imported: (specifier: string) => string = (specifier) => specifier
): ComponentSample {
  const child = (node: SampleChild): SampleChild =>
    typeof node === "string"
      ? node
      : isSampleRender(node)
        ? { ...node, $render: node.$render.map(child) }
        : {
            ...node,
            component: /^[a-z]/.test(node.component) ? node.component : `${library}/${node.component}`,
            ...(node.props ? { props: propIds(node.props) } : {}),
            ...(node.children ? { children: node.children.map(child) } : {})
          }
  // A render function in a prop (`renderInput`) names components too.
  const propIds = (props: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(props).map(([key, item]) => [
        key,
        isSampleRender(item)
          ? { ...item, $render: item.$render.map(child) }
          : isSampleElement(item)
            ? { $element: item.$element.map(child) }
            : isMadeValue(item)
              ? { ...item, $call: { ...item.$call, import: imported(item.$call.import) } }
              : item
      ])
    )
  return {
    ...sample,
    ...(sample.props ? { props: propIds(sample.props) } : {}),
    ...(sample.children ? { children: sample.children.map(child) } : {})
  }
}

/** A library file with its hand edits merged over it, read from its `edits` or the shared file it names. */
async function withEdits(
  path: string,
  manifest: LibraryManifest
): Promise<{ manifest: LibraryManifest; orphans: string[] }> {
  if (!manifest.edits) return { manifest, orphans: [] }
  try {
    const edits =
      typeof manifest.edits === "string"
        ? parseLibraryEdits(parseJsonc(await readFile(join(dirname(path), manifest.edits), "utf8")))
        : manifest.edits
    return applyLibraryEdits(manifest, edits)
  } catch (error) {
    return {
      manifest,
      orphans: [`(its edits can't be read: ${error instanceof Error ? error.message : String(error)})`]
    }
  }
}

/**
 * For a package newer than its file: the exports the file lists that its declarations no longer have, and the
 * components they have that the file doesn't list, found by name as packages without a file are. Namespaced parts
 * (`Dialog.Root`) are checked by their namespace.
 */
async function newerExports(
  entry: string,
  renderer: RendererAdapter,
  list: Record<string, unknown>
): Promise<{ added: { name: string; file: string }[]; gone: Set<string> }> {
  const declared = await declaredComponents(entry, renderer)
  if (declared.length === 0) return { added: [], gone: new Set() }
  const names = new Set(declared.map((component) => component.name))
  const listedRoots = new Set(Object.keys(list).map((name) => name.split(".")[0]!))
  const source = await readFile(entry, "utf8").catch(() => "")
  const gone = new Set(
    Object.keys(list).filter((name) => {
      const root = name.split(".")[0]!
      return !names.has(root) && !new RegExp(`\\b${root}\\b`).test(source)
    })
  )
  return { added: declared.filter((component) => !listedRoots.has(component.name)), gone }
}

/** What a library's components are imported by, written with the name the project depends on it by. */
function importOf(specifier: string | undefined, packageName: string, importName: string): string {
  if (!specifier || specifier === packageName) return importName
  return specifier.startsWith(`${packageName}/`) ? importName + specifier.slice(packageName.length) : specifier
}

/**
 * Where a dependency is installed, found the way Node finds packages: in `node_modules` here or in a folder above. It
 * doesn't resolve `<name>/package.json`, because a package whose `exports` leaves that out can't be resolved that way.
 */
export async function installedPackage(root: string, importName: string): Promise<string | undefined> {
  for (let folder = resolve(root); ; folder = dirname(folder)) {
    const candidate = join(folder, "node_modules", importName)
    if (await isFile(join(candidate, "package.json"))) return realpath(candidate)
    if (dirname(folder) === folder) return undefined
  }
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isFile(),
    () => false
  )
}

/**
 * The tokens a `.lib.par` describes, read from the DTCG files it points at or written inline. A file that can't be read
 * is reported with the library, not thrown, so the project still opens. `shownAs` is how the manifest is named to the
 * person, which for one in Parity's registry isn't a path in the project.
 */
export async function describedTokens(
  root: string,
  manifestPath: string,
  manifest: LibraryManifest,
  shownAs = posix.normalize(relative(root, manifestPath).replaceAll("\\", "/"))
): Promise<DescribedTokens | undefined> {
  if (manifest.tokens === undefined) return undefined
  const entry = { name: manifest.name, manifest: shownAs }
  try {
    const read = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, "utf8"))
    return {
      ...entry,
      tokens: await readDesignTokens(manifest.tokens, read, dirname(manifestPath).replaceAll("\\", "/"))
    }
  } catch (error) {
    return { ...entry, tokens: [], error: error instanceof Error ? error.message : String(error) }
  }
}

/** The `.lib.par` at a package's root, if it ships one that parses. */
async function libraryManifestIn(packageDir: string): Promise<{ path: string; manifest: LibraryManifest } | undefined> {
  const entries = await readdir(packageDir).catch(() => [])
  const name = entries.find((entry) => entry.endsWith(libraryManifestExtension))
  if (!name) return undefined
  const path = join(packageDir, name)
  try {
    return { path, manifest: parseLibraryManifest(JSON.parse(await readFile(path, "utf8"))) }
  } catch (error) {
    console.warn(`Skipping ${path}: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

/**
 * A library as its manifest describes it. A Buildkit style's manifest that leaves out its stylesheet still gets its
 * Tailwind entry, which every Buildkit style has.
 */
function definitionOf(manifest: LibraryManifest, packageName: string): LibraryDefinition {
  const tailwindEntry = manifest.styles ?? buildkitDefinition(packageName)?.tailwindEntry
  const icons = manifest.icons !== undefined && manifest.components === undefined
  return {
    id: manifest.id ?? packageName.replace(/^@[^/]+\//, ""),
    name: manifest.name,
    description: manifest.description ?? "",
    package: packageName,
    ...(tailwindEntry ? { tailwindEntry } : {}),
    ...(icons ? { kind: "icons" as const } : {})
  }
}

/** Components a declaration file exports, following `export * from "./x.js"` into the package's own files. */
async function declaredComponents(
  entry: string,
  renderer: RendererAdapter,
  seen = new Set<string>()
): Promise<{ name: string; file: string }[]> {
  if (seen.has(entry)) return []
  seen.add(entry)
  const source = await readFile(entry, "utf8").catch(() => "")
  const found = renderer.findComponents(source, entry).map(({ name }) => ({ name, file: entry }))
  for (const match of source.matchAll(/export\s+\*\s+from\s+["'](\.[^"']+)["']/g)) {
    const target = join(dirname(entry), match[1]!.replace(/\.js$/, ".d.ts"))
    found.push(...(await declaredComponents(target, renderer, seen)))
  }
  return found
}
