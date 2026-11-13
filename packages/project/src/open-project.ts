import type { ComponentList } from "@parity-app/code"
import {
  type CanvasDocument,
  type ComponentSource,
  defaultModeSettings,
  type DescribedTokens,
  type LeftOutExport,
  type LibraryInfo,
  libraryCanvas,
  libraryManifestExtension,
  type ModeSettings,
  parseCanvasDocument,
  parseLibraryManifest,
  type ProjectRoute,
  type StorybookInfo,
  type ThemeVariable
} from "@parity-app/core"
import type { ProjectDetection } from "./detection.ts"
import type { DiscoveredProject } from "./index.ts"
import { insideProject } from "./inside-project.ts"

/** An open project, as the windows are told about it. */
export interface ProjectInfo {
  /** Identifies the open project; its absolute root. */
  id: string
  root: string
  name: string
  renderer: { id: string; name: string }
  builder: { id: string; name: string; toolVersion: string }
  /** The styling framework whose theme the tokens include, when one was recognized. */
  styles?: { id: string; name: string; stylesheet: string; error?: string }
  /** The styling framework's full theme, which compiled CSS trims to what the project's code uses. */
  theme: ThemeVariable[]
  guestUrl: string
  /** The app's routes, as its router declares them, each parent before its children; empty without a router (PAR-1076). */
  routes: ProjectRoute[]
  componentCount: number
  /** Where each component comes from: the project's own files, or a library. */
  sources: Record<string, ComponentSource>
  /** The app's capitalised exports the type checker left out, with why, once it has read them. */
  leftOut?: LeftOutExport[]
  /** How the project was discovered. */
  notes: string[]
  /**
   * What detection found and where: the package manager, and the version and config of each tool Parity runs or
   * renders with. Its `notice` names versions the cutoff drops.
   */
  detection: ProjectDetection
  documents: DocumentEntry[]
  /** Component libraries the project depends on. */
  libraries: LibraryInfo[]
  /** The project's Storybook, and which components have stories, when it has one. */
  storybook?: StorybookInfo
  /** Tokens described in DTCG by the project's own `.lib.par` and its libraries'. */
  describedTokens?: DescribedTokens[]
  /** The `.par` file new designs, components and modes are saved in, relative to the root. */
  mainDocument: string
  /** Project-wide modes: the defaults until someone edits them, then saved in the main project file. */
  modes: { settings: ModeSettings; custom: boolean }
}

/** A design file and its designs. */
export interface DocumentEntry {
  path: string
  document: CanvasDocument
}

/** What's told about an open project apart from its component list, which changes as it's open. */
export type OpenedProjectInfo = Omit<ProjectInfo, "sources" | "componentCount" | "leftOut">

/** What opening a project found, which `openedProjectInfo` puts together. */
export interface OpenedProject {
  root: string
  name: string
  renderer: { id: string; name: string }
  builder: { id: string; name: string; toolVersion: string }
  styles: { info?: ProjectInfo["styles"]; theme: ThemeVariable[] }
  guestUrl: string
  routes: ProjectRoute[]
  config: DiscoveredProject
  detection: ProjectDetection
  documents: DocumentEntry[]
  mainDocument: string
}

/** The project as the windows are first told about it, with the modes its main project file sets, if any. */
export function openedProjectInfo(opened: OpenedProject): OpenedProjectInfo {
  const { config } = opened
  const modes = opened.documents.find((entry) => entry.path === opened.mainDocument)?.document.modes

  return {
    id: opened.root,
    root: opened.root,
    name: opened.name,
    renderer: opened.renderer,
    builder: opened.builder,
    styles: opened.styles.info,
    theme: opened.styles.theme,
    guestUrl: opened.guestUrl,
    routes: opened.routes,
    libraries: config.libraries,
    storybook: config.storybook,
    describedTokens: config.describedTokens,
    notes: config.notes,
    detection: opened.detection,
    documents: opened.documents,
    mainDocument: opened.mainDocument,
    modes: { settings: modes ?? defaultModeSettings, custom: !!modes }
  }
}

/** An open project's info with its component list as it is now. */
export function withComponentList(info: OpenedProjectInfo, list: ComponentList): ProjectInfo {
  const { sources, leftOut } = list

  return { ...info, sources, componentCount: Object.keys(sources).length, leftOut }
}

/**
 * The project file new designs, components and modes go into: the `.par` at the project's root if there is one (the
 * first, if there are several), else a library's own `.lib.par`, else any `.par`, else a new one named after the
 * package.
 */
export function pickMainDocument(documents: string[], name: string): string {
  const library = (path: string) => path.endsWith(libraryManifestExtension)

  const found =
    documents.find((path) => !path.includes("/") && !library(path)) ??
    documents.find(library) ??
    documents.find((path) => !library(path))

  if (found) {
    return found
  }

  const slug = name
    .split("/")
    .at(-1)!
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-")
    .replaceAll(/^-|-$/g, "")

  return `${slug || "project"}.par`
}

/**
 * A project file's designs: a `.par` is them, and a library's `.lib.par` keeps them in its `canvas`. A file that isn't
 * JSON, or that doesn't match its format, throws an error naming the file, which stops the project opening (PAR-1011).
 */
export function readDesigns(path: string, text: string): CanvasDocument {
  let value: unknown

  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error(`${path} isn't valid JSON:\n${reason(error)}`, { cause: error })
  }

  const library = path.endsWith(libraryManifestExtension)

  try {
    return library ? libraryCanvas(parseLibraryManifest(value)) : parseCanvasDocument(value)
  } catch (error) {
    const format = library ? "library" : "design"

    throw new Error(`${path} doesn't match the ${format} file format:\n${reason(error)}`, { cause: error })
  }
}

/** A thrown value's message. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript can throw anything
function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Where a project file saved at `path` goes: the absolute file, when it's a `.par` inside the root. */
export function documentTarget(root: string, path: string): string | undefined {
  return path.endsWith(".par") ? insideProject(root, path) : undefined
}

/**
 * What a change the project's watcher reports means, by its path relative to the root with `/` between folders: one of
 * the project's config inputs (`configInput`, checked before `node_modules` is passed over, since a tsconfig can extend
 * one an installed package has), a component file outside hidden folders, or a project file holding designs. Only the
 * project's own `.lib.par`, at its root, holds designs. Anything else is nothing to the project.
 */
export function projectFileChange(
  path: string,
  { componentExtensions, configInput }: { componentExtensions: readonly string[]; configInput: boolean }
): "config" | "component" | "document" | undefined {
  if (configInput) {
    return "config"
  }

  const parts = path.split("/")

  if (parts.includes("node_modules")) {
    return undefined
  }

  if (componentExtensions.some((extension) => path.endsWith(extension))) {
    return parts.some((part) => part.startsWith(".")) ? undefined : "component"
  }

  if (!path.endsWith(".par")) {
    return undefined
  }

  if (path.endsWith(libraryManifestExtension) && path.includes("/")) {
    return undefined
  }

  return "document"
}
