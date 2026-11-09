import { createHash } from "node:crypto"
import { existsSync, realpathSync, watch as watchFolder } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path"
import {
  checkedAppFiles,
  type ComponentList,
  type ComponentListStep,
  configInputs,
  nextComponentList,
  rediscoveredFiles,
  typeCheckSummary
} from "@parity-app/code"
import {
  type BuilderAdapter,
  type BuilderDetection,
  type BuilderProcessOptions,
  builderProcessOptions,
  type BuilderProcessSession,
  type BuilderStartOptions,
  type CodeChange,
  type ComponentInfo,
  type ComponentSource,
  libraryManifestExtension,
  parseCanvasDocument,
  type ProjectDetection,
  type RendererAdapter,
  type StylesAdapter,
  type ThemeVariable,
  withLibraryCanvas
} from "@parity-app/core"
import {
  appFiles,
  changesLockfiles,
  codeSnapshot,
  detectProject,
  discoverProject,
  documentTarget,
  findLockfiles,
  findPackage,
  importersOf,
  lockfileFolders,
  type OpenedProjectInfo,
  openedProjectInfo,
  pickMainDocument,
  projectFileChange,
  readChangedFiles,
  readDesigns,
  readPackage,
  readTsconfig,
  withComponentList
} from "@parity-app/project"
import { errorCode } from "@parity-app/telemetry"
import { writeTokenChanges } from "@parity-app/tokens"
import type { ProjectEditResult, ProjectInfo, ServiceMethods, WindowMethods } from "../shared/protocol.ts"
import { inSpan, track } from "../shared/tracing.ts"
import type { ServedCode } from "./bitmap-store.ts"
import type { BuilderExit, StartedBuilder } from "./builders.ts"
import type { SavedDetection } from "./detection-cache.ts"
import { applyProjectEdit } from "./edits.ts"
import { environment, type ServiceEnvironment } from "./environment.ts"
import { followGuest, type GuestMoved, newGuestPort, type PortFinder, restartPort } from "./guest-ports.ts"
import { stopProject } from "./process-manager.ts"
import { forgetProcess, trackProcess } from "./processes.ts"
import type { TypeChecker } from "./props.ts"

const require = createRequire(import.meta.url)

/** Something watching files, which stops when it's closed. */
export interface Watching {
  close(): void
}

/** Watches a folder, as `fs.watch` does: `recursive` for everything under it. */
export type WatchFolder = (
  folder: string,
  options: { recursive?: boolean },
  listener: (event: string, name: string | null) => void
) => Watching

/** Where the windows hear about open projects. */
export interface ProjectListeners {
  /** A project file changed outside the canvas. */
  fileChanged: (change: WindowMethods["project.fileChanged"]["params"]) => void
  /** A project's component list or props changed. */
  componentsChanged: (change: WindowMethods["project.componentsChanged"]["params"]) => void
  /** The code of some of a project's components changed on disk, by its builder's account. */
  codeChanged: (change: WindowMethods["project.codeChanged"]["params"]) => void
  /** A builder started again on a new port; resolves whether the windows now draw the guest from there. */
  guestMoved: (change: GuestMoved) => Promise<boolean>
}

/** What the type checker and props found last time, kept outside the project (see detection-cache.ts). */
export interface DetectionCache {
  saved: (
    root: string,
    files: string[],
    discovered: Record<string, ComponentSource>
  ) => Promise<{ fingerprint: string; saved?: SavedDetection }>
  save: (
    root: string,
    files: string[],
    discovered: Record<string, ComponentSource>,
    fingerprint: string,
    found: Omit<SavedDetection, "fingerprint">
  ) => Promise<void>
}

/** What the open projects are made with: the adapters Parity supports, and what reaches outside the service. */
export interface ProjectAdapters {
  renderers: RendererAdapter[]
  builders: BuilderAdapter[]
  styles: StylesAdapter[]
  /** The builder link: starts a project's builder in a process of its own (see builders.ts). */
  startBuilder: (
    options: BuilderProcessOptions,
    about: {
      builder: string
      project: string
      onCrash: (error: string, exit?: BuilderExit) => void
      /** The builder found project files whose code changed (PAR-165). */
      onCodeChange?: (change: CodeChange) => void
    }
  ) => StartedBuilder
  /** Watches the project folder, and folders outside it holding its config. `fs.watch` unless given. */
  watch?: WatchFolder
  checker: TypeChecker
  detections: DetectionCache
  /** The ports guests are served on. */
  ports: PortFinder
  listeners: ProjectListeners
  /** What the service's environment says of opening projects. The service's own (`environment()`) unless given. */
  environment?: Pick<ServiceEnvironment, "PARITY_ALLOWED_ORIGINS" | "PARITY_PROJECT" | "PARITY_DEV_RUNNER">
  /** Told why a project can't be opened, for telemetry's `project.unsupported` (PAR-633). */
  unsupported?: (reason: UnsupportedReason, detail: string) => void
}

/** Why Parity can't open a project: no package.json, no renderer for its framework, or no builder for its bundler. */
export type UnsupportedReason = "no_package" | "no_renderer" | "no_builder"

/** An open project, as the service's other modules use it. */
export interface OpenProject {
  /** What the windows are told about the project, less its component list, which `projectInfo` adds. */
  info: OpenedProjectInfo
  /** Stylesheets token edits may write to, relative to the root. */
  stylesheets: string[]
  /** What each project file last held, as read or written here, so the watcher only reports changes from outside. */
  known: Map<string, string>
}

interface Project extends OpenProject {
  /**
   * The component list, the exports the type checker left out and the person's corrections, as `nextComponentList`
   * made them: the one place they're kept. The builder serves the guest from it, and the windows hear when it changes.
   */
  list: ComponentList
  /** The builder, which runs in a process of its own, and what it was started with, to start it again. */
  session: BuilderProcessSession
  builder: BuilderAdapter
  startOptions: BuilderStartOptions
  watcher?: Watching
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
  configWatchers?: Watching[]
  /** When it opened, by `performance.now()`, for how long it was open. */
  openedAt: number
}

/** What an open learned on the way, for `project.opened` or `project.openFailed` (PAR-637). */
interface Opening {
  step: "detection" | "builder"
  name: string
  framework?: string
  builder?: string
  detectionMs?: number
  builderMs?: number
  cached: boolean
  versions?: ToolVersions
}

/** The tools whose versions both events record, by detection's IDs. */
const recordedVersions = ["react", "vite", "tailwind", "storybook"] as const

type ToolVersions = Partial<Record<(typeof recordedVersions)[number] | "typescript", string>>

/** The versions installed of the tools both events record: detection's, and TypeScript's. */
async function toolVersions(root: string, detection: ProjectDetection): Promise<ToolVersions> {
  const versions: ToolVersions = {}

  for (const id of recordedVersions) {
    const version = detection.tools.find((tool) => tool.id === id)?.version

    if (version) {
      versions[id] = version
    }
  }

  const typescript = await typescriptVersion(root)

  if (typescript) {
    versions.typescript = typescript
  }

  return versions
}

/** The project's installed TypeScript version, when it has one. */
async function typescriptVersion(root: string): Promise<string | undefined> {
  const installed = await findPackage(root, "typescript").catch(() => undefined)

  return installed?.manifest.version
}

/** Milliseconds since `began`, by `performance.now()`, to a tenth. */
function since(began: number): number {
  return Math.round((performance.now() - began) * 10) / 10
}

/** The last 50 lines of what a process printed. */
function lastLines(output: string): string {
  return output.trimEnd().split(/\r?\n/).slice(-50).join("\n")
}

/** The projects open in tabs. Each runs its own builder, so tabs never share a module graph. */
export interface OpenProjects {
  /** A project's root from a folder, or from one of its `.par` files; without either, the one Parity was started with. */
  rootFor: (root: string | undefined) => string
  /** Opens a project, or gives the one open or opening there. `reopen` when it's one open as Parity last quit. */
  open: (root: string, how?: { reopen?: boolean }) => Promise<ProjectInfo>
  close: (projectId: string) => Promise<undefined>
  /** The roots of the projects open now. */
  roots: () => string[]
  get: (projectId: string) => OpenProject
  /** The project's components with their props, once inferred. */
  components: (projectId: string) => Promise<Record<string, ComponentInfo>>
  correctComponents: (params: ServiceMethods["project.correctComponents"]["params"]) => Promise<undefined>
  saveDocument: (params: ServiceMethods["document.save"]["params"]) => Promise<undefined>
  saveTokens: (params: ServiceMethods["tokens.save"]["params"]) => Promise<ProjectEditResult>
  /** The project's code as the address a job draws from first served it, while the project is open. */
  codeServedAt: (projectId: string, guestUrl: string) => ServedCode | undefined
  previewProject: (projectId: string) => PreviewProject | undefined
}

/**
 * What a component preview's key needs of an open project (PAR-207): its root, where its components come from, and the
 * stylesheets its compiled CSS is made from.
 */
export interface PreviewProject {
  root: string
  sources: Record<string, ComponentSource>
  stylesheets: string[]
}

/** Kept bitmaps carry their frame's height, and are named by the components their frames draw (PAR-179). */
const bitmapFormat = 2

export function openProjects(adapters: ProjectAdapters): OpenProjects {
  const { checker, detections, listeners, ports } = adapters
  const watch: WatchFolder = adapters.watch ?? watchFolder
  const env = adapters.environment ?? environment()
  const allowedOrigins = env.PARITY_ALLOWED_ORIGINS ?? []
  const startedWith = env.PARITY_PROJECT
  const devRunner = !!env.PARITY_DEV_RUNNER

  const projects = new Map<string, Project>()
  const opening = new Map<string, Promise<ProjectInfo>>()
  /** Closed projects whose builder's process hasn't ended yet, by root. */
  const closing = new Map<string, Promise<void>>()
  /** The port each open project's builder last served on, which a builder started again takes back when it's free. */
  const lastPorts = new Map<string, number>()
  /** Every port a builder has served a guest on, which no new address takes: see `newGuestPort`. */
  const guestPorts = new Set<number>()

  function getProject(projectId: string): Project {
    const project = projects.get(projectId)

    if (!project) {
      throw new Error(`No open project at ${projectId}`)
    }

    return project
  }

  /** The guest module the builder serves: the app's own bundled copy, unless it runs from source. */
  function guestPath(renderer: RendererAdapter): string {
    const bundled = join(import.meta.dirname, "guest.mjs")

    return !devRunner && existsSync(bundled) ? bundled : require.resolve(renderer.guestModule)
  }

  /** Tells telemetry why the project can't be opened, and returns the error that says so. */
  function unsupported(reason: UnsupportedReason, detail: string): Error {
    adapters.unsupported?.(reason, detail)

    return new Error(detail)
  }

  /**
   * Reads what opening a project needs before its builder starts: its package, renderer and builder, the tools it uses,
   * its files and components, and what the type checker found last time.
   */
  async function detect(root: string, opening: Opening) {
    const pkg = (await readPackage(root))?.manifest

    if (!pkg) {
      throw unsupported("no_package", `There's no package.json in ${root}`)
    }

    const renderer = adapters.renderers.find((adapter) => adapter.detect(pkg))

    if (!renderer) {
      throw unsupported("no_renderer", `No renderer supports ${pkg.name ?? root}`)
    }

    opening.framework = renderer.id

    const found = await findBuilder(adapters.builders, root).catch(async (error: unknown) => {
      // A builder that can't load the project's config, as a broken vite.config, still leaves the versions to record.
      opening.versions = await toolVersions(root, await detectProject(root, pkg))
      throw error
    })

    const detection = await detectProject(
      root,
      pkg,
      found.builder && { id: found.builder.id, detection: found.detection }
    )

    opening.versions = await toolVersions(root, detection)
    // An untested version may be why something below fails, so any error ends with the note naming it.
    const explain = (problem: string) => (detection.notice ? `${problem}\n\n${detection.notice}` : problem)

    if (!found.builder) {
      throw unsupported("no_builder", explain(`No builder supports ${root}.\n${found.misses.join("\n")}`))
    }

    const { builder } = found
    const name = pkg.name ?? basename(root)
    opening.builder = builder.id
    opening.name = name
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

    const mainDocument = pickMainDocument(config.documents, name)
    const main = documents.find((entry) => entry.path === mainDocument)?.document

    // The person's corrections come before what was saved, so changing them is a change the fingerprint sees.
    const discovered = nextComponentList(
      { sources: {}, leftOut: [], ...(config.namespace ? { namespace: config.namespace } : {}) },
      { kind: "discovered", sources: config.components, ...(main?.detection ? { corrections: main.detection } : {}) }
    )

    // What the type checker and props found last time, when nothing they read has changed since.
    const { fingerprint, saved } = await detections.saved(root, config.componentFiles, discovered.list.sources)

    const opened = saved
      ? nextComponentList(discovered.list, { kind: "restored", sources: saved.sources, leftOut: saved.leftOut ?? [] })
      : discovered

    opening.cached = !!saved

    if (saved) {
      config.notes.push("components and props as the type checker found them last time, since then nothing has changed")
    }

    return {
      builder,
      config,
      detection,
      discovered,
      documents,
      explain,
      fingerprint,
      known,
      mainDocument,
      name,
      opened,
      renderer,
      saved
    }
  }

  /**
   * Opens a project and records how it went, as `project.opened` or `project.openFailed`, with how long each step took
   * and what it found (PAR-637).
   */
  async function recordOpen(root: string, reopen: boolean): Promise<ProjectInfo> {
    const began = performance.now()
    const opening: Opening = { step: "detection", name: basename(root), cached: false }

    const common = () => ({
      name: opening.name,
      root,
      reopen,
      durationMs: since(began),
      ...(opening.detectionMs === undefined ? {} : { detectionMs: opening.detectionMs }),
      ...(opening.builderMs === undefined ? {} : { builderMs: opening.builderMs }),
      ...(opening.framework ? { framework: opening.framework } : {}),
      ...(opening.builder ? { builder: opening.builder } : {}),
      ...opening.versions
    })

    try {
      const info = await start(root, opening)
      track("project.opened", {
        ...common(),
        cached: opening.cached,
        components: Object.keys(info.sources).length,
        designs: info.documents.reduce((sum, entry) => sum + (entry.document?.containers.length ?? 0), 0),
        tokens: info.theme.length,
        libraries: info.libraries.length
      })

      return info
    } catch (error) {
      const code = errorCode(error)
      track("project.openFailed", {
        ...common(),
        step: opening.step,
        message: message(error),
        ...(code ? { code } : {})
      })
      throw error
    }
  }

  async function start(root: string, opening: Opening): Promise<ProjectInfo> {
    const began = performance.now()

    const {
      builder,
      config,
      detection,
      discovered,
      documents,
      explain,
      fingerprint,
      known,
      mainDocument,
      name,
      opened,
      renderer,
      saved
    } = await inSpan("project.detected", { root }, () => detect(root, opening))

    opening.detectionMs = since(began)
    opening.step = "builder"

    const startOptions: BuilderStartOptions = {
      root,
      config: { ...config, components: opened.list.sources },
      renderer,
      rendererGuestPath: guestPath(renderer),
      allowedOrigins
    }

    // The same project's last builder may still be closing.
    await closing.get(root)
    const serving = serveBuilder(root, name, builder, startOptions)
    const builderStarted = performance.now()
    serving.then(
      () => (opening.builderMs = since(builderStarted)),
      () => undefined
    )

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

    const info = openedProjectInfo({
      root,
      name,
      renderer: { id: renderer.id, name: renderer.name },
      builder: { id: builder.id, name: builder.name, toolVersion: session.toolVersion },
      styles,
      guestUrl: session.guestUrl,
      config,
      detection,
      documents,
      mainDocument
    })

    const project: Project = {
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
      ...(config.uiKit ? { uiKit: config.uiKit } : {}),
      openedAt: performance.now()
    }

    readProps(project, opened, config.componentFiles)
    project.watcher = watchProjectFiles(project)

    if (!saved) {
      void checkTypes(project, config.componentFiles).then(async (ran) => {
        if (!ran || projects.get(root) !== project) {
          return
        }

        const { sources, leftOut } = project.list
        const found = { sources, props: await project.components, leftOut }
        await detections.save(root, config.componentFiles, discovered.list.sources, fingerprint, found)
      })
    }

    projects.set(root, project)
    console.log(
      `[service] ${info.name}: ${renderer.name} via ${builder.name} ${session.toolVersion} at ${info.guestUrl}`
    )

    for (const tool of [detection.packageManager, ...detection.tools]) {
      console.log(`[service]   ${tool.summary}`)
    }

    for (const note of config.notes) {
      console.log(`[service]   ${note}`)
    }

    if (styles.info) {
      console.log(`[service]   ${styles.theme.length} theme variables from ${styles.info.name}`)
    }

    return withComponentList(project.info, project.list)
  }

  /**
   * Starts a project's builder in a process of its own and lists it. One that stops by itself shows as crashed, with
   * why, and can be started again from the list, on the port it had if that's free.
   */
  async function serveBuilder(
    root: string,
    name: string,
    builder: BuilderAdapter,
    options: BuilderStartOptions,
    again = false
  ): Promise<BuilderProcessSession> {
    const id = builderProcessId(root)
    const began = performance.now()

    // A reopened project gets a new port, so the windows load its code afresh. On its last address they'd draw with the
    // project's React from before, which kept every closed canvas's frames in memory: about 130 MB each time.
    const port = again
      ? await restartPort(lastPorts.get(root), guestPorts, ports)
      : await newGuestPort(guestPorts, ports)

    const tracking = trackProcess(
      { id, kind: "builder", shape: "server", name: builder.name, projectId: root, project: name, status: "starting" },
      { restart: () => restartBuilder(root) }
    )

    const started = adapters.startBuilder(builderProcessOptions(builder, { ...options, port }), {
      builder: builder.name,
      project: name,
      onCrash: (error, exit) => {
        console.warn(`[service] ${name}: ${error}`)
        tracking.set("failed", { error })
        track("builder.crashed", {
          builder: builder.name,
          ...(exit?.exitCode === undefined ? {} : { exitCode: exit.exitCode }),
          ...(exit?.signal ? { signal: exit.signal } : {}),
          output: lastLines(exit?.output ?? error)
        })
      },
      onCodeChange: (change) => {
        const project = projects.get(root)

        if (project) {
          listeners.codeChanged({ projectId: project.info.id, ...change })
        }
      }
    })

    if (started.pid) {
      tracking.set("starting", { pid: started.pid })
    }

    try {
      const session = await started.session
      const url = new URL(session.guestUrl)
      lastPorts.set(root, Number(url.port))
      guestPorts.add(Number(url.port))
      tracking.set("running", { url: url.origin })
      track("builder.ready", { builder: builder.name, durationMs: since(began), restart: again })

      return session
    } catch (error) {
      // A project that doesn't open shows why itself; a builder started again shows it in the list.
      if (again) {
        tracking.set("failed", { error: message(error) })
      } else {
        forgetProcess(id)
      }

      throw error
    }
  }

  /** Starts a project's builder again, as after it crashed, and records how that went. */
  async function restartBuilder(root: string): Promise<void> {
    const began = performance.now()
    const builder = projects.get(root)?.builder.name ?? root

    try {
      await startBuilderAgain(root)
      track("builder.restarted", { builder, durationMs: since(began), outcome: "ok" })
    } catch (error) {
      const code = errorCode(error)
      track("builder.restarted", { builder, durationMs: since(began), outcome: "error", ...(code ? { code } : {}) })
      throw error
    }
  }

  /** Starts a project's builder again with the components the project has now. */
  async function startBuilderAgain(root: string): Promise<void> {
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
    const drawn = await followGuest(root, project.drawnGuestUrl, session.guestUrl, listeners.guestMoved)

    // Unless it was started again meanwhile, and what the windows were told is already out of date.
    if (project.info.guestUrl === session.guestUrl) {
      project.drawnGuestUrl = drawn
    }
  }

  async function loadStyles(
    root: string,
    stylesheets: string[],
    detection: ProjectDetection
  ): Promise<{ info?: ProjectInfo["styles"]; theme: ThemeVariable[] }> {
    for (const stylesheet of stylesheets) {
      const source = await readFile(join(root, stylesheet), "utf8").catch(() => "")
      const adapter = adapters.styles.find((candidate) => candidate.detect(source))

      if (!adapter) {
        continue
      }

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
   * Watches the project's `.par` files, so edits made outside the canvas (by an agent, git, or a text editor) show up
   * in it. Writes from the canvas itself are recognized by their content and ignored. Its component files are read
   * again when they're added, changed, renamed or deleted, a moment after the last change, and props and the type check
   * when one of its config inputs changes: a tsconfig, package.json or a lockfile, the signal that dependencies changed.
   */
  function watchProjectFiles(project: Project): Watching | undefined {
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

      if (project.known.get(path) === text) {
        return
      }

      project.known.set(path, text)

      try {
        const document = readDesigns(path, text)
        const entry = project.info.documents.find((candidate) => candidate.path === path)

        if (entry) {
          Object.assign(entry, { document, error: undefined })
        } else {
          project.info.documents.push({ path, document })
        }

        console.log(`[service] ${path} changed on disk`)
        listeners.fileChanged({ projectId: project.info.id, path, document })
      } catch (error) {
        // Often a file caught mid-write; the next change event brings the rest.
        console.warn(`[service] ${path} changed on disk but can't be read: ${message(error)}`)
      }
    }

    const later = (key: string, ms: number, run: () => void) => {
      clearTimeout(timers.get(key))
      timers.set(key, setTimeout(run, ms))
    }

    try {
      const watching = watch(root, { recursive: true }, (_event, name) => {
        const path = name?.replaceAll("\\", "/")

        if (!path) {
          return
        }

        const change = projectFileChange(path, {
          componentExtensions: project.renderer.componentExtensions,
          configInput: isConfigInput(project, resolve(root, path))
        })

        if (change === "config") {
          configChanged()
        } else if (change === "component") {
          changed.add(path)
          later("components", 400, rescan)
        } else if (change === "document") {
          later(path, 120, () => void reload(path))
        }
      })

      return {
        close() {
          watching.close()

          for (const timer of timers.values()) {
            clearTimeout(timer)
          }
        }
      }
    } catch (error) {
      console.warn(`[service] can't watch ${root} for changes: ${message(error)}`)

      return undefined
    }
  }

  /**
   * Lists the project's config inputs as they are now, for its watcher to follow, and watches the folders outside the
   * root that hold some, such as a workspace's lockfile or a shared base config, for `changed`.
   */
  async function followConfig(project: Project, changed: () => void, tsconfig = readTsconfig(project.info.root)) {
    const { root } = project.info
    const lockfiles = await findLockfiles(root)
    const inputs = configInputs(tsconfig, lockfiles)

    if (projects.get(root) !== project) {
      return
    }

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

    for (const watcher of project.configWatchers ?? []) {
      watcher.close()
    }

    project.config = { files, lockfileFolders: lockFolders }
    project.configWatchers = [...folders]
      .filter((folder) => !inRoot(folder))
      .flatMap((folder) => {
        try {
          return [
            watch(folder, {}, (_event, name) => {
              if (name && isConfigInput(project, join(folder, name))) {
                changed()
              }
            })
          ]
        } catch (error) {
          console.warn(`[service] can't watch ${folder} for config changes: ${message(error)}`)

          return []
        }
      })
  }

  /** Whether a change to `file` (absolute) is a change to the project's config inputs, or to which lockfiles it has. */
  function isConfigInput(project: Project, file: string): boolean {
    if (!project.config) {
      return false
    }

    return project.config.files.has(file) || changesLockfiles(file, project.config.lockfileFolders)
  }

  /**
   * Sorts the app's sources again, then reads props and the type check again, after a config input changed. Components
   * in files the config now leaves out drop off the list and those in files it newly includes join it, as on opening.
   * The type checker makes the project's program again from the config as it is now (see `programCache` in
   * `@parity-app/code`), so the answers match a project opened afresh.
   */
  async function rereadConfig(project: Project, changed: () => void): Promise<void> {
    const { root } = project.info
    const tsconfig = readTsconfig(root)
    await followConfig(project, changed, tsconfig)

    if (projects.get(root) !== project) {
      return
    }

    console.log(`[service] ${project.info.name}'s config or dependencies changed, so its components are found again`)
    const read = await rediscoveredFiles(root, project.renderer, tsconfig, project.uiKit, project.list.sources)
    // The files discovery gives the checker, so never the entry that mounts the app, which the guest must not import.
    const files = await checkedAppFiles(root, project.renderer, tsconfig)

    if (projects.get(root) !== project) {
      return
    }

    const step = nextComponentList(project.list, { kind: "filesRead", read })
    takeList(project, step, files)
    const added = Object.keys(step.guest.add).length
    const removed = step.guest.drop.length

    if (added > 0 || removed > 0) {
      console.log(`[service]   ${added} components added, ${removed} left out`)
    }

    if (files.length > 0) {
      await checkTypes(project, files)

      return
    }

    const components = await project.components

    if (projects.get(root) === project) {
      notifyList(project, components)
    }
  }

  /**
   * Runs the type checker over the app's files once props are read, so the list gains what the parse can't see, such
   * as `const Select = SelectPrimitive.Root`, and loses the UI kit's undecided exports that aren't components. The
   * builder serves the guest from the list, so a guest loaded later has the new ones; the canvas hears about them and
   * adds them to the guest it has. Whether the checker read them, so what it found can be saved.
   */
  async function checkTypes(project: Project, files: string[]): Promise<boolean> {
    const { root, id } = project.info

    if (files.length === 0) {
      return true
    }

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
    let checked: Awaited<ReturnType<TypeChecker["checkComponents"]>>

    try {
      checked = await checker.checkComponents(root, files)
    } catch (error) {
      console.warn(`[service] the type checker couldn't read the components: ${message(error)}`)
      task.set("failed", { summary: "Couldn't read the components", error: message(error) })

      return false
    }

    if (projects.get(root) !== project) {
      return false
    }

    const step = nextComponentList(project.list, { kind: "checked", result: checked })
    task.set("passed", { summary: typeCheckSummary(files.length, step) })
    const added = Object.keys(step.guest.add).length
    console.log(`[service]   the type checker added ${added} components and left out ${step.guest.drop.length}`)
    // Told even when nothing changed, since it's the end of what opening the project reads.
    await settle(project, step)

    return true
  }

  /**
   * Brings the component list up to date after files changed: the parse reads the changed files again, so added,
   * renamed and deleted components show at once, and props are read again. The type checker then settles the changed
   * files and the files that import them, which is all a change can affect.
   */
  async function rescanComponents(project: Project, paths: string[]): Promise<void> {
    const { root } = project.info
    const tsconfig = readTsconfig(root)
    const { files } = await appFiles(root, project.renderer, tsconfig)
    const read = await readChangedFiles(root, project.renderer, files, project.uiKit, paths)

    if (projects.get(root) !== project) {
      return
    }

    const what = paths.length === 1 ? paths[0] : `${paths.length} files`
    await settle(project, nextComponentList(project.list, { kind: "filesRead", read }), `${what} changed`)

    const inApp = new Set(files)
    const reread = [...read.keys()].filter((path) => inApp.has(path) && read.get(path))

    if (reread.length === 0) {
      return
    }

    const toCheck = [...reread, ...(await importersOf(root, files, reread, tsconfig))]
    let checked: Awaited<ReturnType<TypeChecker["checkComponents"]>>

    try {
      checked = await checker.checkComponents(root, toCheck)
    } catch (error) {
      console.warn(`[service] the type checker couldn't read the changed components: ${message(error)}`)

      return
    }

    if (projects.get(root) !== project) {
      return
    }

    const step = nextComponentList(project.list, { kind: "checked", result: checked, files: new Set(toCheck) })

    if (step.changed) {
      await settle(project, step, "the type checker")
    }
  }

  /**
   * Takes the next component list into the project, serves it to the builder, so a guest loaded later has it, and
   * reads the props it needs, with `files` read too when every component's are.
   */
  function takeList(project: Project, step: ComponentListStep, files?: string[]): void {
    project.list = step.list
    project.session.setComponents(step.list.sources)
    readProps(project, step, files)
  }

  /** Takes the next component list into the project, and tells the windows once its props are read. */
  async function settle(project: Project, step: ComponentListStep, label?: string): Promise<void> {
    takeList(project, step)
    const components = await project.components
    const added = Object.keys(step.guest.add).length
    const removed = step.guest.drop.length

    if (label && (added > 0 || removed > 0)) {
      console.log(`[service]   ${label}: ${added} components added, ${removed} left out`)
    }

    if (projects.get(project.info.root) === project) {
      notifyList(project, components)
    }
  }

  /**
   * Reads the props a step says the list needs: every component's, with `files` read too so the type checker uses the
   * same program, or the named ones', kept with the rest. Ones no longer listed are let go either way.
   */
  function readProps(project: Project, step: ComponentListStep, files?: string[]): void {
    const { root } = project.info

    if (step.props === "all") {
      project.components = inferProps(root, step.list.sources, files)

      return
    }

    if (step.props.length === 0 && step.guest.drop.length === 0) {
      return
    }

    const named = new Set(step.props)
    const needed = Object.fromEntries(Object.entries(step.list.sources).filter(([id]) => named.has(id)))
    const known = project.components
    const more = named.size > 0 ? inferProps(root, needed) : Promise.resolve<Record<string, ComponentInfo>>({})
    project.components = Promise.all([known, more]).then(([props, read]) => {
      const all = { ...props, ...read }

      // What the checker left out, and what the person took off the list, since.
      for (const id of Object.keys(all)) {
        if (!(id in project.list.sources)) {
          delete all[id]
        }
      }

      return all
    })
  }

  /** Tells the windows the project's component list, with its props, as they are now. */
  function notifyList(project: Project, components: Record<string, ComponentInfo>): void {
    const { sources, leftOut } = project.list
    listeners.componentsChanged({ projectId: project.info.id, components, sources, leftOut })
  }

  /** Props inference that never fails the project: without it, panels fall back to free-form props. */
  function inferProps(
    root: string,
    sources: Record<string, ComponentSource>,
    files?: string[]
  ): Promise<Record<string, ComponentInfo>> {
    return checker.inferComponents(root, sources, files).catch((error: unknown) => {
      console.warn(`[service] couldn't infer component props: ${message(error)}`)

      return {}
    })
  }

  return {
    rootFor(root) {
      const path = normalize(resolve(root ?? startedWith ?? process.cwd()))

      if (!path.endsWith(".par")) {
        return path
      }

      for (let folder = dirname(path); ; folder = dirname(folder)) {
        if (existsSync(join(folder, "package.json"))) {
          return folder
        }

        if (dirname(folder) === folder) {
          return dirname(path)
        }
      }
    },

    open(root, { reopen = false } = {}) {
      const existing = projects.get(root)

      if (existing) {
        return Promise.resolve(withComponentList(existing.info, existing.list))
      }

      let pending = opening.get(root)

      if (!pending) {
        pending = recordOpen(root, reopen).finally(() => opening.delete(root))
        opening.set(root, pending)
      }

      return pending
    },

    async close(projectId) {
      const project = projects.get(projectId)
      projects.delete(projectId)
      checker.closeChecker(projectId, projects.size === 0 && opening.size === 0)
      stopProject(projectId)
      project?.watcher?.close()

      for (const watcher of project?.configWatchers ?? []) {
        watcher.close()
      }

      if (project) {
        track("project.closed", { name: project.info.name, root: projectId, openMs: since(project.openedAt) })
        // A reopen waits for the builder's process to end, so a project never has two builders at once.
        const closed = project.session.close()
        closing.set(projectId, closed)
        await closed

        if (closing.get(projectId) === closed) {
          closing.delete(projectId)
        }
      }

      return undefined
    },

    roots: () => [...projects.keys()],
    get: getProject,
    components: (projectId) => getProject(projectId).components,

    /**
     * Takes the person's corrections to the component list, as the canvas has the main project file now. An export
     * they put on the list is listed at once, and the files of the exports they changed are read again, so a correction
     * undone leaves detection to decide.
     */
    async correctComponents({ projectId, corrections }) {
      const project = getProject(projectId)
      const step = nextComponentList(project.list, { kind: "corrected", corrections })

      // Taken at once, before anything is awaited, so a type check that lands meanwhile keeps them.
      if (step.changed) {
        await settle(project, step, "the person's corrections")
      } else {
        project.list = step.list
      }

      if (step.reread.length > 0) {
        await rescanComponents(project, step.reread)
      }

      return undefined
    },

    /**
     * Writes a project file. Existing ones can be rewritten, and new ones created under the project as long as they
     * end in `.par`.
     */
    async saveDocument({ projectId, path, document }) {
      const project = getProject(projectId)
      const entry = project.info.documents.find((candidate) => candidate.path === path)

      if (entry && !entry.document) {
        throw new Error(`${path} couldn't be read, so it isn't overwritten`)
      }

      const target = documentTarget(project.info.root, path)

      if (!target) {
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

      if (entry) {
        entry.document = parsed
      } else {
        project.info.documents.push({ path, document: parsed })
      }

      return undefined
    },

    /**
     * Writes token values into the project's stylesheet: semantic tokens into `:root` or their theme class, theme
     * scale tokens into an `@theme` block, editing declarations in place where they already exist. A change without a
     * value takes the declaration out, and a block it leaves empty.
     */
    async saveTokens({ projectId, changes }) {
      const project = getProject(projectId)
      const stylesheet = project.info.styles?.stylesheet ?? project.stylesheets[0]

      if (!stylesheet) {
        throw new Error("The project has no stylesheet to write tokens to")
      }

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

        if (variable && change.theme === "default" && change.value !== undefined) {
          variable.value = change.value
        }
      }

      return edit
    },

    codeServedAt: (projectId, guestUrl) => projects.get(projectId)?.fingerprints.get(guestUrl),

    previewProject(projectId) {
      const project = projects.get(projectId)

      if (!project) {
        return undefined
      }

      const stylesheets = project.info.styles
        ? [project.info.styles.stylesheet, ...project.stylesheets]
        : project.stylesheets

      return { root: project.info.root, sources: project.list.sources, stylesheets: [...new Set(stylesheets)] }
    }
  }
}

function builderProcessId(root: string): string {
  return `builder:${root}`
}

/**
 * The project's code as its guest will draw it, for kept bitmaps: its files, and the guest module Parity draws it with,
 * so a new version of Parity doesn't show bitmaps the last one drew, and the components the builder serves it with now,
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

/** Writes a copy of the designs wherever the person chose in the save dialog. The project's own files don't change. */
export async function saveDocumentCopy({
  path,
  document
}: ServiceMethods["document.saveCopy"]["params"]): Promise<undefined> {
  if (!isAbsolute(path) || !path.endsWith(".par")) {
    throw new Error(`${path} is not a .par file`)
  }

  await writeFile(path, `${JSON.stringify(parseCanvasDocument(document), null, 2)}\n`)

  return undefined
}

/** The first builder that recognises the project, with what it found; otherwise what each one looked for. */
async function findBuilder(
  builders: BuilderAdapter[],
  root: string
): Promise<{ builder: BuilderAdapter; detection: BuilderDetection } | { builder?: undefined; misses: string[] }> {
  const misses: string[] = []

  for (const builder of builders) {
    const detection = await builder.detect(root)

    if (detection.found) {
      return { builder, detection }
    }

    misses.push(`${builder.name}: ${detection.summary}`)
  }

  return { misses }
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
