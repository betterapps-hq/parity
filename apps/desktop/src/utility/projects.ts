import { createHash } from "node:crypto"
import { existsSync, readFileSync, realpathSync, watch as watchFolder } from "node:fs"
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
  type ActionResult,
  type Adapter,
  type BuilderAdapter,
  type BuilderDetection,
  type BuilderStartOptions,
  type ClassPrinter,
  type CodeChange,
  type ComponentInfo,
  type ComponentSource,
  type DetectContext,
  type EntitiesAdapter,
  libraryManifestExtension,
  parseCanvasDocument,
  type PackageManifest,
  type ProjectRoute,
  type RendererAdapter,
  type RouterAdapter,
  type StylesAdapter,
  type ThemeVariable,
  withLibraryCanvas,
  writeClasses
} from "@parity-app/core"
import {
  type BuilderProcessOptions,
  builderProcessOptions,
  type BuilderProcessSession,
  lastLines
} from "@parity-app/processes"
import {
  type AdapterFound,
  appFiles,
  changesLockfiles,
  codeSnapshot,
  detectAdapters,
  detectContext,
  detectionInputs,
  detectProject,
  discoverProject,
  documentTarget,
  findLockfiles,
  findPackage,
  exportEntities,
  adapterActions,
  adapterStatus,
  importEntities,
  importersOf,
  lockfileFolders,
  type OpenedProjectInfo,
  openedProjectInfo,
  pickMainDocument,
  projectSource,
  type ProjectDetection,
  projectFileChange,
  readChangedFiles,
  readDesigns,
  readPackage,
  readTsconfig,
  withComponentList
} from "@parity-app/project"
import { errorCode } from "@parity-app/telemetry"
import { writeTokenChanges } from "@parity-app/tokens"
import { logNote } from "../shared/log.ts"
import type {
  FrameClassesWritten,
  ProjectEditResult,
  ProjectInfo,
  ServiceMethods,
  WindowMethods
} from "../shared/protocol.ts"
import { inSpan, track } from "../shared/tracing.ts"
import type { ServedCode } from "./bitmap-store.ts"
import type { BuilderExit, StartedBuilder } from "./builders.ts"
import { degraded } from "./degraded.ts"
import type { SavedDetection } from "./detection-cache.ts"
import { applyProjectEdit, queued } from "./edits.ts"
import { environment, type ServiceEnvironment } from "./environment.ts"
import type { Attributes } from "./event-attributes.ts"
import { followGuest, type GuestMoved, newGuestPort, type PortFinder, restartPort } from "./guest-ports.ts"
import { stopProject } from "./process-manager.ts"
import { forgetProcess, trackProcess } from "./processes.ts"
import { writeProjectFile } from "./project-files.ts"
import type { TypeChecker } from "./props.ts"
import { toolServers } from "./tool-servers.ts"

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
  /** What detection reads of a project changed since it opened, so its tabs open it again (PAR-820). */
  detectionChanged: (change: WindowMethods["project.detectionChanged"]["params"]) => void
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
  /** The routers whose routes Parity reads, so the canvas draws each page (PAR-1076). None unless given. */
  routers?: RouterAdapter[]
  /** The tools whose files Parity reads as its own entities, as Storybook's stories as screens. None unless given. */
  entities?: EntitiesAdapter[]
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
  /** Its package.json, as it was when it opened. */
  pkg: PackageManifest
  /** The adapters it's opened with, those that found their tool, with what each found. */
  used: AdapterFound[]
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
  /**
   * The project's styling framework as a printer, which writes and compiles the classes its frames draw layers with.
   * Unset until a frame asks, and again when its stylesheets change. Nothing when the framework couldn't be loaded.
   */
  frameClasses?: Promise<ClassPrinter | undefined>
  /**
   * The stamp of its stylesheets' last change, when its builder serves the guest restyled
   * (`BuilderSession.restyledGuestUrl`), so a builder started again on the same port serves it where the windows
   * already draw it rather than at an address they loaded before the change.
   */
  restyled?: number
  /**
   * What detection read of the project as it opened (`detectionInputs`), and the files, relative to the root, it was
   * read from, followed as they are now: a change to one that changes the key needs the project opened again.
   */
  detected?: { key: string; files: Set<string> }
}

/** What an open learned on the way, for `project.opened` or `project.openFailed` (PAR-637). */
/** What `project.opened` and `project.openFailed` both carry. */
type OpenAttributes = Omit<Attributes<"project.opened">, "cached" | "components" | "designs" | "tokens" | "libraries">

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

/** The projects open in tabs. Each runs its own builder, so tabs never share a module graph. */
export interface OpenProjects {
  /** A project's root from a folder, or from one of its `.par` files; without either, the one Parity was started with. */
  rootFor: (root: string | undefined) => string
  /** Opens a project, or gives the one open or opening there. `reopen` when it's one open as Parity last quit. */
  open: (root: string, how?: { reopen?: boolean }) => Promise<ProjectInfo>
  close: (projectId: string) => Promise<undefined>
  /**
   * Whether what detection reads of an open project changed since it opened, so opening it again detects it afresh
   * (PAR-820), as `parity open` on an open project asks.
   */
  detectAgain: (projectId: string) => Promise<boolean>
  /** The roots of the projects open now. */
  roots: () => string[]
  get: (projectId: string) => OpenProject
  /** The project's components with their props, once inferred. */
  components: (projectId: string) => Promise<Record<string, ComponentInfo>>
  correctComponents: (params: ServiceMethods["project.correctComponents"]["params"]) => Promise<undefined>
  saveDocument: (params: ServiceMethods["document.save"]["params"]) => Promise<undefined>
  saveEntities: (params: ServiceMethods["entities.save"]["params"]) => Promise<undefined>
  saveTokens: (params: ServiceMethods["tokens.save"]["params"]) => Promise<ProjectEditResult>
  frameClasses: (params: ServiceMethods["styles.classes"]["params"]) => Promise<FrameClassesWritten>
  /** The project's code as the address a job draws from first served it, while the project is open. */
  codeServedAt: (projectId: string, guestUrl: string) => ServedCode | undefined
  previewProject: (projectId: string) => PreviewProject | undefined
  /** The project files the modules of `files` load, by its builder's account (PAR-994); none when it can't say. */
  loadedFiles: (projectId: string, files: string[]) => Promise<string[] | undefined>
  /** Does one of an adapter's actions, as opening a component's stories in Storybook. */
  runAction: (params: ServiceMethods["adapter.run"]["params"]) => Promise<ActionResult>
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

  // The files whose coming or going means a project is detected again, as each adapter watches them (PAR-826).
  const everyAdapter: Adapter[] = [
    ...adapters.renderers,
    ...adapters.builders,
    ...adapters.styles,
    ...(adapters.routers ?? []),
    ...(adapters.entities ?? [])
  ]

  const watched = [...new Set(everyAdapter.flatMap((adapter) => adapter.watches ?? []))]
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
    // Read first, so a change made while the project opens is a change from what it opened with.
    const inputs = await detectionInputs(root, watched).catch(() => undefined)
    const pkg = (await readPackage(root))?.manifest

    if (!pkg) {
      throw unsupported("no_package", `There's no package.json in ${root}`)
    }

    // Every adapter is asked whether the project uses its tool, through the same context, and only those that find it
    // are used: the first renderer and builder, and every other.
    const project = detectContext(root, pkg)
    const rendererFound = (await detectAdapters(project, adapters.renderers)).find(({ detection }) => detection.found)

    if (!rendererFound) {
      throw unsupported("no_renderer", `No renderer supports ${pkg.name ?? root}`)
    }

    const renderer = rendererFound.adapter
    opening.framework = renderer.id
    const usedBy = <A extends Adapter>(found: AdapterFound<A>[]) => found.filter(({ detection }) => detection.found)

    const [styles, routers, entitiesFound] = await Promise.all([
      detectAdapters(project, adapters.styles).then(usedBy),
      detectAdapters(project, adapters.routers ?? []).then(usedBy),
      detectAdapters(project, adapters.entities ?? []).then(usedBy)
    ])

    const others = [...styles, ...routers, ...entitiesFound]

    const found = await findBuilder(adapters.builders, project).catch(async (cause: unknown) => {
      // A builder that can't load the project's config, as a broken vite.config, still leaves the versions to record.
      opening.versions = await toolVersions(root, await detectProject(root, pkg, [rendererFound, ...others]))
      throw cause
    })

    const used: AdapterFound[] = [
      rendererFound,
      ...(found.builder ? [{ adapter: found.builder, detection: found.detection }] : []),
      ...others
    ]

    const detection = await detectProject(root, pkg, used)

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
    const usedRouters = routers.map(({ adapter }) => adapter)
    const usedEntities = entitiesFound.map(({ adapter }) => adapter)
    const routes = projectRoutes(usedRouters, root)
    // A project file that can't be read stops the project opening, with an error naming it (PAR-1011).
    const known = new Map<string, string>()

    const documents = await Promise.all(
      config.documents.map(async (path) => {
        const text = await readFile(join(root, path), "utf8")
        known.set(path, text)

        return { path, document: readDesigns(path, text) }
      })
    )

    const mainDocument = pickMainDocument(config.documents, name)
    const main = documents.find((entry) => entry.path === mainDocument)?.document

    // The person's corrections come before what was saved, so changing them is a change the fingerprint sees.
    const discovered = nextComponentList(
      { sources: {}, leftOut: [], namespace: config.namespace },
      { kind: "discovered", sources: config.components, corrections: main?.detection }
    )

    // What the type checker and props found last time, when nothing they read has changed since.
    const { fingerprint, saved } = await detections.saved(root, config.componentFiles, discovered.list.sources)

    const opened = saved
      ? nextComponentList(discovered.list, { kind: "restored", sources: saved.sources, leftOut: saved.leftOut ?? [] })
      : discovered

    opening.cached = !!saved
    // The entities the project's tools describe, as its stories as screens, naming the components as the list does.
    const entities = await importEntities(root, opened.list.sources, usedEntities, config.notes)

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
      inputs,
      known,
      mainDocument,
      name,
      opened,
      renderer,
      routes,
      entities,
      usedRouters,
      usedEntities,
      used,
      pkg,
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

    const common = (): OpenAttributes => {
      const attributes: OpenAttributes = { name: opening.name, root, reopen, durationMs: since(began) }

      if (opening.detectionMs !== undefined) {
        attributes.detectionMs = opening.detectionMs
      }

      if (opening.builderMs !== undefined) {
        attributes.builderMs = opening.builderMs
      }

      if (opening.framework) {
        attributes.framework = opening.framework
      }

      if (opening.builder) {
        attributes.builder = opening.builder
      }

      return { ...attributes, ...opening.versions }
    }

    try {
      const info = await start(root, opening)
      track("project.opened", {
        ...common(),
        cached: opening.cached,
        components: Object.keys(info.sources).length,
        designs: info.documents.reduce((sum, entry) => sum + entry.document.containers.length, 0),
        tokens: info.theme.length,
        libraries: info.libraries.length
      })

      return info
    } catch (error) {
      const code = errorCode(error)
      const failed: Attributes<"project.openFailed"> = { ...common(), step: opening.step, message: message(error) }

      if (code) {
        failed.code = code
      }

      track("project.openFailed", failed)
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
      inputs,
      known,
      mainDocument,
      name,
      opened,
      renderer,
      routes,
      entities,
      usedRouters,
      usedEntities,
      used,
      pkg,
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
      serving.catch((cause: unknown) => {
        throw new Error(explain(message(cause)), { cause })
      }),
      loadStyles(root, config.styles, detection)
    ]).catch((cause: unknown) => {
      void serving.then(
        (started) => started.close(),
        () => undefined
      )
      forgetProcess(builderProcessId(root))
      throw cause
    })

    // The adapters the project uses, each told what Parity found of its tool for its status items and actions.
    const told = [
      { adapter: renderer },
      { adapter: builder, version: session.toolVersion },
      ...adapters.styles.filter((adapter) => adapter.id === styles.info?.id).map((adapter) => ({ adapter })),
      ...usedRouters.map((adapter) => ({ adapter })),
      ...usedEntities.map((adapter) => ({ adapter }))
    ]

    const info = openedProjectInfo({
      root,
      name,
      renderer: { id: renderer.id, name: renderer.name },
      builder: { id: builder.id, name: builder.name, toolVersion: session.toolVersion },
      router: usedRouters[0] && { id: usedRouters[0].id, name: usedRouters[0].name },
      styles,
      guestUrl: session.guestUrl,
      routes,
      entities,
      actions: adapterActions(told, detection, entities, routes),
      status: adapterStatus(told, detection, entities, routes),
      config,
      detection,
      documents,
      mainDocument
    })

    const project: Project = {
      info,
      pkg,
      used,
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
      uiKit: config.uiKit || undefined,
      openedAt: performance.now(),
      detected: inputs && { key: inputs.key, files: new Set(inputs.files) }
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
    // What detection read was taken before the watcher started, so a change made while the project opened is caught.
    void tellDetectionChanged(project)
    logNote(`[service] ${info.name}: ${renderer.name} via ${builder.name} ${session.toolVersion} at ${info.guestUrl}`)

    for (const tool of [detection.packageManager, ...detection.tools]) {
      logNote(`[service]   ${tool.summary}`)
    }

    for (const note of config.notes) {
      logNote(`[service]   ${note}`)
    }

    if (styles.info) {
      logNote(`[service]   ${styles.theme.length} theme variables from ${styles.info.name}`)
    }

    return withComponentList(project.info, project.list)
  }

  /**
   * Starts a project's builder in a process of its own and lists it. One that stops by itself shows as crashed, with
   * why, and can be started again from the list, on the port it had if that's free; `newPort` takes one no guest has
   * had even then, as a builder that can't serve its guest restyled needs (PAR-821).
   */
  async function serveBuilder(
    root: string,
    name: string,
    builder: BuilderAdapter,
    options: BuilderStartOptions,
    again = false,
    newPort = !again
  ): Promise<BuilderProcessSession> {
    const id = builderProcessId(root)
    const began = performance.now()

    // A reopened project gets a new port, so the windows load its code afresh. On its last address they'd draw with the
    // project's React from before, which kept every closed canvas's frames in memory: about 130 MB each time.
    const port = newPort
      ? await newGuestPort(guestPorts, ports)
      : await restartPort(lastPorts.get(root), guestPorts, ports)

    const tracking = trackProcess(
      {
        id,
        kind: "builder",
        lifetime: "server",
        name: builder.name,
        projectId: root,
        project: name,
        status: "starting"
      },
      { restart: () => restartBuilder(root) }
    )

    const started = adapters.startBuilder(builderProcessOptions(builder, { ...options, port }), {
      builder: builder.name,
      project: name,
      onCrash: (error, exit) => {
        console.warn(`[service] ${name}: ${error}`)
        tracking.set("failed", { error })

        const crashed: Attributes<"builder.crashed"> = {
          builder: builder.name,
          output: lastLines(exit?.output ?? error)
        }

        if (exit?.exitCode !== undefined) {
          crashed.exitCode = exit.exitCode
        }

        if (exit?.signal) {
          crashed.signal = exit.signal
        }

        track("builder.crashed", crashed)
      },
      onCodeChange: (change) => {
        const project = projects.get(root)

        if (project) {
          listeners.codeChanged({ projectId: project.info.id, ...change })
        }

        if (project && change.styles) {
          void restyle(project, change.stamp).catch((cause: unknown) => {
            console.warn(`[service] ${name}: couldn't serve its changed stylesheets: ${message(cause)}`)
          })
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
      const restarted: Attributes<"builder.restarted"> = { builder, durationMs: since(began), outcome: "error" }

      if (code) {
        restarted.code = code
      }

      track("builder.restarted", restarted)
      throw error
    }
  }

  /**
   * Starts a project's builder again with the components the project has now. `newPort` serves it where the windows
   * have loaded nothing, so they load all of it afresh.
   */
  async function startBuilderAgain(root: string, newPort = false): Promise<void> {
    const project = getProject(root)
    await project.session.close()
    const session = await serveBuilder(root, project.info.name, project.builder, servingOptions(project), true, newPort)

    if (projects.get(root) !== project) {
      await session.close()

      return
    }

    project.session = session
    const restyled = project.restyled === undefined ? undefined : await session.restyledGuestUrl?.(project.restyled)

    if (!restyled) {
      project.restyled = undefined
    }

    if (projects.get(root) === project && project.session === session) {
      await serveGuestAt(project, restyled ?? session.guestUrl)
    }
  }

  /**
   * Serves the project's guest restyled once one of its stylesheets changed (PAR-821), and tells the windows, as when
   * its builder moves: a guest loaded there imports the stylesheets afresh, so frames, bitmaps and tokens draw the CSS
   * as it is now. A builder that can't serve it restyled is started again on a new port instead. The styling
   * framework's theme is read again for tabs opened later.
   */
  async function restyle(project: Project, stamp: number): Promise<void> {
    const { root } = project.info
    const { session } = project

    const [guestUrl, styles] = await Promise.all([
      session.restyledGuestUrl?.(stamp),
      loadStyles(root, project.stylesheets, project.info.detection)
    ])

    if (projects.get(root) !== project) {
      return
    }

    project.info.theme = styles.theme
    // Its classes mean what its stylesheets say now, so they're written afresh.
    project.frameClasses = undefined

    if (styles.info) {
      project.info.styles = styles.info
    }

    if (project.session !== session) {
      return
    }

    if (!guestUrl) {
      logNote(`[service] ${project.info.name}'s stylesheets changed, so its builder starts again`)
      await startBuilderAgain(root, true)

      return
    }

    logNote(`[service] ${project.info.name}'s stylesheets changed, so its guest loads from ${guestUrl}`)
    project.restyled = stamp
    await serveGuestAt(project, guestUrl)
  }

  /** The options the project's builder serves its guest with now: its start options, with the components it has. */
  function servingOptions(project: Project): BuilderStartOptions {
    return { ...project.startOptions, config: { ...project.startOptions.config, components: project.list.sources } }
  }

  /**
   * Serves the project's guest at `guestUrl`, kept bitmaps named by its code as that address first serves it, and tells
   * the windows when that isn't where they draw it, checked against where they do, so a move they couldn't load is
   * tried again the next time.
   */
  async function serveGuestAt(project: Project, guestUrl: string): Promise<void> {
    project.info.guestUrl = guestUrl

    if (!project.fingerprints.has(guestUrl)) {
      project.fingerprints.set(guestUrl, servedCode(project.info.root, servingOptions(project)))
    }

    const drawn = await followGuest(project.info.root, project.drawnGuestUrl, guestUrl, listeners.guestMoved)

    // Unless it moved again meanwhile, and what the windows were told is already out of date.
    if (project.info.guestUrl === guestUrl) {
      project.drawnGuestUrl = drawn
    }
  }

  /**
   * The project's styling framework as a printer of classes, or nothing when it can't be loaded: the project's frames
   * then draw from their rules, which draw the same declarations.
   */
  async function loadClassPrinter(
    adapter: StylesAdapter,
    info: Pick<ProjectInfo, "root" | "name">,
    stylesheet: string
  ): Promise<ClassPrinter | undefined> {
    try {
      return await adapter.loadPrinter(info.root, stylesheet)
    } catch (error) {
      logNote(`[service] ${info.name}'s frames draw without ${adapter.name}'s classes: ${message(error)}`)

      return undefined
    }
  }

  async function loadStyles(
    root: string,
    stylesheets: string[],
    detection: ProjectDetection
  ): Promise<{ info?: ProjectInfo["styles"]; theme: ThemeVariable[] }> {
    for (const stylesheet of stylesheets) {
      const source = await readFile(join(root, stylesheet), "utf8").catch(() => "")
      const adapter = adapters.styles.find((candidate) => candidate.handles(source))

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
        .catch((cause: unknown) => {
          degraded("component_reread", "couldn't read the changed components", cause, root)
        })
    }

    const configChanged = () => {
      clearTimeout(timers.get("config"))
      timers.set(
        "config",
        setTimeout(() => {
          rescanning = rescanning
            .then(() => rereadConfig(project, configChanged))
            .catch((cause: unknown) => {
              degraded("config_reread", "couldn't read props again after the config changed", cause, root)
            })
        }, 400)
      )
    }

    void followConfig(project, configChanged).catch((cause: unknown) => {
      degraded("config_watch", `can't follow ${root}'s config for changes`, cause, root)
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
          entry.document = document
        } else {
          project.info.documents.push({ path, document })
        }

        logNote(`[service] ${path} changed on disk`)
        listeners.fileChanged({ projectId: project.info.id, path, document })
      } catch (error) {
        // Often a file caught mid-write; the next change event brings the rest.
        degraded("design_reload", `${path} changed on disk but can't be read`, error, root)
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

        if (project.detected?.files.has(path)) {
          later("detection", 400, () => void tellDetectionChanged(project))
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
      degraded("watch", `can't watch ${root} for changes`, error, root)

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
          degraded("config_watch", `can't watch ${folder} for config changes`, error, root)

          return []
        }
      })
  }

  /** Tells the windows when what detection reads of the project changed since it opened, so they open it again. */
  async function tellDetectionChanged(project: Project): Promise<void> {
    if (await detectionChanged(project)) {
      listeners.detectionChanged({ projectId: project.info.id })
    }
  }

  /**
   * Reads what detection reads of the project again (PAR-820), and whether it changed since the project opened:
   * `components.json` added, a stylesheet created, a dependency added. Only opening it again takes that in. A file
   * caught mid-write reads as no change, and the next event reads it again.
   */
  async function detectionChanged(project: Project): Promise<boolean> {
    const { root } = project.info
    const inputs = await detectionInputs(root, watched).catch(() => undefined)

    if (!inputs || projects.get(root) !== project) {
      return false
    }

    const opened = project.detected?.key ?? inputs.key
    project.detected = { key: opened, files: new Set(inputs.files) }

    if (inputs.key === opened) {
      return false
    }

    logNote(`[service] ${project.info.name}'s stylesheets, dependencies or builder config changed since it opened`)

    return true
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

    logNote(`[service] ${project.info.name}'s config or dependencies changed, so its components are found again`)
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
      logNote(`[service]   ${added} components added, ${removed} left out`)
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
        lifetime: "task",
        name: "Type check",
        projectId: id,
        project: project.info.name,
        status: "running",
        detail: files.length === 1 ? "Reading 1 component file" : `Reading ${files.length} component files`
      },
      {
        restart: async () => {
          await checkTypes(project, files)
        }
      }
    )

    await project.components
    let checked: Awaited<ReturnType<TypeChecker["checkComponents"]>>

    try {
      checked = await checker.checkComponents(root, files)
    } catch (error) {
      degraded("type_check", "the type checker couldn't read the components", error, root)
      task.set("failed", { summary: "Couldn't read the components", error: message(error) })

      return false
    }

    if (projects.get(root) !== project) {
      return false
    }

    const step = nextComponentList(project.list, { kind: "checked", result: checked })
    task.set("passed", { summary: typeCheckSummary(files.length, step) })
    const added = Object.keys(step.guest.add).length
    logNote(`[service]   the type checker added ${added} components and left out ${step.guest.drop.length}`)
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
      degraded("type_check", "the type checker couldn't read the changed components", error, root)

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
      logNote(`[service]   ${label}: ${added} components added, ${removed} left out`)
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
    return checker.inferComponents(root, sources, files).catch((cause: unknown) => {
      degraded("prop_inference", "couldn't infer component props", cause, root)

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

    async detectAgain(projectId) {
      const project = projects.get(projectId)

      return project ? detectionChanged(project) : false
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
     * Writes a project file whole, after the project's edits and saves before it. Existing ones can be rewritten, and
     * new ones created under the project as long as they end in `.par`. What it wrote is known once it has landed, so
     * the watcher takes the change as the service's own.
     */
    async saveEntities({ projectId, document }) {
      const project = getProject(projectId)
      const { info } = project

      await queued(project, async () => {
        const { writes, entities } = await exportEntities(
          info.root,
          project.list.sources,
          adapters.entities ?? [],
          info.entities,
          parseCanvasDocument(document).containers
        )

        for (const { path, text } of writes) {
          await writeProjectFile(info.root, path, text)
          project.known.set(path, text)
        }

        info.entities = entities
      })

      return undefined
    },

    async saveDocument({ projectId, path, document }) {
      const project = getProject(projectId)
      const entry = project.info.documents.find((candidate) => candidate.path === path)

      const target = documentTarget(project.info.root, path)

      if (!target) {
        throw new Error(`${path} is not a .par file inside the project`)
      }

      const parsed = parseCanvasDocument(document)

      await queued(project, async () => {
        // A `.lib.par` keeps its designs in `canvas`, beside what its author wrote about the library.
        const value = path.endsWith(libraryManifestExtension)
          ? withLibraryCanvas(JSON.parse(await readFile(target, "utf8")), parsed)
          : parsed

        const text = `${JSON.stringify(value, null, 2)}\n`
        await writeProjectFile(project.info.root, path, text)
        project.known.set(path, text)
      })

      if (entry) {
        entry.document = parsed
      } else {
        project.info.documents.push({ path, document: parsed })
      }

      return undefined
    },

    /**
     * Writes token values into the project's stylesheet, as the styling framework that read it keeps them (its
     * adapter's `writeTokens`: Tailwind's theme in `@theme`), or as plain custom properties when no adapter read it:
     * into `:root` or their theme's block, editing declarations in place where they already exist and adding the
     * rest. A change without a value takes the declaration out, and a block it leaves empty.
     */
    async saveTokens({ projectId, changes }) {
      const project = getProject(projectId)
      const stylesheet = project.info.styles?.stylesheet ?? project.stylesheets[0]

      if (!stylesheet) {
        throw new Error("The project has no stylesheet to write tokens to")
      }

      const adapter = adapters.styles.find((candidate) => candidate.id === project.info.styles?.id)
      const source = await readFile(join(project.info.root, stylesheet), "utf8")

      const content = adapter
        ? adapter.writeTokens(source, changes, project.info.theme)
        : writeTokenChanges(source, changes)

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

    /**
     * The classes the project's styling framework writes for each declaration (core's `writeClasses`). The framework
     * is loaded the first time a frame asks, and again once the project's stylesheets change.
     */
    async frameClasses({ projectId, declarations, written }) {
      const project = getProject(projectId)
      const styles = project.info.styles
      const adapter = styles && !styles.error ? adapters.styles.find(({ id }) => id === styles.id) : undefined

      if (!styles || !adapter) {
        return { supported: false, classes: [], css: "" }
      }

      project.frameClasses ??= loadClassPrinter(adapter, project.info, styles.stylesheet)
      const printer = await project.frameClasses

      return printer
        ? { supported: true, ...writeClasses(printer, written, declarations) }
        : { supported: false, classes: [], css: "" }
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
    },

    loadedFiles: (projectId, files) =>
      projects.get(projectId)?.session.loadedFiles(files) ?? Promise.resolve(undefined),

    async runAction({ projectId, adapter: id, action, component, page }) {
      const project = getProject(projectId)
      const found = project.used.find(({ adapter }) => adapter.id === id)

      if (!found?.adapter.run || !found.adapter.actions?.some((each) => each.id === action)) {
        throw new Error(`${project.info.name} has no ${id} action ${action}`)
      }

      const { info } = project

      return found.adapter.run(action, {
        project: detectContext(info.root, project.pkg),
        source: projectSource(info.root, project.list.sources),
        detection: found.detection,
        component,
        page,
        servers: toolServers({ id: info.id, name: info.name, root: info.root }, id)
      })
    }
  }
}

function builderProcessId(root: string): string {
  return `builder:${root}`
}

/**
 * The project's code as its guest will draw it, for kept bitmaps and previews: its files, and the guest module Parity
 * draws it with, as the snapshot's salt, so a new version of Parity doesn't show bitmaps the last one drew, and the
 * components the builder serves it with now, which change in place later. `bitmapFormat` goes up when what's kept
 * changes.
 */
function servedCode(root: string, options: BuilderStartOptions): ServedCode {
  const guest = readFile(options.rendererGuestPath).catch(() => Buffer.alloc(0))

  const code = guest.then((contents) =>
    codeSnapshot(root, `${bitmapFormat}:${createHash("sha256").update(contents).digest("hex")}`)
  )

  return {
    code,
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
  project: DetectContext
): Promise<{ builder: BuilderAdapter; detection: BuilderDetection } | { builder?: undefined; misses: string[] }> {
  const misses: string[] = []

  for (const builder of builders) {
    const detection = await builder.detect(project)

    if (detection.found) {
      return { builder, detection }
    }

    misses.push(`${builder.name}: ${detection.summary}`)
  }

  return { misses }
}

export function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * The app's routes, from the first router the project uses (PAR-1076), or none. A route file that can't be read counts
 * as missing, as the router's own tooling may not have written it yet.
 */
function projectRoutes(routers: readonly RouterAdapter[], root: string): ProjectRoute[] {
  const [router] = routers

  return (
    router?.readRoutes((path) => {
      try {
        return readFileSync(join(root, path), "utf8")
      } catch {
        return undefined
      }
    }) ?? []
  )
}
