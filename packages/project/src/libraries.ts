import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { dirname, join, posix, relative } from "node:path"
import { packageExports } from "@parity-app/code"
import {
  type ComponentSource,
  type ContainerSpec,
  type DescribedTokens,
  iconSetPropsId,
  type LibraryComponents,
  type LibraryIcons,
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
import { newestEntries, newestEntryFor, registryEntryFor, withEdits } from "@parity-app/registry"
import { type ReadTokenFile, readDesignTokens, type SkippedToken } from "@parity-app/tokens"
import { exportedComponents, findPackage, type InstalledPackage, packageEntry } from "./packages.ts"
import { readStylesheet } from "./styles.ts"

/** A library that can be added to a project from the canvas: one Parity's registry describes. */
export interface LibraryDefinition {
  id: string
  name: string
  description: string
  package: string
  /** The library's stylesheet, relative to the package. */
  styles?: string
  /** Icon libraries add icons rather than components to compose with. */
  kind?: "components" | "icons"
  /** The version of the package its file was made for. */
  version?: string
}

/**
 * Libraries that can be added to a project from the canvas: one per package in Parity's registry, from the file made
 * for its newest version, components before icons. Buildkit's shadcn kits are left out: their files describe what
 * shadcn-sync generates now, which the shadcn extension sets up instead (PAR-1227).
 */
export async function libraryCatalog(): Promise<LibraryDefinition[]> {
  return (await newestEntries())
    .map((entry) => definitionOf(entry.manifest, entry.manifest.package!.name))
    .filter((library) => !buildkitStyle.test(library.package))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

function rank(library: LibraryDefinition): number {
  return library.kind === "icons" ? 1 : 0
}

/**
 * A stylesheet with a library's styles imported first, so the library's own token defaults come before the project's,
 * which still win: where a stylesheet no styling framework reads imports them. One a framework reads has them where its
 * styles provider says (`StylesProvider.importStyles`).
 */
export function withStylesImport(source: string, specifier: string): string {
  return `@import "${specifier}";\n${source}`
}

/**
 * Each `@import` rule, with the spaces around it and the line break after it: its specifier quoted or in `url()`,
 * quoted or not, as `@import url("a.css") layer(base);` imports `a.css`.
 */
const importRules = /[ \t]*@import\s+(?:url\(\s*["']?([^"')\s]+)["']?\s*\)|["']([^"']+)["'])[^;]*;[ \t]*(\r?\n)?/g

/**
 * A stylesheet without its imports of a library's styles, or `undefined` when it doesn't import them. Only the rule
 * goes: a line it had to itself goes with it, and other rules on its line stay.
 */
export function withoutStylesImport(source: string, specifier: string): string | undefined {
  let kept = ""
  let last = 0

  for (const rule of source.matchAll(importRules)) {
    if ((rule[1] ?? rule[2]) !== specifier) {
      continue
    }

    kept += source.slice(last, rule.index)
    last = rule.index + rule[0].length

    // A rule that starts its line takes the line's break with it; one after others on its line leaves the break.
    if (rule.index > 0 && source[rule.index - 1] !== "\n") {
      kept = kept.trimEnd() + (rule[3] ?? "")
    }
  }

  return last === 0 ? undefined : kept + source.slice(last)
}

/** Buildkit publishes each shadcn style as its own package; any of them is recognized once installed. */
const buildkitStyle = /^@buildkitgg\/shadcn-(baseui|radix)-([a-z]+)$/

/** A Buildkit style the registry has no file for yet: its stylesheet is all Parity needs to know. */
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
    styles: "tailwind.css"
  }
}

/**
 * A library an extension's libraries provider found that the project's dependencies' names alone don't identify, as
 * the components shadcn-sync generates (`LibrariesProvider.detect`), which a file in Parity's registry describes.
 */
export interface DetectedLibrary {
  /** The package whose newest registry file describes it, whether or not that package is installed. */
  registry: string
  /** The dependency its components are imported from. Left out when they're the app's own, so only tokens are read. */
  package?: string
  name: string
  description: string
  /** Its stylesheet, from the package's folder. */
  styles?: string
  /** An icon package its components draw with, read as an icon library even when it isn't a dependency. */
  icons?: string
}

/**
 * The registry's file for a dependency: for one an extension found, the newest file for the package that describes it,
 * whatever version is installed, since what it describes follows its own releases rather than that package's.
 */
function registryFileFor(
  packageName: string,
  version: string | undefined,
  hint: DetectedLibrary | undefined,
  registry: string | undefined
) {
  return hint ? newestEntryFor(hint.registry, registry) : registryEntryFor(packageName, version, registry)
}

/**
 * How a dependency is shown: one an extension found under its registry file's name, in its own package. Its components
 * are named by that package (`shadcn/Button`), not the file, so choosing another style or base keeps designs' instances.
 */
function definitionFor(
  manifest: LibraryManifest | undefined,
  packageName: string,
  hint: DetectedLibrary | undefined
): LibraryDefinition | undefined {
  if (!hint) {
    return manifest ? definitionOf(manifest, packageName) : buildkitDefinition(packageName)
  }

  if (!manifest) {
    return {
      id: libraryId({ id: "" }, packageName),
      name: hint.name,
      description: hint.description,
      package: packageName,
      styles: hint.styles
    }
  }

  return {
    ...definitionOf(manifest, hint.registry),
    id: libraryId({ id: "" }, packageName),
    package: packageName,
    styles: hint.styles
  }
}

export interface FoundLibraries {
  libraries: LibraryInfo[]
  /** Each library's components, keyed `library/Export` so they never clash with the project's own. */
  components: Record<string, ComponentSource>
  /** One icon of each icon set, by `iconSetPropsId`, whose props stand for the set's (see `ProjectConfig.iconSets`). */
  iconSets: Record<string, ComponentSource>
  /** The tokens libraries describe in their `.lib.par`. */
  describedTokens: DescribedTokens[]
  /** What the person may want to know: a file made for another version, or hand edits for exports that have gone. */
  notes: string[]
}

/** Where `findLibraries` looks, beyond the project's own dependencies. */
export interface FindLibrariesOptions {
  /** Packages' stylesheets the app loads, by specifier, so a library's counts as imported. */
  packageStyles?: string[]
  /** The registry's folder; the one Parity ships, unless a test gives another. */
  registry?: string
  /** What the project's extensions found that its dependencies' names don't identify. */
  detected?: DetectedLibrary[]
}

/**
 * The libraries a project depends on, with the components each exports. A dependency is a library when it ships a
 * `.lib.par` manifest, or when Parity's registry has one for its package at the installed version. Either is found by
 * what the package really is, so an alias such as `@buildkitgg/shadcn-baseui-kit` resolves to the style it was
 * installed as. What an extension found (`detected`) is described by its registry file: a dependency of its package
 * with that file's components, checked against what the package declares, one without a package by the file's tokens
 * alone, and an icon package it draws with as an icon library, whether or not the project depends on it.
 */
export async function findLibraries(
  root: string,
  pkg: PackageManifest,
  stylesheets: string[],
  renderer: RendererAdapter,
  { packageStyles = [], registry, detected = [] }: FindLibrariesOptions = {}
): Promise<FoundLibraries> {
  // A library's stylesheet counts as imported from a theme file the entry stylesheet imports, too.
  const css = (await Promise.all(stylesheets.map((path) => readStylesheet(join(root, path))))).join("\n")
  const result: FoundLibraries = { libraries: [], components: {}, iconSets: {}, describedTokens: [], notes: [] }
  const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  /** Where each library found was installed, by the name the project imports it by. */
  const folders = new Map<string, string>()

  const find = async (from: string, importName: string) => {
    try {
      return await findPackage(from, importName)
    } catch (error) {
      result.notes.push(`${importName} was left out: ${errorText(error)}`)

      return undefined
    }
  }

  for (const importName of dependencies) {
    const installed = await find(root, importName)

    if (installed) {
      folders.set(importName, installed.dir)
      await addLibrary(importName, installed)
    }
  }

  for (const hint of detected) {
    if (!hint.package) {
      await addTokens(hint)
    }

    if (hint.icons && !folders.has(hint.icons)) {
      // The components' own copy, where the project doesn't have one, as sync links into its package.
      const beside = hint.package === undefined ? undefined : folders.get(hint.package)
      const installed = (await find(root, hint.icons)) ?? (beside ? await find(beside, hint.icons) : undefined)

      if (installed) {
        folders.set(hint.icons, installed.dir)
        await addLibrary(hint.icons, installed)
      }
    }
  }

  return result

  /** The tokens of what an extension found that are the app's own components, as shadcn's CLI copies them. */
  async function addTokens(hint: DetectedLibrary) {
    const tokens = await registryTokens(hint.registry, result.notes, registry)

    if (tokens && !result.describedTokens.some((described) => described.manifest === tokens.manifest)) {
      result.describedTokens.push(tokens)
    }
  }

  /** A package the project imports by `importName`, when it's a library, with its components and tokens. */
  async function addLibrary(importName: string, installed: InstalledPackage) {
    const packageDir = installed.dir
    const { version } = installed.manifest
    const packageName = installed.manifest.name ?? importName
    const hint = detected.find((candidate) => candidate.package === packageName || candidate.package === importName)

    const own = await libraryManifestIn(packageDir)
    const fromRegistry = own ? undefined : await registryFileFor(packageName, version, hint, registry)
    // A registry file's imports name what it describes: the package an extension found it for, or a retired kit's
    // style, as `shadcn-base-nova` for `@buildkitgg/shadcn-baseui-nova`.
    const describedAs = fromRegistry?.manifest.package?.name ?? hint?.registry ?? packageName

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
      ? remapLibraryImports(edited.manifest, (specifier) => importOf(specifier, describedAs, importName))
      : undefined

    const definition = definitionFor(manifest, packageName, hint)

    if (!definition || result.libraries.some((library) => library.id === definition.id)) {
      return
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
      styles: definition.styles || undefined,
      kind: definition.kind === "icons" ? definition.kind : undefined,
      stylesImported:
        !definition.styles ||
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

    // Icons are used by name from the whole package, not listed one by one: one stands for the set's props.
    if (definition.kind === "icons") {
      const icon = manifest?.icons && (await iconSetSource(root, installed, importName, definition.id, manifest.icons))

      if (icon) {
        result.iconSets[iconSetPropsId(definition.id)] = icon
      }

      return
    }

    // TypeScript's own last resort is the package's `index.d.ts`.
    const entry = packageEntry(installed, "types") ?? join(packageDir, "index.d.ts")
    const listed = manifest?.components

    if (listed) {
      // A file made for another version still describes it: components the package doesn't export are left out,
      // and ones it has that the file doesn't list are found by name until the file is updated.
      // What an extension found is always checked, as shadcn-sync's components are: they're generated from upstream
      // shadcn, which the kit's file may be ahead of or behind.
      // So is a package that keeps its declarations elsewhere than the file says, as a shadcn kit keeps them in
      // `dist/ui/` where the file, made from what shadcn-sync builds, says `ui/`.
      const versionDiffers = fromRegistry?.older || fromRegistry?.newer
      const mismatched = hint || versionDiffers || declarationsMoved(packageDir, listed.list)
      const differs = mismatched ? await otherExports(entry, renderer, listed.list) : undefined

      if (differs && fromRegistry && !hint && versionDiffers) {
        const made = fromRegistry.manifest.package?.version ?? "another version"

        const about = fromRegistry.older
          ? `newer than Parity's file for it (${made}): ${differs.added.length} new components found by name, ${differs.gone.size} gone. \`parity lib ${packageName} --registry\` updates it.`
          : `older than Parity's file for it (${made}): ${differs.added.length} components it doesn't list found by name, ${differs.gone.size} it doesn't have yet. \`parity lib ${packageName} --registry\` makes one for this version.`

        result.notes.push(`${packageName} ${version ?? ""} is ${about}`)
      }

      if (differs) {
        for (const component of differs.added) {
          result.components[`${definition.id}/${component.name}`] = declaredSource(
            root,
            importName,
            definition.id,
            component
          )
        }
      }

      for (const [name, component] of Object.entries(listed.list)) {
        if (differs?.gone.has(name)) {
          continue
        }

        // The package's own declarations, where they were read, over the file's: a shadcn kit keeps them in `dist/ui/`,
        // where shadcn-sync's package, which the file was made from, keeps them in `ui/`.
        const declaration =
          differs?.files.get(name.split(".")[0]!) ??
          (component.declaration ? join(packageDir, component.declaration) : entry)

        result.components[`${definition.id}/${name}`] = {
          ...librarySource(definition.id, name, component, listed.import ?? importName),
          declaration: posix.normalize(relative(root, declaration).replaceAll("\\", "/"))
        }
      }

      return
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
}

/**
 * The icon whose props stand for an icon set's: the component that draws its icons from data, as Hugeicons'
 * `HugeiconsIcon`, or the first icon it prefers, from the module its icons are imported from. None for a set that
 * names no icon, whose icons keep the props they set.
 */
async function iconSetSource(
  root: string,
  installed: InstalledPackage,
  importName: string,
  library: string,
  icons: LibraryIcons
): Promise<ComponentSource | undefined> {
  // The component that draws the set's icons from data, for a set whose icons aren't components of their own.
  const drawn = icons.render === "export" ? undefined : icons.render
  const module = drawn ? drawn.import : (icons.import ?? importName)
  const icon = drawn ? drawn.component : icons.prefer?.[0]

  const found =
    module === importName ? installed : await findPackage(root, packageNameOf(module)).catch(() => undefined)

  const subpath =
    found && module.length > packageNameOf(module).length ? `.${module.slice(packageNameOf(module).length)}` : "."

  const declaration = found && packageEntry(found, "types", subpath)

  return icon && declaration
    ? {
        path: module,
        export: icon,
        library,
        declaration: posix.normalize(relative(root, declaration).replaceAll("\\", "/"))
      }
    : undefined
}

/** The package a module specifier is in: `@heroicons/react` for `@heroicons/react/24/outline`. */
function packageNameOf(specifier: string): string {
  const parts = specifier.split("/")

  return parts.slice(0, specifier.startsWith("@") ? 2 : 1).join("/")
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

/** Whether the installed package lacks the declaration file its file gives the first component that names one. */
function declarationsMoved(packageDir: string, list: LibraryComponents["list"]): boolean {
  const declaration = Object.values(list).find((component) => component.declaration)?.declaration

  return declaration !== undefined && !existsSync(join(packageDir, declaration))
}

/**
 * For a package newer or older than its file: the exports the file lists that its declarations don't have, and the
 * components they have that the file doesn't list, found by name as packages without a file are. Namespaced parts
 * (`Dialog.Root`) are checked by their namespace.
 */
async function otherExports(
  entry: string,
  renderer: RendererAdapter,
  list: LibraryComponents["list"]
): Promise<{ added: DeclaredComponent[]; gone: Set<string>; files: Map<string, string> }> {
  const declared = await declaredComponents(entry, renderer)

  if (declared.length === 0) {
    return { added: [], gone: new Set(), files: new Map() }
  }

  const names = new Set(declared.map((component) => component.name))
  const listedRoots = new Set(Object.keys(list).map((name) => name.split(".")[0]!))
  // A name the renderer doesn't take for a component may still be exported, as Mantine's `factory()` components are.
  const exported = packageExports(entry)

  const gone = new Set(
    Object.keys(list).filter((name) => {
      const root = name.split(".")[0]!

      return !names.has(root) && !exported.has(root)
    })
  )

  return {
    added: declared.filter((component) => !listedRoots.has(component.name)),
    gone,
    // Only where the file exports it by the same name: props are read by the export's name in its file, and an alias
    // (`export { Card as Panel }`) points at a file that exports only `Card`.
    files: new Map(
      declared
        .filter((component) => component.fileExport === component.export)
        .map((component) => [component.export, component.file])
    )
  }
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

/**
 * The tokens the newest file in Parity's registry for a package describes, named `registry:<file>`, so they can be shown
 * before the library is added. Undefined when the registry has no file for the package, or its file describes none.
 * Each malformed token left out is added to `notes`.
 */
export async function registryTokens(
  packageName: string,
  notes: string[] = [],
  /** The registry's folder; the one Parity ships, unless a test gives another. */
  registry?: string
): Promise<DescribedTokens | undefined> {
  const entry = await newestEntryFor(packageName, registry)

  return entry && describedTokens(dirname(entry.path), entry.path, entry.manifest, notes, `registry:${entry.file}`)
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
 * A library as its manifest describes it. A Buildkit style's manifest that leaves out its stylesheet still gets
 * `tailwind.css`, which every Buildkit style has.
 */
function definitionOf(manifest: LibraryManifest, packageName: string): LibraryDefinition {
  const styles = manifest.styles ?? buildkitDefinition(packageName)?.styles
  const icons = manifest.icons !== undefined && manifest.components === undefined

  return {
    id: libraryId(manifest, packageName),
    name: manifest.name,
    description: manifest.description ?? "",
    package: packageName,
    styles: styles || undefined,
    kind: icons ? "icons" : undefined,
    version: manifest.package?.version
  }
}

/** A component a library's declarations export: what it's called, the export it's imported by, and its file. */
interface DeclaredComponent {
  name: string
  export: string
  file: string
  /** The name its file exports it by. */
  fileExport: string
}

/** The components a library's declarations export, through both kinds of re-export. */
async function declaredComponents(entry: string, renderer: RendererAdapter): Promise<DeclaredComponent[]> {
  const exported = await exportedComponents(entry, renderer)

  return [...exported].map(([name, component]) => ({
    name: component.name,
    export: name,
    file: component.file,
    fileExport: component.fileExport
  }))
}
