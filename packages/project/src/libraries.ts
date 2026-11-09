import { readdir, readFile } from "node:fs/promises"
import { dirname, join, posix, relative } from "node:path"
import {
  type ComponentSource,
  type ContainerSpec,
  type DescribedTokens,
  type LibraryComponents,
  type LibraryInfo,
  type LibraryManifest,
  libraryDesigns,
  libraryId,
  libraryManifestExtension,
  type PackageManifest,
  parseLibraryManifest,
  type RendererAdapter,
  librarySource,
  remapLibraryImports
} from "@parity-app/core"
import { newestEntries, registryEntryFor, withEdits } from "@parity-app/registry"
import { type ReadTokenFile, readDesignTokens, type SkippedToken } from "@parity-app/tokens"
import { exportedComponents, findPackage, type InstalledPackage, packageEntry } from "./packages.ts"
import { readStylesheet } from "./styles.ts"

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
  return (await newestEntries())
    .map((entry) => definitionOf(entry.manifest, entry.manifest.package!.name))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

function rank(library: LibraryDefinition): number {
  if (library.id === "nova") {
    return 0
  }

  return library.kind === "icons" ? 2 : 1
}

/**
 * A stylesheet with a library's styles imported right after Tailwind, so the library's own token defaults come first
 * and the project's tokens, declared later in the file, still win. `undefined` when it imports them already.
 */
export function withStylesImport(source: string, specifier: string): string | undefined {
  if (source.includes(specifier)) {
    return undefined
  }

  const lines = source.split("\n")
  const tailwind = lines.findIndex((text) => /^@import\s+["']tailwindcss["']/.test(text.trim()))
  lines.splice(tailwind + 1, 0, `@import "${specifier}";`)

  return lines.join("\n")
}

/** Buildkit publishes each shadcn style as its own package; any of them is recognized once installed. */
const buildkitStyle = /^@buildkitgg\/shadcn-(baseui|radix)-([a-z]+)$/

/** A Buildkit style the registry has no file for yet: its Tailwind entry is all Parity needs to know. */
function buildkitDefinition(packageName: string): LibraryDefinition | undefined {
  const style = buildkitStyle.exec(packageName)

  if (!style) {
    return undefined
  }

  const primitives = style[1]!
  const name = style[2]!

  return {
    id: name,
    name: `Shadcn ${name.charAt(0).toUpperCase()}${name.slice(1)}`,
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
  // A library's stylesheet counts as imported from a theme file the entry stylesheet imports, too.
  const css = (await Promise.all(stylesheets.map((path) => readStylesheet(join(root, path))))).join("\n")
  const result: FoundLibraries = { libraries: [], components: {}, describedTokens: [], notes: [] }
  const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })

  for (const importName of dependencies) {
    let installed: InstalledPackage | undefined

    try {
      installed = await findPackage(root, importName)
    } catch (error) {
      result.notes.push(`${importName} was left out: ${errorText(error)}`)
      continue
    }

    if (!installed) {
      continue
    }

    const packageDir = installed.dir
    const { version } = installed.manifest
    const packageName = installed.manifest.name ?? importName
    const own = await libraryManifestIn(packageDir)
    const fromRegistry = own ? undefined : await registryEntryFor(packageName, version, registry)
    const described = own ?? fromRegistry

    const edited =
      described &&
      (await withEdits(described.path, described.manifest).catch((cause: unknown) => ({
        manifest: described.manifest,
        orphans: [`(its edits can't be read: ${errorText(cause)})`]
      })))

    if (edited?.orphans.length) {
      result.notes.push(`${packageName}: hand edits for exports it no longer has: ${edited.orphans.join(", ")}`)
    }

    const manifest = edited?.manifest
      ? remapLibraryImports(edited.manifest, (specifier) => importOf(specifier, packageName, importName))
      : undefined

    const definition = manifest ? definitionOf(manifest, packageName) : buildkitDefinition(packageName)

    if (!definition || result.libraries.some((library) => library.id === definition.id)) {
      continue
    }

    const manifestPath = own
      ? posix.normalize(relative(root, own.path).replaceAll("\\", "/"))
      : fromRegistry && `registry:${fromRegistry.file}`

    result.libraries.push({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      package: definition.package,
      importName,
      version: version || undefined,
      tailwindEntry: definition.tailwindEntry || undefined,
      kind: definition.kind === "icons" ? definition.kind : undefined,
      stylesImported:
        !definition.tailwindEntry ||
        css.includes(`${importName}/`) ||
        packageStyles.some((specifier) => specifier.startsWith(`${importName}/`)),
      breakpoints: manifest?.breakpoints,
      manifest: manifestPath || undefined,
      icons: manifest?.icons,
      decorators: manifest?.decorators?.length ? manifest.decorators : undefined,
      ...designsOf(manifest, definition.id)
    })

    if (described && manifestPath) {
      const tokens = await describedTokens(root, described.path, described.manifest, result.notes, manifestPath)

      if (tokens) {
        result.describedTokens.push(tokens)
      }
    }

    // Icons are used by name from the whole package, not listed one by one.
    if (definition.kind === "icons") {
      continue
    }

    // TypeScript's own last resort is the package's `index.d.ts`.
    const entry = packageEntry(installed, "types") ?? join(packageDir, "index.d.ts")
    const listed = manifest?.components

    if (listed) {
      // A file made for an older version still describes it: components the package no longer exports are left
      // out, and ones it has gained are listed by name until the file is updated.
      const older = fromRegistry?.older ? await newerExports(entry, renderer, listed.list) : undefined

      if (older && fromRegistry) {
        const made = fromRegistry.manifest.package?.version ?? "an older version"
        result.notes.push(
          `${packageName} ${version ?? ""} is newer than Parity's file for it (${made}): ${older.added.length} new components found by name, ${older.gone.size} gone. \`parity lib ${packageName} --registry\` updates it.`
        )

        for (const component of older.added) {
          result.components[`${definition.id}/${component.name}`] = declaredSource(
            root,
            importName,
            definition.id,
            component
          )
        }
      }

      for (const [name, component] of Object.entries(listed.list)) {
        if (older?.gone.has(name)) {
          continue
        }

        const declaration = component.declaration ? join(packageDir, component.declaration) : entry
        result.components[`${definition.id}/${name}`] = {
          ...librarySource(definition.id, name, component, listed.import ?? importName),
          declaration: posix.normalize(relative(root, declaration).replaceAll("\\", "/"))
        }
      }

      continue
    }

    for (const component of await declaredComponents(entry, renderer)) {
      result.components[`${definition.id}/${component.name}`] = declaredSource(
        root,
        importName,
        definition.id,
        component
      )
    }
  }

  return result
}

/** A component a library's declarations export, imported by the name the project depends on the library by. */
function declaredSource(
  root: string,
  importName: string,
  library: string,
  component: DeclaredComponent
): ComponentSource {
  return {
    path: importName,
    export: component.export,
    library,
    declaration: posix.normalize(relative(root, component.file).replaceAll("\\", "/"))
  }
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** The component designs a library's canvas holds, named by the library, when it has any. */
function designsOf(manifest: LibraryManifest | undefined, id: string): { designs?: ContainerSpec[] } {
  const designs = manifest ? libraryDesigns(manifest, id) : []

  return designs.length > 0 ? { designs } : {}
}

/**
 * For a package newer than its file: the exports the file lists that its declarations no longer have, and the
 * components they have that the file doesn't list, found by name as packages without a file are. Namespaced parts
 * (`Dialog.Root`) are checked by their namespace.
 */
async function newerExports(
  entry: string,
  renderer: RendererAdapter,
  list: LibraryComponents["list"]
): Promise<{ added: DeclaredComponent[]; gone: Set<string> }> {
  const declared = await declaredComponents(entry, renderer)

  if (declared.length === 0) {
    return { added: [], gone: new Set() }
  }

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
  if (!specifier || specifier === packageName) {
    return importName
  }

  return specifier.startsWith(`${packageName}/`) ? importName + specifier.slice(packageName.length) : specifier
}

/**
 * The tokens a `.lib.par` describes, read from the DTCG files it points at or written inline. A file that can't be read
 * is reported with the library, not thrown, so the project still opens, and each malformed token left out is added to
 * `notes`. `shownAs` is how the manifest is named to the person, which for one in Parity's registry isn't a path in the
 * project.
 */
export async function describedTokens(
  root: string,
  manifestPath: string,
  manifest: LibraryManifest,
  notes: string[],
  shownAs = posix.normalize(relative(root, manifestPath).replaceAll("\\", "/"))
): Promise<DescribedTokens | undefined> {
  if (manifest.tokens === undefined) {
    return undefined
  }

  const entry = { name: manifest.name, manifest: shownAs }

  try {
    const read: ReadTokenFile = async (path) => JSON.parse(await readFile(path, "utf8"))
    const folder = dirname(manifestPath).replaceAll("\\", "/")
    const skipped = ({ path, problem }: SkippedToken) => notes.push(`${shownAs}: skipped ${path} (${problem})`)

    return { ...entry, tokens: await readDesignTokens(manifest.tokens, read, folder, skipped) }
  } catch (error) {
    return { ...entry, tokens: [], error: error instanceof Error ? error.message : String(error) }
  }
}

/** The `.lib.par` at a package's root, if it ships one that parses. */
async function libraryManifestIn(packageDir: string): Promise<{ path: string; manifest: LibraryManifest } | undefined> {
  const entries = await readdir(packageDir).catch(() => [])
  const name = entries.find((entry) => entry.endsWith(libraryManifestExtension))

  if (!name) {
    return undefined
  }

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
    id: libraryId(manifest, packageName),
    name: manifest.name,
    description: manifest.description ?? "",
    package: packageName,
    tailwindEntry: tailwindEntry || undefined,
    kind: icons ? "icons" : undefined
  }
}

/** A component a library's declarations export: what it's called, the export it's imported by, and its file. */
interface DeclaredComponent {
  name: string
  export: string
  file: string
}

/** The components a library's declarations export, through both kinds of re-export. */
async function declaredComponents(entry: string, renderer: RendererAdapter): Promise<DeclaredComponent[]> {
  const exported = await exportedComponents(entry, renderer)

  return [...exported].map(([name, component]) => ({ name: component.name, export: name, file: component.file }))
}
