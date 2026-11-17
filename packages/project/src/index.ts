import { readdir, readFile } from "node:fs/promises"
import { basename, join, relative } from "node:path"
import { componentIds, findAppComponents, type ProjectTsconfig, readTsconfig, resolvePathAlias } from "@parity-app/code"
import {
  type Adapter,
  type AppStyles,
  type AdapterStatusItem,
  type ComponentSource,
  type ContainerSpec,
  type DescribedTokens,
  type EntitiesAdapter,
  type EntitiesSource,
  type FileWrite,
  type ImportedScreen,
  type LibraryInfo,
  libraryId,
  libraryManifestExtension,
  type PackageManifest,
  type PreviewDescription,
  parseLibraryManifest,
  type ProjectConfig,
  type ProjectEntities,
  type RendererAdapter,
  type StatusFacts
} from "@parity-app/core"
import { parseJsonc } from "@parity-app/registry"
import { componentFor } from "./component-for.ts"
import type { ProjectDetection } from "./detection.ts"
import { describedTokens, findLibraries } from "./libraries.ts"
import { findProjectPreview } from "./preview-file.ts"
import { findWorkspace, workspaceDependencies, workspaceSection } from "./workspace.ts"

export { type ConfigSource, findConfig, type FoundConfig, loadConfig } from "./configs.ts"

export {
  appFiles,
  type CheckedComponent,
  checkedChanges,
  filesChanged,
  importersOf,
  type ParsedComponent,
  readChangedFiles
} from "@parity-app/code"

export {
  type AdapterFound,
  addCommand,
  cutoff,
  detectAdapters,
  detectContext,
  detectPackageManager,
  detectProject
} from "./detect.ts"

export { type Detection, type PackageManagerDetection, type ProjectDetection } from "./detection.ts"

export { chooseAppStyles, type Imported, type Walked } from "./app-styles.ts"

export { appPageModeScript } from "./app-page.ts"

export {
  type LeftOutProvider,
  type OfferedProvider,
  offerPreviewFile,
  type PreviewOffer,
  type ReadProjectFile
} from "./app-providers.ts"

export { findPreviewFile, findProjectPreview } from "./preview-file.ts"

export { type GuestModule, guestModule, type GuestModuleOptions } from "./guest-module.ts"

export { gatherChanges, isStylesheetFile, type StampedChange, stylesheetExtensions } from "./code-changes.ts"

export { commandOption, scriptRunning } from "./scripts.ts"

export {
  diffFile,
  EditConflict,
  type FileChange,
  type FileContent,
  type FileEdit,
  planEdit,
  type ProjectEdit,
  reverseEdit
} from "./edits.ts"

export { type CodeSnapshot, codeSnapshot } from "./code-fingerprint.ts"

export { insideProject } from "./inside-project.ts"

export { contentReader, traceDigest } from "./frame-trace.ts"

export {
  type DocumentEntry,
  documentTarget,
  type OpenedProject,
  type OpenedProjectInfo,
  openedProjectInfo,
  pickMainDocument,
  projectFileChange,
  type ProjectInfo,
  readDesigns,
  withComponentList
} from "./open-project.ts"

export {
  importedFiles,
  moduleClosure,
  type PreviewKeyInput,
  previewKey,
  resolveModule,
  sharedPreviewFiles
} from "./preview-key.ts"

export { type DetectionInputs, detectionInputs } from "./detection-inputs.ts"

export { detectionFingerprint, fingerprintInputs } from "./fingerprint.ts"

export { changesLockfiles, findLockfiles, lockfileFolders } from "./lockfile.ts"

export { type LibraryDefinition, libraryCatalog, withStylesImport } from "./libraries.ts"

export {
  type EntryUse,
  type ExportedComponent,
  exportedComponents,
  findPackage,
  type InstalledPackage,
  type PackageFolder,
  packageEntry,
  packageStylesheet,
  readPackage,
  splitSpecifier
} from "./packages.ts"

export { importFromPnp, type PnpProject, pnpNodeOptions, pnpProject } from "./pnp.ts"

export { readStylesheet } from "./styles.ts"

export { type ProjectTsconfig, readTsconfig, resolvePathAlias, type TsconfigFile } from "@parity-app/code"

export { findWorkspace, type Workspace } from "./workspace.ts"

export interface DiscoveredProject extends ProjectConfig {
  /** How each part was found, for the status bar and debugging. */
  notes: string[]
  /** The app's files read for components, relative to the root, for the type checker to read again. */
  componentFiles: string[]
}

/** What the caller already knows of the project when it discovers it. */
export interface DiscoverOptions {
  /** Its `.par` files, relative to the root, as `findProjectDocuments` lists them, when they've been found already. */
  documents?: readonly string[]
  /**
   * The global stylesheets the app loads, as its builder reports them (`BuilderAdapter.styles`): the only source of
   * them. Unset, or settling to nothing, when the builder can't say, which leaves the canvas without global styles.
   */
  styles?: AppStyles | Promise<AppStyles | undefined>
  /**
   * The previews extensions name for their tools, such as Storybook's (PAR-98): frames draw in the first that's there
   * when the project has no `.parity/preview.*`.
   */
  previews?: readonly PreviewDescription[]
}

/**
 * Works out what the canvas needs from the project as it is: no config file. Styles are the ones the builder says the
 * app loads (`options.styles`), components from what the renderer recognizes in
 * every file the app's tsconfig includes, and designs from the project's `.par` files (usually one, at its root). A library's own
 * `.lib.par`, at its root, holds designs too, and the tokens it describes.
 */
export async function discoverProject(
  root: string,
  renderer: RendererAdapter,
  pkg: PackageManifest = {},
  options: DiscoverOptions = {}
): Promise<DiscoveredProject> {
  const notes: string[] = []
  const tsconfig = readTsconfig(root)

  // The builder answers while the app's files are read, which is the slow part.
  const [loaded, app, preview] = await Promise.all([
    options.styles,
    findAppComponents(root, renderer, tsconfig, notes),
    findProjectPreview(root, pkg, options.previews)
  ])

  const { styles, packageStyles } = loaded ?? { styles: [], packageStyles: [] }
  notes.unshift(stylesNote(loaded))
  const libraries = await findLibraries(root, pkg, styles, renderer, packageStyles)
  notes.push(...libraries.notes)
  await addWorkspacePackages(root, pkg, renderer, libraries, notes)
  const documents = options.documents ? [...options.documents] : await findProjectDocuments(root)
  const tokens: DescribedTokens[] = [...libraries.describedTokens]
  // A library's own project names its components as the apps that install it do, so its canvas's designs work there.
  let namespace: string | undefined
  const own = documents.find((path) => !path.includes("/") && path.endsWith(libraryManifestExtension))

  if (own) {
    try {
      const manifest = parseLibraryManifest(parseJsonc(await readFile(join(root, own), "utf8")))
      const described = await describedTokens(root, join(root, own), manifest, notes)

      if (described) {
        tokens.unshift(described)
      }

      namespace = libraryId(manifest, pkg.name ?? basename(root))
      notes.push(`a library, described by ${own}, whose components are named like ${namespace}/Button`)
    } catch (error) {
      notes.push(`${own} can't be read: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const components = componentIds(app.found, new Set(Object.keys(libraries.components)), namespace)

  for (const library of libraries.libraries) {
    const found = Object.values(libraries.components).filter((source) => source.library === library.id).length
    notes.push(`${count(found, "component")} from ${library.name} (${library.importName})`)
  }

  notes.push(documents.length === 0 ? "no .par project file yet" : `designs in ${documents.join(", ")}`)

  if (preview.preview) {
    notes.push(`frames drawn inside ${preview.preview}'s decorators`)
  }

  const all = { ...components, ...libraries.components }

  return {
    styles,
    packageStyles: packageStyles.length > 0 ? packageStyles : undefined,
    components: all,
    libraries: libraries.libraries,
    documents,
    describedTokens: tokens.length > 0 ? tokens : undefined,
    namespace: namespace || undefined,
    ...preview,
    notes,
    componentFiles: app.files
  }
}

/** How the app's global stylesheets were found, for the notes. */
function stylesNote(loaded: AppStyles | undefined): string {
  if (!loaded) {
    return "the builder didn't say which stylesheets the app loads"
  }

  const named = [...loaded.packageStyles, ...loaded.styles]

  if (named.length === 0) {
    return "the builder found no global stylesheets the app loads"
  }

  return `styles the builder found: ${named.join(", ")}`
}

/**
 * In a monorepo, the workspace packages the app depends on that export components, each a section of its own as a
 * library is. A package a library already describes is left to it.
 */
async function addWorkspacePackages(
  root: string,
  pkg: PackageManifest,
  renderer: RendererAdapter,
  found: { libraries: LibraryInfo[]; components: Record<string, ComponentSource> },
  notes: string[]
): Promise<void> {
  const workspace = await findWorkspace(root)

  if (!workspace) {
    return
  }

  const described = new Set(found.libraries.flatMap((library) => [library.package, library.importName]))
  const packages = workspaceDependencies(workspace, pkg, described)
  const sections: string[] = []

  for (const entry of packages) {
    const section = await workspaceSection(root, entry, renderer, new Set(Object.keys(found.components)))

    if (!section) {
      continue
    }

    found.libraries.push(section.library)
    Object.assign(found.components, section.components)
    sections.push(entry.name)
  }

  const where = `a workspace at ${toPosix(relative(root, workspace.root))}`

  if (packages.length === 0) {
    notes.push(`${where}, though the app depends on none of its packages`)
  } else if (sections.length === 0) {
    notes.push(`${where}, though none of the app's packages from it export components`)
  } else {
    notes.push(`${where}, with components from ${sections.join(", ")}`)
  }
}

/** Maps an import alias such as `@/components/ui` to a folder, using the project's tsconfig paths. */
function resolveAlias(root: string, tsconfig: ProjectTsconfig, alias: string): string | undefined {
  return resolvePathAlias(root, tsconfig, alias) ?? (alias.startsWith("@/") ? `src/${alias.slice(2)}` : undefined)
}

/**
 * The entities each of `adapters`, those whose `detect` found their tool, reads from the tool's files, together:
 * a tool's story files as screens, for one. An adapter that fails is left out, with why in `notes`.
 */
export async function importEntities(
  root: string,
  components: Record<string, ComponentSource>,
  adapters: readonly EntitiesAdapter[],
  notes: string[] = []
): Promise<ProjectEntities> {
  const tsconfig = readTsconfig(root)
  const source = entitiesSource(root, components, (specifier) => resolveAlias(root, tsconfig, specifier))
  const entities: ProjectEntities = {}

  for (const adapter of adapters) {
    try {
      const imported = await adapter.import(source)

      if (imported.screens?.length) {
        entities.screens = [...(entities.screens ?? []), ...imported.screens]
        notes.push(`${imported.screens.length} screens from ${adapter.name}`)

        if (adapter.screens) {
          entities.looks = { ...entities.looks, [adapter.id]: adapter.screens }
        }
      }

      if (imported.sources) {
        entities.sources = { ...entities.sources, ...imported.sources }
      }
    } catch (error) {
      notes.push(`${adapter.name} couldn't be read: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return entities
}

/** An adapter that may add items to the status bar, with what Parity found of its tool. */
export interface StatusSource {
  adapter: Pick<Adapter, "id" | "icon" | "status">
  /** The tool's version when the running tool says it; otherwise detection's. */
  version?: string
}

/**
 * The status bar's items, as each adapter in `sources` tells them, in order, told its tool's version and the package
 * manager. An item from a tool at a version Parity doesn't test says so in its tooltip, and an item that names no icon
 * carries its adapter's logo.
 */
export function adapterStatus(sources: readonly StatusSource[], detection: ProjectDetection): AdapterStatusItem[] {
  return sources.flatMap(({ adapter, version }) => {
    const detected = detection.tools.find((tool) => tool.id === adapter.id)
    const untested = detected?.status === "dropped" || detected?.status === "newer"
    const facts: StatusFacts = { version: version ?? detected?.version, packageManager: detection.packageManager.name }
    const items = adapter.status?.(facts)

    return (items ?? []).map((item) => {
      const told: AdapterStatusItem = {
        ...item,
        adapter: adapter.id,
        detail: untested ? `${item.detail ?? item.hint}. Parity doesn't test this version` : item.detail
      }

      if (!item.icon && adapter.icon) {
        told.logo = adapter.icon
      }

      return told
    })
  })
}

/**
 * Screens the project's tools describe, as edited in Parity, written back through the adapters that imported them:
 * the files each changes, and the entities as they are once written. Only a screen whose layers or states changed is
 * written.
 */
export async function exportEntities(
  root: string,
  components: Record<string, ComponentSource>,
  adapters: readonly EntitiesAdapter[],
  imported: ProjectEntities,
  edited: readonly ContainerSpec[]
): Promise<{ writes: FileWrite[]; entities: ProjectEntities }> {
  const tsconfig = readTsconfig(root)
  const source = entitiesSource(root, components, (specifier) => resolveAlias(root, tsconfig, specifier))
  const byId = new Map(edited.map((container) => [container.id, container]))
  const writes: FileWrite[] = []
  const screens: ImportedScreen[] = []

  for (const screen of imported.screens ?? []) {
    const now = byId.get(screen.screen.id)
    const adapter = adapters.find((each) => each.id === screen.adapter)

    // What a tool's file holds is the screen's layers, and its states' patches, as a story file's stories' args.
    const drawn = (design: ContainerSpec) => JSON.stringify([design.root, design.states])

    if (!now || drawn(now) === drawn(screen.screen) || !adapter?.export) {
      screens.push(screen)
      continue
    }

    writes.push(...(await adapter.export(screen, now, source)))
    screens.push({ ...screen, screen: { ...screen.screen, root: now.root, ...(now.states && { states: now.states }) } })
  }

  return { writes, entities: { ...imported, screens } }
}

/**
 * How an adapter reads the project at `root`, as an entities adapter imports from it: its files,
 * leaving out dependencies and builds, and which of its components an import names.
 */
export function projectSource(
  root: string,
  components: Record<string, Pick<ComponentSource, "path" | "export" | "library">>
): EntitiesSource {
  const tsconfig = readTsconfig(root)

  return entitiesSource(root, components, (specifier) => resolveAlias(root, tsconfig, specifier))
}

/** How an entities adapter reads the project at `root`: its files, leaving out dependencies and builds, and its components. */
function entitiesSource(
  root: string,
  components: Record<string, Pick<ComponentSource, "path" | "export" | "library">>,
  resolve: (specifier: string) => string | undefined
): EntitiesSource {
  return {
    files: async (match) => {
      const found: string[] = []

      const walk = async (folder: string) => {
        for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
          if (entry.isDirectory()) {
            if (!skippedFolders.has(entry.name) && !entry.name.startsWith(".")) {
              await walk(join(folder, entry.name))
            }
          } else {
            const path = toPosix(relative(root, join(folder, entry.name)))

            if (match.test(path)) {
              found.push(path)
            }
          }
        }
      }

      await walk(root)

      return found.sort()
    },
    read: async (path) => readFile(join(root, path), "utf8").catch(() => undefined),
    componentFor: async (file, specifier, name) =>
      componentFor(file, { specifier, name }, components, async (alias) => resolve(alias))
  }
}

const skippedFolders = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", ".next", ".turbo"])

/** The project's `.par` files, relative to the root and sorted, with a `.lib.par` only at the root. */
export async function findProjectDocuments(root: string): Promise<string[]> {
  const found: string[] = []

  const walk = async (folder: string) => {
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skippedFolders.has(entry.name) && !entry.name.startsWith(".")) {
          await walk(join(folder, entry.name))
        }
      } else if (entry.name.endsWith(".par") && (folder === root || !entry.name.endsWith(libraryManifestExtension))) {
        // A `.lib.par` only holds this project's designs at its root; anywhere else it describes another package.
        found.push(toPosix(relative(root, join(folder, entry.name))))
      }
    }
  }

  await walk(root)

  return found.sort()
}

function toPosix(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "")
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`
}
