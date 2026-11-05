import { createHash } from "node:crypto"
import { existsSync, type FSWatcher, realpathSync, watch } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path"
import { portFree, viteBuilder } from "@parity-app/builder-vite"
import {
  checkedAppFiles,
  type ComponentList,
  type ComponentListStep,
  configInputs,
  nextComponentList,
  rediscoveredFiles
} from "@parity-app/code"
import {
  type BuilderAdapter,
  type BuilderDetection,
  builderProcessOptions,
  type BuilderProcessSession,
  type BuilderStartOptions,
  type ComponentInfo,
  type ComponentSource,
  type CanvasDocument,
  defaultModeSettings,
  libraryCanvas,
  libraryManifestExtension,
  type PackageManifest,
  parseCanvasDocument,
  parseLibraryManifest,
  type ProjectDetection,
  type RendererAdapter,
  type StylesAdapter,
  type ThemeVariable,
  withLibraryCanvas
} from "@parity-app/core"
import {
  appFiles,
  codeSnapshot,
  detectProject,
  discoverProject,
  changesLockfiles,
  findLockfiles,
  importersOf,
  lockfileFolders,
  readChangedFiles,
  readTsconfig
} from "@parity-app/project"
import { reactRenderer } from "@parity-app/renderer-react"
import { tailwindStyles } from "@parity-app/styles-tailwind"
import { writeTokenChanges } from "@parity-app/tokens"
import type { ProjectEditResult, ProjectInfo, ServiceMethods, WindowMethods } from "../shared/protocol.ts"
import type { ServedCode } from "./bitmap-store.ts"
import { startBuilder } from "./builders.ts"
import { saveDetection, savedDetection } from "./detection-cache.ts"
import { applyProjectEdit } from "./edits.ts"
import { followGuest, type GuestMoved, newGuestPort, restartPort } from "./guest-ports.ts"
import { freePort, stopProject } from "./process-manager.ts"
import { forgetProcess, trackProcess } from "./processes.ts"
import { checkComponents, closeChecker, inferComponents } from "./props.ts"

const renderers: RendererAdapter[] = [reactRenderer]
const builders: BuilderAdapter[] = [viteBuilder]
const stylesAdapters: StylesAdapter[] = [tailwindStyles]

const require = createRequire(import.meta.url)
const allowedOrigins = (process.env.PARITY_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean)

interface OpenProject {
  /** What the windows are told about the project, less its component list, which `projectInfo` adds. */
  info: Omit<ProjectInfo, "sources" | "componentCount" | "leftOut">
  /**
   * The component list, the exports the type checker left out and the person's corrections, as `nextComponentList`
   * made them: the one place they're kept. The builder serves the guest from it, and the windows hear when it changes.
   */
  list: ComponentList
  /** The builder, which runs in a process of its own, and what it was started with, to start it again. */
  session: BuilderProcessSession
  builder: BuilderAdapter
  startOptions: BuilderStartOptions
  /** Stylesheets token edits may write to, relative to the root. */
  stylesheets: string[]
  /** What each project file last held, as read or written here, so the watcher only reports changes from outside. */
  known: Map<string, string>
  watcher?: FSWatcher
  /** The props inferred from each component's source, read again as the list says. */
  components: Promise<Record<string, ComponentInfo>>
  /** What reads the app's files for components when they change, and the UI kit folder whose components load eagerly. */
  renderer: RendererAdapter
  uiKit?: string
  /** Where the windows load the project's guest from: `info.guestUrl`, unless they couldn't load it after it moved. */
  drawnGuestUrl: string
  /**
   * The project's code as each address first served it (`codeSnapshot`), and the components it served, which kept
   * frame bitmaps and component previews are named by. A page never loads a module twice, so a guest drawn from an
   * address shows the code it had then, however it has changed since: a builder started again on the same port keeps
   * the address's first.
   */
  fingerprints: Map<string, ServedCode>
  /**
   * The project's config inputs (its tsconfigs, package.json and lockfiles, see `configInputs`), absolute, and the
   * folders where a lockfile appearing changes which ones it has (see `lockfileFolders`): a change to either reads props
   * and the type check again. Folders outside the root are watched by watchers of their own.
   */
  config?: { files: Set<string>; lockfileFolders: string[] }
  configWatchers?: FSWatcher[]
}

type FileChange = WindowMethods["project.fileChanged"]["params"]
type ComponentsChange = WindowMethods["project.componentsChanged"]["params"]
let notifyFileChange: (change: FileChange) => void = () => undefined
let notifyComponents: (change: ComponentsChange) => void = () => undefined
let notifyGuestMoved: (change: GuestMoved) => Promise<boolean> = () => Promise.resolve(false)

/**
 * Where changes to project files made outside the canvas are reported, props re-inferred after a source edit, and a
 * guest that moved to a new port when its builder was started again.
 */
export function onFileChange(
  listener: (change: FileChange) => void,
  components: (change: ComponentsChange) => void,
  /** Resolves whether the windows now draw the guest from its new address. */
  guestMoved: (change: GuestMoved) => Promise<boolean>
): void {
  notifyFileChange = listener
  notifyComponents = components
  notifyGuestMoved = guestMoved
}

/** The project's components with their props, once inferred. */
export function projectComponents({
  projectId
}: ServiceMethods["project.components"]["params"]): Promise<Record<string, ComponentInfo>> {
  return getProject(projectId).components
}

/** Every project open in a tab. Each runs its own builder, so tabs never share a module graph. */
const projects = new Map<string, OpenProject>()
const opening = new Map<string, Promise<ProjectInfo>>()
/** Closed projects whose builder's process hasn't ended yet, by root. */
const closing = new Map<string, Promise<void>>()
/** The port each open project's builder last served on, which a builder started again takes back when it's free. */
const lastPorts = new Map<string, number>()
/** Every port a builder has served a guest on, which no new address takes: see `newGuestPort`. */
const guestPorts = new Set<number>()
const ports = { free: freePort, isFree: portFree }

/** A project's root from a folder, or from one of its `.par` files: the nearest folder above it with a package.json. */
export function projectRootFor(root: string | undefined): string {
  const path = normalize(resolve(root ?? process.env.PARITY_PROJECT ?? process.cwd()))
  if (!path.endsWith(".par")) return path
  for (let folder = dirname(path); ; folder = dirname(folder)) {
    if (existsSync(join(folder, "package.json"))) return folder
    if (dirname(folder) === folder) return dirname(path)
  }
}

export function openProject(root: string): Promise<ProjectInfo> {
  const existing = projects.get(root)
  if (existing) return Promise.resolve(projectInfo(existing))
  let pending = opening.get(root)
  if (!pending) {
    pending = start(root).finally(() => opening.delete(root))
    opening.set(root, pending)
  }
  return pending
}

/** The roots of the projects open now. */
export function openRoots(): string[] {
  return [...projects.keys()]
}

export async function closeProject(projectId: string): Promise<undefined> {
  const project = projects.get(projectId)
  projects.delete(projectId)
  closeChecker(projectId, projects.size === 0 && opening.size === 0)
  stopProject(projectId)
  project?.watcher?.close()
  for (const watcher of project?.configWatchers ?? []) watcher.close()
  if (project) {
    // A reopen waits for the builder's process to end, so a project never has two builders at once.
    const closed = project.session.close()
    closing.set(projectId, closed)
    await closed
    if (closing.get(projectId) === closed) closing.delete(projectId)
  }
  return undefined
}

function builderProcessId(root: string): string {
  return `builder:${root}`
}

export function getProject(projectId: string): OpenProject {
  const project = projects.get(projectId)
  if (!project) throw new Error(`No open project at ${projectId}`)
  return project
}

async function start(root: string): Promise<ProjectInfo> {
  const pkg = (await readJson(join(root, "package.json"))) as PackageManifest
  const renderer = renderers.find((adapter) => adapter.detect(pkg))
  if (!renderer) throw new Error(`No renderer supports ${pkg.name ?? root}`)
  const found = await findBuilder(root)
  const detection = await detectProject(
    root,
    pkg,
    found.builder && { id: found.builder.id, detection: found.detection }
  )
  // An untested version may be why something below fails, so any error ends with the note naming it.
  const explain = (problem: string) => (detection.notice ? `${problem}\n\n${detection.notice}` : problem)
  if (!found.builder) throw new Error(explain(`No builder supports ${root}.\n${found.misses.join("\n")}`))
  const { builder } = found
  const config = await discoverProject(root, renderer, pkg)
  // One broken project file shouldn't hide the others; its error is shown instead.
  const known = new Map<string, string>()
  const documents = await Promise.all(
    config.documents.map(async (path) => {
      try {
        const text = await readFile(join(root, path), "utf8")
        known.set(path, text)
        return { path, document: readDesigns(path, text) }
      } catch (error) {
        return { path, error: message(error) }
      }
    })
  )
  const mainDocument = pickMainDocument(config.documents, pkg.name ?? basename(root))
  const main = documents.find((entry) => entry.path === mainDocument)?.document
  // The person's corrections come before what was saved, so changing them is a change the fingerprint sees.
  const discovered = nextComponentList(
    { sources: {}, leftOut: [], ...(config.namespace ? { namespace: config.namespace } : {}) },
    { kind: "discovered", sources: config.components, ...(main?.detection ? { corrections: main.detection } : {}) }
  )
  // What the type checker and props found last time, when nothing they read has changed since.
  const { fingerprint, saved } = await savedDetection(root, config.componentFiles, discovered.list.sources)
  const opened = saved
    ? nextComponentList(discovered.list, { kind: "restored", sources: saved.sources, leftOut: saved.leftOut ?? [] })
    : discovered
  if (saved) {
    config.notes.push("components and props as the type checker found them last time, since then nothing has changed")
  }

  const startOptions: BuilderStartOptions = {
    root,
    config: { ...config, components: opened.list.sources },
    renderer,
    rendererGuestPath:
      !process.env.PARITY_DEV_RUNNER && existsSync(join(import.meta.dirname, "guest.mjs"))
        ? join(import.meta.dirname, "guest.mjs")
        : require.resolve(renderer.guestModule),
    allowedOrigins
  }
  // The same project's last builder may still be closing.
  await closing.get(root)
  const serving = serveBuilder(root, pkg.name ?? basename(root), builder, startOptions)
  const [session, styles] = await Promise.all([
    serving.catch((error: unknown) => {
      throw new Error(explain(message(error)), { cause: error })
    }),
    loadStyles(root, config.styles, detection)
  ]).catch((error: unknown) => {
    void serving.then(
      (started) => started.close(),
      () => undefined
    )
    forgetProcess(builderProcessId(root))
    throw error
  })
  const info: OpenProject["info"] = {
    id: root,
    root,
    name: pkg.name ?? basename(root),
    renderer: { id: renderer.id, name: renderer.name },
    builder: { id: builder.id, name: builder.name, toolVersion: session.toolVersion },
    styles: styles.info,
    theme: styles.theme,
    guestUrl: session.guestUrl,
    libraries: config.libraries,
    ...(config.storybook ? { storybook: config.storybook } : {}),
    ...(config.describedTokens ? { describedTokens: config.describedTokens } : {}),
    notes: config.notes,
    detection,
    documents,
    mainDocument,
    modes: { settings: main?.modes ?? defaultModeSettings, custom: !!main?.modes }
  }
  const project: OpenProject = {
    info,
    list: opened.list,
    session,
    builder,
    startOptions,
    drawnGuestUrl: session.guestUrl,
    fingerprints: new Map([[session.guestUrl, servedCode(root, startOptions)]]),
    stylesheets: config.styles,
    known,
    // A saved detection brings its props; discovery's list has every one read.
    components: Promise.resolve(saved?.props ?? {}),
    renderer,
    ...(config.uiKit ? { uiKit: config.uiKit } : {})
  }
  readProps(project, opened, config.componentFiles)
  project.watcher = watchProjectFiles(project)
  if (!saved) {
    void checkTypes(project, config.componentFiles).then(async (ran) => {
      if (!ran || projects.get(root) !== project) return
      const { sources, leftOut } = project.list
      const found = { sources, props: await project.components, leftOut }
      await saveDetection(root, config.componentFiles, discovered.list.sources, fingerprint, found)
    })
  }
  projects.set(root, project)
  console.log(`[service] ${info.name}: ${renderer.name} via ${builder.name} ${session.toolVersion} at ${info.guestUrl}`)
  for (const found of [detection.packageManager, ...detection.tools]) console.log(`[service]   ${found.summary}`)
  for (const note of config.notes) console.log(`[service]   ${note}`)
  if (styles.info) console.log(`[service]   ${styles.theme.length} theme variables from ${styles.info.name}`)
  return projectInfo(project)
}

/** What the windows are told about an open project: its info, with the component list as it is now. */
function projectInfo(project: OpenProject): ProjectInfo {
  const { sources, leftOut } = project.list
  return { ...project.info, sources, componentCount: Object.keys(sources).length, leftOut }
}

/**
 * Starts a project's builder in a process of its own and lists it. One that stops by itself shows as crashed, with why,
 * and can be started again from the list, on the port it had if that's free.
 */
async function serveBuilder(
  root: string,
  name: string,
  builder: BuilderAdapter,
  options: BuilderStartOptions,
  again = false
): Promise<BuilderProcessSession> {
  const id = builderProcessId(root)
  // A reopened project gets a new port, so the windows load its code afresh. On its last address they'd draw with the
  // project's React from before, which kept every closed canvas's frames in memory: about 130 MB each time.
  const port = again ? await restartPort(lastPorts.get(root), guestPorts, ports) : await newGuestPort(guestPorts, ports)
  const tracking = trackProcess(
    { id, kind: "builder", shape: "server", name: builder.name, projectId: root, project: name, status: "starting" },
    { restart: () => restartBuilder(root) }
  )
  const started = startBuilder(builderProcessOptions(builder, { ...options, port }), {
    builder: builder.name,
    project: name,
    onCrash: (error) => {
      console.warn(`[service] ${name}: ${error}`)
      tracking.set("failed", { error })
    }
  })
  if (started.pid) tracking.set("starting", { pid: started.pid })
  try {
    const session = await started.session
    const url = new URL(session.guestUrl)
    lastPorts.set(root, Number(url.port))
    guestPorts.add(Number(url.port))
    tracking.set("running", { url: url.origin })
    return session
  } catch (error) {
    // A project that doesn't open shows why itself; a builder started again shows it in the list.
    if (again) tracking.set("failed", { error: message(error) })
    else forgetProcess(id)
    throw error
  }
}

/** Starts a project's builder again, as after it crashed, with the components the project has now. */
async function restartBuilder(root: string): Promise<void> {
  const project = getProject(root)
  await project.session.close()
  const options = {
    ...project.startOptions,
    config: { ...project.startOptions.config, components: project.list.sources }
  }
  const session = await serveBuilder(root, project.info.name, project.builder, options, true)
  if (projects.get(root) !== project) {
    await session.close()
    return
  }
  project.session = session
  project.info.guestUrl = session.guestUrl
  if (!project.fingerprints.has(session.guestUrl)) {
    project.fingerprints.set(session.guestUrl, servedCode(root, options))
  }
  // It has its old port back unless something took it; then the open windows load the guest from the new one. That's
  // checked against where they draw it, so a move they couldn't load is tried again when it's started again.
  const drawn = await followGuest(root, project.drawnGuestUrl, session.guestUrl, notifyGuestMoved)
  // Unless it was started again meanwhile, and what the windows were told is already out of date.
  if (project.info.guestUrl === session.guestUrl) project.drawnGuestUrl = drawn
}

/**
 * The project's code as its guest will draw it, for kept bitmaps: its files, and the guest module Parity draws it with, so
 * a new version of Parity doesn't show bitmaps the last one drew, and the components the builder serves it with now,
 * which change in place later. `bitmapFormat` goes up when what's kept changes.
 */
function servedCode(root: string, options: BuilderStartOptions): ServedCode {
  const guest = readFile(options.rendererGuestPath).catch(() => Buffer.alloc(0))
  const code = guest.then((contents) =>
    codeSnapshot(root, `${bitmapFormat}:${createHash("sha256").update(contents).digest("hex")}`)
  )
  return {
    code,
    fingerprint: code.then(({ fingerprint }) => fingerprint),
    sources: { ...options.config.components }
  }
}

/** Kept bitmaps carry their frame's height, and are named by the components their frames draw (PAR-179). */
const bitmapFormat = 2

/** The project's code as the address a job draws from first served it, while the project is open. */
export function codeServedAt(projectId: string, guestUrl: string): ServedCode | undefined {
  return projects.get(projectId)?.fingerprints.get(guestUrl)
}

/**
 * What a component preview's key needs of an open project (PAR-207): its root, where its components come from, and the
 * stylesheets its compiled CSS is made from.
 */
export function previewProject(
  projectId: string
): { root: string; sources: Record<string, ComponentSource>; stylesheets: string[] } | undefined {
  const project = projects.get(projectId)
  if (!project) return undefined
  const stylesheets = project.info.styles
    ? [project.info.styles.stylesheet, ...project.stylesheets]
    : project.stylesheets
  return { root: project.info.root, sources: project.list.sources, stylesheets: [...new Set(stylesheets)] }
}

async function loadStyles(
  root: string,
  stylesheets: string[],
  detection: ProjectDetection
): Promise<{ info?: ProjectInfo["styles"]; theme: ThemeVariable[] }> {
  for (const stylesheet of stylesheets) {
    const source = await readFile(join(root, stylesheet), "utf8").catch(() => "")
    const adapter = stylesAdapters.find((candidate) => candidate.detect(source))
    if (!adapter) continue
    const info = { id: adapter.id, name: adapter.name, stylesheet }
    try {
      return { info, theme: await adapter.loadTheme(root, stylesheet) }
    } catch (error) {
      // An untested version is tried like any other; if it fails, the error says it's untested.
      const tool = detection.tools.find((candidate) => candidate.id === adapter.id)
      const untested = tool?.status === "dropped" ? ` (${tool.summary})` : ""
      return { info: { ...info, error: `${message(error)}${untested}` }, theme: [] }
    }
  }
  return { theme: [] }
}

/**
 * The project file new designs, components and modes go into: the `.par` at the project's root if there is one (the
 * first, if there are several), else a library's own `.lib.par`, else any `.par`, else a new one named after the
 * package.
 */
function pickMainDocument(documents: string[], name: string): string {
  const library = (path: string) => path.endsWith(libraryManifestExtension)
  const found =
    documents.find((path) => !path.includes("/") && !library(path)) ??
    documents.find(library) ??
    documents.find((path) => !library(path))
  if (found) return found
  const slug = name
    .split("/")
    .at(-1)!
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-")
    .replaceAll(/^-|-$/g, "")
  return `${slug || "project"}.par`
}

/** A project file's designs: a `.par` is them, and a library's `.lib.par` keeps them in its `canvas`. */
function readDesigns(path: string, text: string): CanvasDocument {
  const value: unknown = JSON.parse(text)
  return path.endsWith(libraryManifestExtension)
    ? libraryCanvas(parseLibraryManifest(value))
    : parseCanvasDocument(value)
}

/**
 * Writes a project file. Existing ones can be rewritten, and new ones created under the project as long as they end in
 * `.par`.
 */
export async function saveDocument({
  projectId,
  path,
  document
}: ServiceMethods["document.save"]["params"]): Promise<undefined> {
  const project = getProject(projectId)
  const entry = project.info.documents.find((candidate) => candidate.path === path)
  if (entry && !entry.document) throw new Error(`${path} couldn't be read, so it isn't overwritten`)
  const target = resolve(project.info.root, path)
  if (!target.startsWith(project.info.root) || !path.endsWith(".par")) {
    throw new Error(`${path} is not a .par file inside the project`)
  }
  const parsed = parseCanvasDocument(document)
  // A `.lib.par` keeps its designs in `canvas`, beside what its author wrote about the library.
  const value = path.endsWith(libraryManifestExtension)
    ? withLibraryCanvas(JSON.parse(await readFile(target, "utf8")), parsed)
    : parsed
  const text = `${JSON.stringify(value, null, 2)}\n`
  project.known.set(path, text)
  await writeFile(target, text)
  if (entry) entry.document = parsed
  else project.info.documents.push({ path, document: parsed })
  return undefined
}

/** Writes a copy of the designs wherever the person chose in the save dialog. The project's own files don't change. */
export async function saveDocumentCopy({
  path,
  document
}: ServiceMethods["document.saveCopy"]["params"]): Promise<undefined> {
  if (!isAbsolute(path) || !path.endsWith(".par")) throw new Error(`${path} is not a .par file`)
  await writeFile(
    path,
    `${JSON.stringify(parseCanvasDocument(document), null, 2)}
`
  )
  return undefined
}

/**
 * Writes token values into the project's stylesheet: semantic tokens into `:root` or their theme class, theme scale
 * tokens into an `@theme` block, editing declarations in place where they already exist. A change without a value
 * takes the declaration out, and a block it leaves empty.
 */
export async function saveTokens({
  projectId,
  changes
}: ServiceMethods["tokens.save"]["params"]): Promise<ProjectEditResult> {
  const project = getProject(projectId)
  const stylesheet = project.info.styles?.stylesheet ?? project.stylesheets[0]
  if (!stylesheet) throw new Error("The project has no stylesheet to write tokens to")
  const themeNames = new Set(project.info.theme.map((variable) => variable.name))
  const source = await readFile(join(project.info.root, stylesheet), "utf8")
  const content = writeTokenChanges(source, changes, themeNames)
  const edit = await applyProjectEdit(project, {
    label: changes.length === 1 ? "Edit a token" : `Edit ${changes.length} tokens`,
    files: [{ kind: "replace", path: stylesheet, expected: source, content }]
  })
  // Keep the theme in step, so a reopened tab sees the new values before the builder recompiles.
  for (const change of changes) {
    const variable = project.info.theme.find((candidate) => candidate.name === change.name)
    if (variable && change.theme === "default" && change.value !== undefined) variable.value = change.value
  }
  return edit
}

/**
 * Watches the project's `.par` files, so edits made outside the canvas (by an agent, git, or a text editor) show up in
 * it. Writes from the canvas itself are recognized by their content and ignored. Its component files are read again
 * when they're added, changed, renamed or deleted, a moment after the last change, and props and the type check when
 * one of its config inputs changes: a tsconfig, package.json or a lockfile, the signal that dependencies changed.
 */
function watchProjectFiles(project: OpenProject): FSWatcher | undefined {
  const { root } = project.info
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const changed = new Set<string>()
  let rescanning: Promise<void> = Promise.resolve()
  const rescan = () => {
    const paths = [...changed]
    changed.clear()
    rescanning = rescanning
      .then(() => rescanComponents(project, paths))
      .catch((error: unknown) => {
        console.warn(`[service] couldn't read the changed components: ${message(error)}`)
      })
  }
  const configChanged = () => {
    clearTimeout(timers.get("config"))
    timers.set(
      "config",
      setTimeout(() => {
        rescanning = rescanning
          .then(() => rereadConfig(project, configChanged))
          .catch((error: unknown) => {
            console.warn(`[service] couldn't read props again after the config changed: ${message(error)}`)
          })
      }, 400)
    )
  }
  void followConfig(project, configChanged).catch((error: unknown) => {
    console.warn(`[service] can't follow ${root}'s config for changes: ${message(error)}`)
  })
  const reload = async (path: string) => {
    let text: string
    try {
      text = await readFile(join(root, path), "utf8")
    } catch {
      return
    }
    if (project.known.get(path) === text) return
    project.known.set(path, text)
    try {
      const document = readDesigns(path, text)
      const entry = project.info.documents.find((candidate) => candidate.path === path)
      if (entry) Object.assign(entry, { document, error: undefined })
      else project.info.documents.push({ path, document })
      console.log(`[service] ${path} changed on disk`)
      notifyFileChange({ projectId: project.info.id, path, document })
    } catch (error) {
      // Often a file caught mid-write; the next change event brings the rest.
      console.warn(`[service] ${path} changed on disk but can't be read: ${message(error)}`)
    }
  }
  try {
    return watch(root, { recursive: true }, (_event, name) => {
      const path = name?.toString().replaceAll("\\", "/")
      if (!path) return
      // Before node_modules is passed over, since a tsconfig can extend one an installed package has.
      if (isConfigInput(project, resolve(root, path))) {
        configChanged()
        return
      }
      if (path.split("/").includes("node_modules")) return
      if (project.renderer.componentExtensions.some((extension) => path.endsWith(extension))) {
        if (path.split("/").some((part) => part.startsWith("."))) return
        changed.add(path)
        clearTimeout(timers.get("components"))
        timers.set("components", setTimeout(rescan, 400))
        return
      }
      if (!path.endsWith(".par")) return
      // Only the project's own `.lib.par`, at its root, holds designs.
      if (path.endsWith(libraryManifestExtension) && path.includes("/")) return
      clearTimeout(timers.get(path))
      timers.set(
        path,
        setTimeout(() => void reload(path), 120)
      )
    })
  } catch (error) {
    console.warn(`[service] can't watch ${root} for changes: ${message(error)}`)
    return undefined
  }
}

/**
 * Lists the project's config inputs as they are now, for its watcher to follow, and watches the folders outside the
 * root that hold some, such as a workspace's lockfile or a shared base config, for `changed`.
 */
async function followConfig(
  project: OpenProject,
  changed: () => void,
  tsconfig = readTsconfig(project.info.root)
): Promise<void> {
  const { root } = project.info
  const lockfiles = await findLockfiles(root)
  const inputs = configInputs(tsconfig, lockfiles)
  if (projects.get(root) !== project) return
  // The config reader lists tsconfigs from the root's real path; one inside the root is matched by the root's watcher.
  const realRoot = realpathSync.native(root)
  const files = new Set([
    ...inputs.configs.map((path) => resolve(path.startsWith("../") ? realRoot : root, path)),
    ...inputs.lockfiles.map((path) => resolve(root, path))
  ])
  const inRoot = (folder: string) =>
    [root, realRoot].some((base) => folder === resolve(base) || folder.startsWith(join(base, "/")))
  const lockFolders = lockfileFolders(root, lockfiles)
  const folders = new Set([...[...files].map((file) => dirname(file)), ...lockFolders])
  for (const watcher of project.configWatchers ?? []) watcher.close()
  project.config = { files, lockfileFolders: lockFolders }
  project.configWatchers = [...folders]
    .filter((folder) => !inRoot(folder))
    .flatMap((folder) => {
      try {
        return [
          watch(folder, (_event, name) => {
            if (name && isConfigInput(project, join(folder, name.toString()))) changed()
          })
        ]
      } catch (error) {
        console.warn(`[service] can't watch ${folder} for config changes: ${message(error)}`)
        return []
      }
    })
}

/** Whether a change to `file` (absolute) is a change to the project's config inputs, or to which lockfiles it has. */
function isConfigInput(project: OpenProject, file: string): boolean {
  if (!project.config) return false
  return project.config.files.has(file) || changesLockfiles(file, project.config.lockfileFolders)
}

/**
 * Sorts the app's sources again, then reads props and the type check again, after a config input changed. Components
 * in files the config now leaves out drop off the list and those in files it newly includes join it, as on opening.
 * The type checker makes the project's program again from the config as it is now (see `utility/props-worker.ts`), so
 * the answers match a project opened afresh.
 */
async function rereadConfig(project: OpenProject, changed: () => void): Promise<void> {
  const { root } = project.info
  const tsconfig = readTsconfig(root)
  await followConfig(project, changed, tsconfig)
  if (projects.get(root) !== project) return
  console.log(`[service] ${project.info.name}'s config or dependencies changed, so its components are found again`)
  const read = await rediscoveredFiles(root, project.renderer, tsconfig, project.uiKit, project.list.sources)
  // The files discovery gives the checker, so never the entry that mounts the app, which the guest must not import.
  const files = await checkedAppFiles(root, project.renderer, tsconfig)
  if (projects.get(root) !== project) return
  const step = nextComponentList(project.list, { kind: "filesRead", read })
  takeList(project, step, files)
  const added = Object.keys(step.guest.add).length
  const removed = step.guest.drop.length
  if (added > 0 || removed > 0) console.log(`[service]   ${added} components added, ${removed} left out`)
  if (files.length > 0) {
    await checkTypes(project, files)
    return
  }
  const components = await project.components
  if (projects.get(root) === project) notifyList(project, components)
}

/**
 * Runs the type checker over the app's files once props are read, so the list gains what the parse can't see, such as
 * `const Select = SelectPrimitive.Root`, and loses the UI kit's undecided exports that aren't components. The builder
 * serves the guest from the list, so a guest loaded later has the new ones; the canvas hears about them and adds them
 * to the guest it has. Whether the checker read them, so what it found can be saved.
 */
async function checkTypes(project: OpenProject, files: string[]): Promise<boolean> {
  const { root, id } = project.info
  if (files.length === 0) return true
  const task = trackProcess(
    {
      id: `typecheck:${root}`,
      kind: "typecheck",
      shape: "task",
      name: "Type check",
      projectId: id,
      project: project.info.name,
      status: "running",
      detail: files.length === 1 ? "Reading 1 component file" : `Reading ${files.length} component files`
    },
    { restart: () => checkTypes(project, files) }
  )
  await project.components
  let checked: Awaited<ReturnType<typeof checkComponents>>
  try {
    checked = await checkComponents(root, files)
  } catch (error) {
    console.warn(`[service] the type checker couldn't read the components: ${message(error)}`)
    task.set("failed", { summary: "Couldn't read the components", error: message(error) })
    return false
  }
  if (projects.get(root) !== project) return false
  const step = nextComponentList(project.list, { kind: "checked", result: checked })
  const added = Object.keys(step.guest.add).length
  task.set("passed", { summary: typeCheckSummary(files.length, added, step.guest.drop.length) })
  console.log(`[service]   the type checker added ${added} components and left out ${step.guest.drop.length}`)
  // Told even when nothing changed, since it's the end of what opening the project reads.
  await settle(project, step)
  return true
}

/** What the type check changed, as "Read 12 files and found 2 more components". */
function typeCheckSummary(files: number, added: number, removed: number): string {
  const read = files === 1 ? "Read 1 file" : `Read ${files} files`
  const changes = [
    added > 0 && (added === 1 ? "found 1 more component" : `found ${added} more components`),
    removed > 0 && (removed === 1 ? "left 1 out" : `left ${removed} out`)
  ].filter(Boolean)
  return changes.length > 0 ? `${read} and ${changes.join(" and ")}` : `${read}, no changes`
}

/**
 * Brings the component list up to date after files changed: the parse reads the changed files again, so added,
 * renamed and deleted components show at once, and props are read again. The type checker then settles the changed
 * files and the files that import them, which is all a change can affect.
 */
async function rescanComponents(project: OpenProject, paths: string[]): Promise<void> {
  const { root } = project.info
  const tsconfig = readTsconfig(root)
  const { files } = await appFiles(root, project.renderer, tsconfig)
  const read = await readChangedFiles(root, project.renderer, files, project.uiKit, paths)
  if (projects.get(root) !== project) return
  const what = paths.length === 1 ? paths[0] : `${paths.length} files`
  await settle(project, nextComponentList(project.list, { kind: "filesRead", read }), `${what} changed`)

  const inApp = new Set(files)
  const reread = [...read.keys()].filter((path) => inApp.has(path) && read.get(path))
  if (reread.length === 0) return
  const toCheck = [...reread, ...(await importersOf(root, files, reread, tsconfig))]
  let checked: Awaited<ReturnType<typeof checkComponents>>
  try {
    checked = await checkComponents(root, toCheck)
  } catch (error) {
    console.warn(`[service] the type checker couldn't read the changed components: ${message(error)}`)
    return
  }
  if (projects.get(root) !== project) return
  const step = nextComponentList(project.list, { kind: "checked", result: checked, files: new Set(toCheck) })
  if (step.changed) await settle(project, step, "the type checker")
}

/**
 * Takes the person's corrections to the component list, as the canvas has the main project file now. An export they
 * put on the list is listed at once, and the files of the exports they changed are read again, so a correction undone
 * leaves detection to decide.
 */
export async function correctComponents({
  projectId,
  corrections
}: ServiceMethods["project.correctComponents"]["params"]): Promise<undefined> {
  const project = getProject(projectId)
  const step = nextComponentList(project.list, { kind: "corrected", corrections })
  // Taken at once, before anything is awaited, so a type check that lands meanwhile keeps them.
  if (step.changed) await settle(project, step, "the person's corrections")
  else project.list = step.list
  if (step.reread.length > 0) await rescanComponents(project, step.reread)
  return undefined
}

/**
 * Takes the next component list into the project, serves it to the builder, so a guest loaded later has it, and reads
 * the props it needs, with `files` read too when every component's are.
 */
function takeList(project: OpenProject, step: ComponentListStep, files?: string[]): void {
  project.list = step.list
  project.session.setComponents(step.list.sources)
  readProps(project, step, files)
}

/** Takes the next component list into the project, and tells the windows once its props are read. */
async function settle(project: OpenProject, step: ComponentListStep, label?: string): Promise<void> {
  takeList(project, step)
  const components = await project.components
  const added = Object.keys(step.guest.add).length
  const removed = step.guest.drop.length
  if (label && (added > 0 || removed > 0)) {
    console.log(`[service]   ${label}: ${added} components added, ${removed} left out`)
  }
  if (projects.get(project.info.root) === project) notifyList(project, components)
}

/**
 * Reads the props a step says the list needs: every component's, with `files` read too so the type checker uses the
 * same program, or the named ones', kept with the rest. Ones no longer listed are let go either way.
 */
function readProps(project: OpenProject, step: ComponentListStep, files?: string[]): void {
  const { root } = project.info
  if (step.props === "all") {
    project.components = inferProps(root, step.list.sources, files)
    return
  }
  if (step.props.length === 0 && step.guest.drop.length === 0) return
  const named = new Set(step.props)
  const needed = Object.fromEntries(Object.entries(step.list.sources).filter(([id]) => named.has(id)))
  const known = project.components
  const more = named.size > 0 ? inferProps(root, needed) : Promise.resolve<Record<string, ComponentInfo>>({})
  project.components = Promise.all([known, more]).then(([props, read]) => {
    const all = { ...props, ...read }
    // What the checker left out, and what the person took off the list, since.
    for (const id of Object.keys(all)) if (!(id in project.list.sources)) delete all[id]
    return all
  })
}

/** Tells the windows the project's component list, with its props, as they are now. */
function notifyList(project: OpenProject, components: Record<string, ComponentInfo>): void {
  const { sources, leftOut } = project.list
  notifyComponents({ projectId: project.info.id, components, sources, leftOut })
}

/** Props inference that never fails the project: without it, panels fall back to free-form props. */
function inferProps(
  root: string,
  sources: Record<string, ComponentSource>,
  files?: string[]
): Promise<Record<string, ComponentInfo>> {
  return inferComponents(root, sources, files).catch((error: unknown) => {
    console.warn(`[service] couldn't infer component props: ${message(error)}`)
    return {}
  })
}

/** The first builder that recognises the project, with what it found; otherwise what each one looked for. */
async function findBuilder(
  root: string
): Promise<{ builder: BuilderAdapter; detection: BuilderDetection } | { builder?: undefined; misses: string[] }> {
  const misses: string[] = []
  for (const builder of builders) {
    const detection = await builder.detect(root)
    if (detection.found) return { builder, detection }
    misses.push(`${builder.name}: ${detection.summary}`)
  }
  return { misses }
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch (error) {
    throw new Error(`Could not read ${path}: ${message(error)}`, { cause: error })
  }
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
