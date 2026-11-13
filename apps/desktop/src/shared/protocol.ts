import type {
  AccessibilityFinding,
  AccessibilityIssue,
  FrameContrast,
  IconNames,
  MeasuredNode
} from "@parity-app/agent"
import type { ConsoleEntry, PresenceEvent, TabSnapshot, TabSummary } from "@parity-app/agent"
import type { AgentMethods } from "@parity-app/agent/contracts"
import type { CopyReport } from "@parity-app/agent/routing"
import type { FrameChange } from "@parity-app/change-detection"
import type { RecentSearch, SearchAnswer } from "@parity-app/connectors"
import type {
  CanvasDocument,
  ChangeConflict,
  CodeChange,
  ComponentInfo,
  ComponentSource,
  DesignChange,
  LeftOutExport,
  ModesChange,
  WrittenClasses
} from "@parity-app/core"
import type { CodeReference, EditStatus, ImageFile, RecoveryCopy, ReferenceAdded } from "@parity-app/editor"
import type { UpdateState } from "@parity-app/processes"
import type { ProjectInfo } from "@parity-app/project"
import type { ResolvedTelemetry, TelemetryLevel, TraceHeaders } from "@parity-app/telemetry"
import type { TokenChange } from "@parity-app/tokens"
import type { z } from "zod"
import type { SignInRequest } from "./account.ts"
import type { ConnectorPlaced, ConnectorSearch, ConnectorState } from "./connectors.ts"
import type { openInEditorRequest, saveDialogOptions, ThemeSource } from "./ipc-checks.ts"
import type { ProjectPicture, ServiceParams } from "./service-params.ts"

/**
 * What a project's styling framework wrote for the declarations its frames draw layers with (PAR-942): each one's
 * classes, and the CSS of those and of the classes the frames already had.
 */
export interface FrameClassesWritten extends WrittenClasses {
  /** Whether the project has a styling framework that writes classes. Without one, its frames draw from rules alone. */
  supported: boolean
}

/**
 * An edit the service made to a project's files: what it was for, each file's change as a unified diff (or a binary
 * file's size), and the id that undoes it.
 */
export interface ProjectEditResult {
  id: string
  label: string
  files: { path: string; diff: string }[]
}

/** Requests a canvas window sends to the project service, by method name. */
export interface ServiceMethods {
  /** Opens a project, or returns it if it's already open. Without a root, opens the default project. */
  "project.open": { params: ServiceParams["project.open"]; result: ProjectInfo }
  "project.close": { params: ServiceParams["project.close"]; result: undefined }
  /**
   * Whether what detection reads of an open project (its stylesheets, `components.json`, dependencies, Vite config)
   * changed since it opened, so only opening it again takes that in (PAR-820).
   */
  "project.detectAgain": { params: ServiceParams["project.detectAgain"]; result: boolean }
  /** The project's components and their props, once inferred from source. */
  "project.components": { params: ServiceParams["project.components"]; result: Record<string, ComponentInfo> }
  /**
   * The person's corrections to which exports are components, whenever the main project file's change: the component
   * list follows them, though they're saved only when the file is.
   */
  "project.correctComponents": { params: ServiceParams["project.correctComponents"]; result: undefined }
  /** Libraries that can be added, and the ones the project has. */
  "library.catalog": {
    params: ServiceParams["library.catalog"]
    result: {
      id: string
      name: string
      description: string
      package: string
      kind: "components" | "icons"
      installed: boolean
    }[]
  }
  /**
   * Installs a library with the project's package manager and imports its styles. The tab then reopens to pick up its
   * components.
   */
  "library.add": { params: ServiceParams["library.add"]; result: { log: string; edit?: ProjectEditResult } }
  /** Imports an installed library's styles into the project's stylesheet; nothing to do when it imports them already. */
  "library.importStyles": { params: ServiceParams["library.importStyles"]; result: ProjectEditResult | undefined }
  "document.save": { params: ServiceParams["document.save"]; result: undefined }
  /**
   * Keeps a recovery copy of the project's unsaved changes in Parity's app data, or removes it when there's none, so a
   * crash or a forced quit doesn't lose them (PAR-905).
   */
  "recovery.keep": { params: ServiceParams["recovery.keep"]; result: undefined }
  /** The recovery copy kept for the project when Parity last closed with its changes unsaved, if there is one. */
  "recovery.read": { params: ServiceParams["recovery.read"]; result: RecoveryCopy | undefined }
  /**
   * Saves an image pasted onto the canvas into the project's public folder, where the dev server serves it. `data` is
   * the file, base64 encoded; `type` its media type. No edit when the same image was saved before.
   */
  "images.import": {
    params: ServiceParams["images.import"]
    result: { src: string; path: string; edit?: ProjectEditResult }
  }
  /**
   * The project's image files under `public/images/`, and the lines of its code that name them (PAR-834). The window
   * and agents put them together with their designs through `projectImages`.
   */
  "images.scan": { params: ServiceParams["images.scan"]; result: { files: ImageFile[]; references: CodeReference[] } }
  /**
   * Saves a picture from a stock library's link into `public/images/`, as adding one from the library browser does
   * (PAR-839), named after what it shows. Refuses a link that isn't https, or that doesn't give a picture Parity takes.
   */
  "images.saveFrom": { params: ServiceParams["images.saveFrom"]; result: { src: string; path: string } }
  /**
   * Removes an image file from `public/images/` as an edit, so undoing it puts the file back. Refuses a file the
   * project's code names; the caller checks its designs first.
   */
  "images.remove": { params: ServiceParams["images.remove"]; result: { path: string; edit: ProjectEditResult } }
  /**
   * Takes back an edit the service made to the project's files, unless a file has changed since. Only the project's
   * latest 50 edits can be undone.
   */
  "project.undoEdit": { params: ServiceParams["project.undoEdit"]; result: ProjectEditResult }
  /**
   * Opens a component's docs or first story in the project's Storybook, starting it if needed. Returns the address
   * to open; without a component, Storybook's home.
   */
  "storybook.open": { params: ServiceParams["storybook.open"]; result: { url: string } }
  /** Writes a copy of the project's designs to a `.par` file anywhere, chosen by the person. */
  "document.saveCopy": { params: ServiceParams["document.saveCopy"]; result: undefined }
  /**
   * Renders designs to PNG files in a folder: each design in every state, in its main mode and the modes beside it.
   */
  "designs.export": {
    params: ServiceParams["designs.export"]
    result: { files: string[]; warnings: string[] }
  }
  /**
   * Draws layers and designs offscreen as the canvas has them and writes each file asked for to `folder` (PAR-185): a
   * PNG or JPG of the layer's box at its scale, a JPG's see-through parts filled with white. `layers` are by design key, and a layer's id when it isn't the
   * design; each file names the layer it's of by its index there.
   */
  "layers.export": {
    params: ServiceParams["layers.export"]
    result: { files: string[]; warnings: string[] }
  }
  /**
   * Draws layers and designs offscreen as the canvas has them, as `layers.export` does, and makes one PNG of them all at
   * 2x for the clipboard (PAR-190). `layers` are by design key, and a layer's id when it isn't the design; `at` is where
   * the design sits on the canvas, and `name` names the layer in a warning. No PNG when nothing could be drawn.
   */
  "layers.picture": {
    params: ServiceParams["layers.picture"]
    result: { png?: string; warnings: string[] }
  }
  /**
   * Draws one frame offscreen and captures it as a PNG, for the canvas to show in its place when zoomed far out, and
   * keeps it on disk. No PNG when the frame didn't render. `height` is the live frame's height in its own CSS pixels,
   * kept with the bitmap; without one, the offscreen frame's is kept, which can be a few pixels out (PAR-179).
   */
  /** The bitmap as a data URL, a lossless WebP as it's kept (PAR-535), and the frame's height kept with it. */
  "frames.capture": { params: ServiceParams["frames.capture"]; result: { src?: string; height?: number } }
  /**
   * The bitmaps of frames kept on disk from earlier captures of the same jobs with the same code, where there are any
   * (PAR-158), in the jobs' order. They're asked for before anything is captured, so a project opened again shows its
   * frames zoomed out at once. The frames a canvas mounts ask together, with their jobs as JSON text (`RenderJob[]`),
   * since text crosses the preload bridge and the port as one copy, where the jobs' trees as objects took about 0.14 s of
   * the window's thread (PAR-759). `height` is the frame's height as it was captured, in its own CSS pixels, which a
   * frame that hasn't drawn yet takes while it shows the bitmap (PAR-179).
   */
  /** Each job's kept bitmap and its frame's height, `stale` when it's the frame's latest from other code (PAR-993). */
  "frames.stored": {
    params: ServiceParams["frames.stored"]
    result: { kept: { src?: string; height?: number; stale?: true }[] }
  }
  /**
   * Whether each frame, and each node in it, changed since it was first looked at while its project's open (PAR-997):
   * the frames as JSON text, each by its id and the job it's drawn with, and their changes in the same order.
   */
  "frames.changes": { params: ServiceParams["frames.changes"]; result: { changes: FrameChange[] } }
  /** Removes every frame bitmap and component preview kept on disk, for View > Clear bitmap cache. */
  "frames.clearStored": { params: ServiceParams["frames.clearStored"]; result: undefined }
  /**
   * Keeps a project's picture for the start page (PAR-607), in place of the one before. Each frame is cut to the top of
   * its window and given back as it's kept.
   */
  "pictures.store": { params: ServiceParams["pictures.store"]; result: ProjectPicture }
  /** The pictures kept for these projects, by root. A project with none kept isn't in it. */
  "pictures.read": { params: ServiceParams["pictures.read"]; result: Record<string, ProjectPicture> }
  /** Lets go of the pictures of every project but these, the ones the start page still lists. */
  "pictures.keepOnly": { params: ServiceParams["pictures.keepOnly"]; result: undefined }
  /**
   * What the start page needs from this computer (PAR-188): which of these projects' folders aren't there any more, and
   * the example project's folder, when this copy of Parity has it.
   */
  "start.check": { params: ServiceParams["start.check"]; result: { missing: string[]; example?: string } }
  /**
   * What's kept of components' previews for the code their jobs draw (PAR-207): each one's key and, when it's made
   * for that key, its pictures; else the latest one made before, to show while it's made again. Nothing is drawn.
   */
  "previews.lookup": { params: ServiceParams["previews.lookup"]; result: { previews: ComponentPreview[] } }
  /**
   * Makes a component's preview in the offscreen window, behind canvas bitmaps and agents' renders, and keeps it on
   * disk. One already made for its key is given back without drawing.
   */
  "previews.make": { params: ServiceParams["previews.make"]; result: ComponentPreview }
  /**
   * Checks a design with axe-core in every state, in the modes it shows, offscreen. Automated checks find only some
   * issues, so none found isn't a pass.
   */
  "accessibility.check": {
    params: ServiceParams["accessibility.check"]
    result: { findings: AccessibilityFinding[]; frames: number; warnings: string[] }
  }
  /** Writes token values back to the project's stylesheets, taking out those without a value. */
  "tokens.save": { params: ServiceParams["tokens.save"]; result: ProjectEditResult }
  /**
   * The classes the project's styling framework writes for each declaration, by its own compiler, for frames to draw
   * layers with (PAR-942). `written` are the classes the window's frames already have, compiled again with the new
   * ones, so the window's stylesheet of classes is whole whether or not the service was started again since.
   */
  "styles.classes": {
    params: ServiceParams["styles.classes"]
    result: FrameClassesWritten
  }
  /**
   * What Parity runs for the open projects: each one's build server and the Storybook it started, the tasks running,
   * and each task's last result.
   */
  "processes.list": { params: ServiceParams["processes.list"]; result: ProjectProcess[] }
  /** Stops a server Parity started, or cancels a task. */
  "processes.stop": { params: ServiceParams["processes.stop"]; result: undefined }
  /** Starts a server again, or runs a task again. */
  "processes.restart": { params: ServiceParams["processes.restart"]; result: undefined }
  /** Forgets a process that stopped or a task that finished, so it leaves the list. */
  "processes.dismiss": { params: ServiceParams["processes.dismiss"]; result: undefined }
}

/**
 * Where a process is in its life. A server starts, runs until it's stopped, and has failed if it exits by itself. A task
 * runs once, then passes or fails, or is canceled.
 */
export type ProcessStatus = "starting" | "running" | "stopping" | "stopped" | "failed" | "passed" | "canceled"

/** What a server is: a project's build server, which the canvas renders through, or its Storybook. */
export type ServerKind = "builder" | "storybook"

/**
 * What a task does: installs packages, checks types, runs unit tests or Playwright, formats, lints, verifies the whole
 * project, builds it, exports designs, or checks a design's accessibility.
 */
export type TaskKind =
  | "install"
  | "typecheck"
  | "test"
  | "e2e"
  | "format"
  | "lint"
  | "verify"
  | "build"
  | "export"
  | "accessibility"

/** A process Parity runs for an open project, as the status bar lists it: a server, or a task. */
export interface ProjectProcess {
  id: string
  kind: ServerKind | TaskKind
  /** A server runs until it's stopped; a task runs once and finishes with a result. */
  lifetime: "server" | "task"
  name: string
  /** The open project it runs for. */
  projectId: string
  /** That project's name. */
  project: string
  status: ProcessStatus
  /** When it started, in milliseconds since 1970. */
  startedAt: number
  /** When it stopped or finished, once it has. */
  stoppedAt?: number
  pid?: number
  /** A server's local address, as `http://localhost:6006`. */
  url?: string
  /** A server's Portless address, as `https://storybook.shop.localhost`, when Portless routes to it. */
  domain?: string
  /** Parity started it, or it was already running when Parity needed it, as a Storybook on its usual port. */
  startedBy: "parity" | "elsewhere"
  /** Whether it can be stopped: a server stopped, or a task canceled. */
  canStop: boolean
  /** Whether it can start again: a server restarted, or a task run again. */
  canRestart: boolean
  /** What a running task is doing, as "Checking 34 component files". */
  detail?: string
  /** How far a running task has got, when it knows. */
  progress?: { done: number; total: number }
  /** What a finished task found, as "3 errors in 2 files". */
  summary?: string
  /** Why it failed: a server that exited by itself, or a task's error in full. */
  error?: string
}

/**
 * Requests the project service sends to the editor window. Agents work through the window because it holds the live
 * state: unsaved edits, the selection, and what's on screen.
 */
export interface WindowMethods {
  "agent.tabs": { params: undefined; result: TabSummary[] }
  /** The window's tabs and when it last had focus, which agents' calls are routed by (PAR-514). */
  "agent.copy": { params: undefined; result: CopyReport<TabSummary> }
  /** A tab's live state, by the tab an agent's call names, as its schema in `contracts.ts` read it (PAR-598). */
  "agent.snapshot": { params: Pick<AgentMethods["state"]["params"], "tab">; result: TabSnapshot }
  /** Where a tab's edits stand: applied, undoable and saved. Reading it changes nothing. */
  "agent.status": { params: AgentMethods["status"]["params"]; result: TabStatus }
  /**
   * Merges an agent's changes in as one undoable step, or, when any overlaps what changed in the editor since the
   * agent's snapshot, applies nothing and gives back the conflicts.
   */
  "agent.apply": { params: AgentChanges; result: ChangeConflict[] }
  "agent.presence": { params: PresenceEvent[]; result: undefined }
  "agent.open": { params: AgentMethods["open"]["params"]; result: TabSummary }
  /** An icon set's names in one style's module, from the tab's own copy of the set, for `Icons(set)`. */
  "agent.iconNames": { params: { tab: string; set: string; module?: string }; result: IconNames }
  /** Whether the browser takes each value for its CSS property, for checking an agent's `SetTokens` (PAR-584). */
  "agent.supports": { params: { property: string; value: string }[]; result: boolean[] }
  /** The window's replay, sent so far, and trace, which an agent's report is tied to (PAR-646). */
  "agent.reportIds": { params: undefined; result: { replayId?: string; traceId?: string } }
  /** A project file changed on disk, not by this window. */
  "project.fileChanged": { params: { projectId: string; path: string; document: CanvasDocument }; result: undefined }
  /**
   * Props inferred again after a component's source changed, and with `sources`, the project's components once the type
   * checker has read them.
   */
  "project.componentsChanged": {
    params: {
      projectId: string
      components: Record<string, ComponentInfo>
      sources?: Record<string, ComponentSource>
      /** The exports the type checker left out, with why. */
      leftOut?: LeftOutExport[]
    }
    result: undefined
  }
  /** A project's builder, started again, couldn't have its port back, so the project's guest is at a new address. */
  "project.guestMoved": { params: { projectId: string; guestUrl: string }; result: undefined }
  /** Component files whose code changed on disk, which the tab's guest loads again (PAR-165). */
  "project.codeChanged": { params: { projectId: string } & CodeChange; result: undefined }
  /** What detection reads of the project changed since it opened, so its tab opens it again (PAR-820). */
  "project.detectionChanged": { params: { projectId: string }; result: undefined }
  /**
   * The project's git repository moved its last commit or changed what's staged, as a commit or a checkout does, so the
   * canvas asks again what changed since the commit (PAR-1074).
   */
  "project.committed": { params: { projectId: string }; result: undefined }
}

/**
 * An answer as data, across the bridge between the page and the preload script: a failure thrown across it keeps only
 * its message, so a coded error's details go beside it, for the other side to check (PAR-580).
 */
export type Answer<Result> = { result: Result } | { error: string; details?: unknown }

/** A window's answer to the service. */
export type ServeAnswer = Answer<unknown>

export type ServiceMethod = keyof ServiceMethods

export type WindowMethod = keyof WindowMethods

/** What the service sends with any of the window's methods. */
export type WindowParams = WindowMethods[WindowMethod]["params"]

/** The window's methods by name, for the preload script, which answers each through the page's one handler. */
// SAFETY: `satisfies` checks the object has exactly one key for each window method, so its keys are those methods.
export const windowMethods = Object.keys({
  "agent.tabs": true,
  "agent.copy": true,
  "agent.snapshot": true,
  "agent.status": true,
  "agent.apply": true,
  "agent.presence": true,
  "agent.open": true,
  "agent.iconNames": true,
  "agent.supports": true,
  "agent.reportIds": true,
  "project.fileChanged": true,
  "project.componentsChanged": true,
  "project.guestMoved": true,
  "project.codeChanged": true,
  "project.detectionChanged": true,
  "project.committed": true
} satisfies Record<WindowMethod, true>) as WindowMethod[]

export type { ProjectInfo }

export type { PictureFrame, PictureScreen, PreviewJob, ProjectPicture, RenderJob } from "./service-params.ts"

/**
 * Where a tab's edits stand (see `editStatus` in `@parity-app/editor`), with the revision as the agent API gives it:
 * opaque, and equal only while nothing has changed in this tab since it opened.
 */
export type TabStatus = Omit<EditStatus, "revision"> & {
  tab: TabSummary
  revision: string
  /** Whether each change saves itself a moment later; otherwise changes wait for the person to save. */
  autosave: boolean
}

/** An agent's call to apply in a tab: the designs it changed with how it found them, its modes and token values. */
export interface AgentChanges {
  tab: string
  label: string
  designs: DesignChange[]
  modes?: ModesChange
  tokens?: TokenChange[]
  /** The references the call placed (PAR-840), which are only ever added. */
  references?: ReferenceAdded[]
}

/** Installed release identity, independent of the user's update channel preference. */
export interface BuildInfo {
  version: string
  channel: "beta" | "stable" | "development" | "unknown"
}

/**
 * What Parity sends Sentry this run, the level saved in Settings, the variable overriding it if one is set, and the
 * install ID Sentry groups this computer's reports by (PAR-626).
 */
export interface TelemetryState extends ResolvedTelemetry {
  installId: string
}

/** The last run's crash, which the window offers to report as it starts (PAR-635). */
export interface ReportCrash {
  /** When it stopped, as near as the local copy says, in ISO 8601. */
  time: string
}

/** What Help > Report a problem sends main: what happened, and the IDs that tie it to the replay and trace. */
export interface ProblemReportRequest {
  message: string
  screenshot: boolean
  afterCrash: boolean
  replayId?: string
  traceId?: string
  /** The Sentry event of the error a part of the window caught, when the report is sent from its fallback (PAR-704). */
  eventId?: string
}

/** Exposed on `window.canvasHost` by the preload script. */
/** A file copied in Explorer or Finder, with its bytes unless it's too large for any type Parity takes. */
/** Where Help > Install the Parity CLI put it (PAR-906). */
export interface CliInstall {
  folder: string
  /** Whether a terminal finds the folder on PATH; on Linux, `~/.local/bin` is only there when the person's shell adds it. */
  onPath: boolean
  /** Whether the folder just joined PATH, which terminals already open don't see. */
  newTerminal: boolean
}

export interface CopiedFile {
  name: string
  /** In bytes. */
  size: number
  data?: Uint8Array
}

export interface CanvasHost {
  appVersion: string
  getBuildInfo: () => Promise<BuildInfo>
  /** The Telemetry setting and install ID, which main keeps and applies (PAR-626). */
  telemetry: {
    get: () => Promise<TelemetryState>
    setLevel: (level: TelemetryLevel) => Promise<TelemetryState>
  }
  /** Help > Report a problem, which main sends to Sentry (PAR-635). */
  report: {
    /** Takes the window's screenshot, as a PNG data URL, before the dialog shows. */
    prepare: () => Promise<{ screenshot?: string }>
    /** Sends the report and gives its feedback ID. */
    send: (report: ProblemReportRequest) => Promise<string>
    /** The last run's crash, once, if it crashed. */
    lastCrash: () => Promise<ReportCrash | undefined>
  }
  updates: {
    get: () => Promise<UpdateState>
    check: () => Promise<void>
    setBeta: (beta: boolean) => Promise<void>
    act: () => Promise<void>
    subscribe: (listener: (state: UpdateState) => void) => () => void
    onShow: (listener: () => void) => () => void
  }
  /**
   * Signing in, which main does (PAR-612). What main says is unchecked here: the window checks it against
   * `accountState` in `shared/account.ts` as it arrives.
   */
  account: {
    // oxlint-disable-next-line anti-slop/no-unknown-returns -- account state as main sends it, which the window checks as it arrives
    get: () => Promise<unknown>
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- account state as main sends it, which the window checks as it arrives
    subscribe: (listener: (state: unknown) => void) => () => void
    signIn: (request: SignInRequest) => Promise<void>
    /** Opens the waiting sign-in's page in the browser again. */
    reopen: () => Promise<void>
    /** Stops waiting, and puts away what went wrong or the session that ended. */
    cancel: () => Promise<void>
    /** Signs out of one account, by its email, or forgets one whose session ended. */
    signOut: (email: string) => Promise<void>
    /** Moves the account you're in to another organization the person is in, refreshing in the background. */
    switchOrganization: (organizationId: string) => Promise<void>
    /** Switches to another account signed in, by its email, at once: each keeps its own session. */
    use: (email: string) => Promise<void>
  }
  /**
   * Connectors to outside services, such as Mobbin (PAR-829). Main holds their keys, which the app's owner arranges,
   * and runs every search; the window sees whether this copy can search each one, never a key.
   */
  connectors: {
    get: () => Promise<ConnectorState[]>
    /** Never fails: a failure is a problem in the answer. A search that works joins the person's recent searches. */
    search: (search: ConnectorSearch) => Promise<SearchAnswer>
    /** The person's recent searches, newest first. */
    recent: () => Promise<RecentSearch[]>
    /**
     * Says the person placed a result in a design. Main records it the first time it goes into that design, counts it
     * as the source's usage, and tells the source if its terms ask. Call it whenever one is placed; it never fails.
     */
    placed: (placed: ConnectorPlaced) => Promise<void>
  }
  /** The dev runner's requested project; an installed app otherwise starts with its recent tabs or the welcome page. */
  initialProject?: string
  /**
   * Whether this copy needs someone signed in before anything else (PAR-1008). Main always says so; Storybook's host
   * doesn't, so stories show what they're given.
   */
  signInRequired?: boolean
  /**
   * Asks the project service, and never fails: a failure is an answer, with its details. The page asks through
   * `request` in `renderer/service.ts`, which throws it as a `CodedError` again. `trace` is the action or gesture it's
   * asked in, as `sentry-trace` and `baggage` (PAR-629).
   */
  ask<M extends ServiceMethod>(
    method: M,
    params: ServiceMethods[M]["params"],
    trace?: TraceHeaders
  ): Promise<Answer<ServiceMethods[M]["result"]>>
  /** Answers the service's requests. One handler per window. */
  serve(handler: (method: WindowMethod, params: WindowParams) => Promise<ServeAnswer>): void
  /**
   * Runs when the window is connected to a fresh project service, after the old one was restarted: its projects need
   * opening again. Requests the old service hadn't answered fail.
   */
  onReconnect(listener: () => void): void
  /** A folder from the system's picker: a project to open by default, or wherever the title says. */
  pickFolder(title?: string): Promise<string | undefined>
  pickProjectFile(): Promise<string | undefined>
  saveFile(options: SaveDialogOptions): Promise<string | undefined>
  /** Shows a file in the system's file manager. */
  showItem(path: string): Promise<void>
  /** The file copied in Explorer or Finder, for pasting it; none when no file is copied. */
  copiedFiles(): Promise<CopiedFile[]>
  /** Opens a file in the person's editor, at its export's line when one is named, and says which opened it. */
  openInEditor(request: OpenInEditorRequest): Promise<{ opened: string }>
  /** Puts a `parity` command on PATH that runs the CLI shipped with the app, and says where. */
  installCli(): Promise<CliInstall>
  quit(): Promise<void>
  /** Opens the window's developer tools, or closes them. */
  toggleDevTools(): Promise<void>
  /** The app's theme, so the window's title bar buttons and system dialogs match it. */
  setTheme(theme: ThemeSource): Promise<void>
  /**
   * Runs when the window is asked to close, which waits for it: true closes it, false keeps it open, as when the
   * person cancels on being asked about unsaved changes.
   */
  onClosing(listener: () => Promise<boolean>): void
  /** CPU and memory for each of the app's processes, for the performance stats. */
  metrics(): Promise<ProcessUsage[]>
  /** The log of what projects' code writes to the console, which agents read with `parity console` (PAR-147). */
  console: ConsoleHost
}

/**
 * The design a console message was written for, with the state and mode it was drawn in (PAR-147). On the canvas it
 * also says where the frame's code made the call, since the console then reports the window's wrapper as the source.
 */
export type ConsoleContext = Pick<ConsoleEntry, "design" | "state" | "mode"> &
  Partial<Pick<ConsoleEntry, "source" | "line">>

/** A message the main process keeps, with the id windows know it by while its count grows. */
export type LoggedEntry = ConsoleEntry & { id: number }

/** What changed in the log: messages kept or counted again, or a project's cleared, by its builder's origin. */
export type ConsoleChange = { entries: LoggedEntry[] } | { cleared: string }

/** The console log as the window reaches it. */
export interface ConsoleHost {
  /** Says which frame the console message about to be written comes from, at that level. */
  announce(level: ConsoleEntry["level"], context: ConsoleContext & { design: string }): void
  /** What a project's builder, by its origin, has had written so far, oldest first. */
  read(origin: string): Promise<LoggedEntry[]>
  /** Forgets it, for agents and every window. */
  clear(origin: string): Promise<void>
  subscribe(listener: (change: ConsoleChange) => void): () => void
}

/** One of the app's processes, as the performance stats show it. */
export interface ProcessUsage {
  /**
   * What it does: the app itself, this window or another, the offscreen renderer agents use, the project service, an
   * open project's builder, which runs its build tool in a process of its own, the GPU, or one of Electron's helpers.
   */
  role: "app" | "this-window" | "window" | "offscreen" | "service" | "builder" | "gpu" | "helper"
  name: string
  pid: number
  /** Share of the whole computer's CPU since the last reading, from 0 to 100. */
  cpu: number
  /** Memory in use, in bytes. */
  memory: number
}

/** A file to open in the person's editor (PAR-527). */
export type OpenInEditorRequest = z.infer<typeof openInEditorRequest>

export type SaveDialogOptions = z.infer<typeof saveDialogOptions>

/** A preview's pictures, which the window shows as plain images from `parity-preview:` addresses. */
export interface PreviewImage {
  /** At most 240 by 152 pixels, for list rows, grid tiles and the picker. */
  thumb: string
  /** At most 608 by 352 pixels, for the card. */
  large: string
  /** The large picture's size, in pixels; the thumbnail has its shape. */
  width: number
  height: number
}

/** What's kept of a component's preview for its code as it's drawn now. */
export interface ComponentPreview {
  component: string
  /** Its name on disk, from what's drawn and the files it depends on (`previewKey`). */
  key: string
  /** Made for this key; else not yet, or it failed. */
  image?: PreviewImage
  /** Why it couldn't be drawn for this key. */
  error?: string
  /** It drew for this key, but nothing to see: its picture showed only the page (PAR-517). */
  empty?: true
  /** The latest made before, for older code, to show dimmed until this key's is made. */
  last?: PreviewImage
}

export type { ConsoleEntry, MeasuredNode, PresenceEvent, TabSnapshot, TabSummary }

export interface RenderedFrame {
  width: number
  height: number
  /**
   * For a frame drawn smaller, as for a bitmap, and growing with its content: its height as the canvas lays it out at
   * full size, which the bitmap keeps (PAR-525).
   */
  canvasHeight?: number
  nodes: MeasuredNode[]
  overflowsX: boolean
  unknownComponents: string[]
  /**
   * Content drawn outside the frame, in Parity's page, where the project's styles don't reach, each described in a few
   * words: what a component portaled to the page's body without React, which the guest can't take into the frame
   * (PAR-881).
   */
  outside?: string[]
  error?: string
  /** The stack of the first error `error` gives, when it had one, for telemetry (PAR-638). */
  errorStack?: string
  issues?: AccessibilityIssue[]
  contrast?: FrameContrast
}
