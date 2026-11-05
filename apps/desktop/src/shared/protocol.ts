import type {
  AccessibilityFinding,
  AccessibilityIssue,
  AgentEvent,
  FrameContrast,
  IconNames,
  IconSet,
  MeasuredNode
} from "@parity-app/agent"
import type { CopyReport } from "@parity-app/agent/routing"
import type {
  CanvasDocument,
  CodeEditorChoice,
  ChangeConflict,
  ComponentInfo,
  ComponentRenderStatus,
  ComponentSource,
  ContainerSpec,
  DescribedTokens,
  DesignChange,
  DetectionCorrections,
  FrameViewport,
  LeftOutExport,
  LibraryInfo,
  ModeSettings,
  ModesChange,
  ProjectDetection,
  StorybookInfo,
  ThemeVariable,
  UpdateState
} from "@parity-app/core"
import type { EditStatus } from "@parity-app/editor"
import type { Token, TokenChange, TokenWrite } from "@parity-app/tokens"

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
  "project.open": { params: { root?: string }; result: ProjectInfo }
  "project.close": { params: { projectId: string }; result: undefined }
  /** The project's components and their props, once inferred from source. */
  "project.components": { params: { projectId: string }; result: Record<string, ComponentInfo> }
  /**
   * The person's corrections to which exports are components, whenever the main project file's change: the component
   * list follows them, though they're saved only when the file is.
   */
  "project.correctComponents": { params: { projectId: string; corrections?: DetectionCorrections }; result: undefined }
  /** Libraries that can be added, and the ones the project has. */
  "library.catalog": {
    params: { projectId: string }
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
  "library.add": { params: { projectId: string; library: string }; result: { log: string; edit?: ProjectEditResult } }
  /** Imports an installed library's styles into the project's stylesheet; nothing to do when it imports them already. */
  "library.importStyles": { params: { projectId: string; library: string }; result: ProjectEditResult | undefined }
  "document.save": { params: { projectId: string; path: string; document: CanvasDocument }; result: undefined }
  /**
   * Saves an image pasted onto the canvas into the project's public folder, where the dev server serves it. `data` is
   * the file, base64 encoded; `type` its media type. No edit when the same image was saved before.
   */
  "images.import": {
    params: { projectId: string; name: string; type: string; data: string }
    result: { src: string; path: string; edit?: ProjectEditResult }
  }
  /**
   * Takes back an edit the service made to the project's files, unless a file has changed since. Only the project's
   * latest 50 edits can be undone.
   */
  "project.undoEdit": { params: { projectId: string; id: string }; result: ProjectEditResult }
  /**
   * Opens a component's docs or first story in the project's Storybook, starting it if needed. Returns the address
   * to open; without a component, Storybook's home.
   */
  "storybook.open": { params: { projectId: string; component?: string }; result: { url: string } }
  /** Writes a copy of the project's designs to a `.par` file anywhere, chosen by the person. */
  "document.saveCopy": { params: { path: string; document: CanvasDocument }; result: undefined }
  /**
   * Renders designs to PNG files in a folder: each design in every state, in its main mode and the modes beside it.
   */
  "designs.export": {
    params: { projectId: string; folder: string; designs: string[]; scale: number }
    result: { files: string[]; warnings: string[] }
  }
  /**
   * Draws one frame offscreen and captures it as a PNG, for the canvas to show in its place when zoomed far out, and
   * keeps it on disk. No PNG when the frame didn't render. `height` is the live frame's height in its own CSS pixels,
   * kept with the bitmap; without one, the offscreen frame's is kept, which can be a few pixels out (PAR-179).
   */
  /** The bitmap as a data URL, a lossless WebP as it's kept (PAR-535), and the frame's height kept with it. */
  "frames.capture": { params: { job: RenderJob; height?: number }; result: { src?: string; height?: number } }
  /**
   * The bitmap of a frame kept on disk from an earlier capture of the same job with the same code, if there is one
   * (PAR-158). It's asked for before anything is captured, so a project opened again shows its frames zoomed out at once.
   * `height` is the frame's height as it was captured, in its own CSS pixels, which a frame that hasn't drawn yet takes
   * while it shows the bitmap (PAR-179).
   */
  "frames.stored": { params: { job: RenderJob }; result: { src?: string; height?: number } }
  /** Removes every frame bitmap and component preview kept on disk, for View > Clear bitmap cache. */
  "frames.clearStored": { params: undefined; result: undefined }
  /**
   * Keeps a project's picture for the start page (PAR-607), in place of the one before. Each frame is cut to the top of
   * its window and given back as it's kept.
   */
  "pictures.store": { params: { root: string; picture: ProjectPicture }; result: ProjectPicture }
  /** The pictures kept for these projects, by root. A project with none kept isn't in it. */
  "pictures.read": { params: { roots: string[] }; result: Record<string, ProjectPicture> }
  /** Lets go of the pictures of every project but these, the ones the start page still lists. */
  "pictures.keepOnly": { params: { roots: string[] }; result: undefined }
  /**
   * What's kept of components' previews for the code their jobs draw (PAR-207): each one's key and, when it's made
   * for that key, its pictures; else the latest one made before, to show while it's made again. Nothing is drawn.
   */
  "previews.lookup": { params: { previews: PreviewJob[] }; result: { previews: ComponentPreview[] } }
  /**
   * Makes a component's preview in the offscreen window, behind canvas bitmaps and agents' renders, and keeps it on
   * disk. One already made for its key is given back without drawing.
   */
  "previews.make": { params: { preview: PreviewJob; priority: "visible" | "idle" }; result: ComponentPreview }
  /**
   * Checks a design with axe-core in every state, in the modes it shows, offscreen. Automated checks find only some
   * issues, so none found isn't a pass.
   */
  "accessibility.check": {
    params: { projectId: string; design: string }
    result: { findings: AccessibilityFinding[]; frames: number; warnings: string[] }
  }
  /** Writes token values back to the project's stylesheets, taking out those without a value. */
  "tokens.save": { params: { projectId: string; changes: TokenWrite[] }; result: ProjectEditResult }
  /**
   * What Parity runs for the open projects: each one's build server and the Storybook it started, the tasks running,
   * and each task's last result.
   */
  "processes.list": { params: Record<string, never>; result: ProjectProcess[] }
  /** Stops a server Parity started, or cancels a task. */
  "processes.stop": { params: { id: string }; result: undefined }
  /** Starts a server again, or runs a task again. */
  "processes.restart": { params: { id: string }; result: undefined }
  /** Forgets a process that stopped or a task that finished, so it leaves the list. */
  "processes.dismiss": { params: { id: string }; result: undefined }
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
  shape: "server" | "task"
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
  "agent.snapshot": { params: { tab?: string }; result: TabSnapshot }
  /** Where a tab's edits stand: applied, undoable and saved. Reading it changes nothing. */
  "agent.status": { params: { tab?: string; summary?: boolean; limit?: number }; result: TabStatus }
  /**
   * Merges an agent's changes in as one undoable step, or, when any overlaps what changed in the editor since the
   * agent's snapshot, applies nothing and gives back the conflicts.
   */
  "agent.apply": { params: AgentChanges; result: ChangeConflict[] }
  "agent.presence": { params: PresenceEvent[]; result: undefined }
  "agent.open": { params: { root: string }; result: TabSummary }
  /** An icon set's names in one style's module, from the tab's own copy of the set, for `Icons(set)`. */
  "agent.iconNames": { params: { tab: string; set: string; module?: string }; result: IconNames }
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

/** The window's methods by name, for the preload script, which answers each through the page's one handler. */
export const windowMethods = Object.keys({
  "agent.tabs": true,
  "agent.copy": true,
  "agent.snapshot": true,
  "agent.status": true,
  "agent.apply": true,
  "agent.presence": true,
  "agent.open": true,
  "agent.iconNames": true,
  "project.fileChanged": true,
  "project.componentsChanged": true,
  "project.guestMoved": true
} satisfies Record<WindowMethod, true>) as WindowMethod[]

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

/** A design file, or the reason it couldn't be read. */
export interface DocumentEntry {
  path: string
  document?: CanvasDocument
  error?: string
}

export interface TabSummary {
  id: string
  name: string
  root: string
  active: boolean
  status: "loading" | "ready" | "error"
  error?: string
  designs: number
}

/** Everything an agent reads from a tab before it works on it. */
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

export interface TabSnapshot {
  tab: TabSummary
  /** The tab's revision (see `TabStatus`), which changes with every change to its designs, modes or token edits. */
  revision: string
  projectId: string
  guestUrl: string
  components: string[]
  /** Where each component comes from, with the parents and sample a library part is inserted with. */
  sources: Record<string, ComponentSource>
  /** Components the type checker found after the guest loaded, which other pages' guests have to add themselves. */
  addedComponents?: Record<string, Pick<ComponentSource, "path" | "export">>
  /** The app's exports the type checker left out, with why. */
  leftOut?: LeftOutExport[]
  /** How each component drawn so far fares on the canvas: drawn, or failing with what it threw. */
  renderStatus?: Record<string, ComponentRenderStatus>
  /** The project's icon sets, without the tags their icons are searched by, which `agent.iconNames` reads. */
  iconSets: IconSet[]
  tokens: Token[]
  theme: ThemeVariable[]
  modes: ModeSettings
  documents: { path: string; document: CanvasDocument }[]
  /** The component designs the project's libraries bring, which instances place as the canvas's do. */
  libraryDesigns: ContainerSpec[]
  /** Every token value the canvas's unsaved edits leave different from the compiled CSS, which frames lay over it. */
  tokenOverrides: TokenChange[]
  mainDocument: string
  props: Record<string, ComponentInfo>
  selection: { design?: string; node?: string; mode?: string }
  /** The part of the canvas the person is looking at. */
  viewport: { x: number; y: number; width: number; height: number; zoom: number }
  /** Each design's board on the canvas, by design key. */
  bounds: Record<string, { x: number; y: number; width: number; height: number }>
  /** What detection found in the project, and where. */
  detection: ProjectDetection
}

/** An agent's call to apply in a tab: the designs it changed with how it found them, its modes and token values. */
export interface AgentChanges {
  tab: string
  label: string
  designs: DesignChange[]
  modes?: ModesChange
  tokens?: TokenChange[]
}

/** What an agent touched, so the editor can show it working. */
export interface PresenceEvent {
  tab: string
  /** What the agent is doing: the cursor's badge shows an icon for it, and its look depends on it. */
  kind: AgentEvent["kind"]
  /** Who is calling, such as "Claude Code" or "Cursor", named on the cursor. */
  agent?: string
  /** Tells agents with the same name apart, each with its own cursor. */
  agentId?: string
  /** The call's label, shown while it runs. */
  label?: string
  design?: string
  node?: string
  state?: string
  mode?: string
  error?: string
  /** Where a moved design's board was and where it goes, on the canvas. */
  from?: { x: number; y: number }
  to?: { x: number; y: number }
}

/** Installed release identity, independent of the user's update channel preference. */
export interface BuildInfo {
  version: string
  channel: "beta" | "stable" | "development" | "unknown"
}

/** Exposed on `window.canvasHost` by the preload script. */
export interface CanvasHost {
  appVersion: string
  getBuildInfo: () => Promise<BuildInfo>
  updates: {
    get: () => Promise<UpdateState>
    check: () => Promise<void>
    setBeta: (beta: boolean) => Promise<void>
    act: () => Promise<void>
    subscribe: (listener: (state: UpdateState) => void) => () => void
    onShow: (listener: () => void) => () => void
  }
  /** The dev runner's requested project; an installed app otherwise starts with its recent tabs or the welcome page. */
  initialProject?: string
  /**
   * Asks the project service, and never fails: a failure is an answer, with its details. The page asks through
   * `request` in `renderer/service.ts`, which throws it as a `CodedError` again.
   */
  ask<M extends ServiceMethod>(
    method: M,
    params: ServiceMethods[M]["params"]
  ): Promise<Answer<ServiceMethods[M]["result"]>>
  /** Answers the service's requests. One handler per window. */
  serve(handler: (method: WindowMethod, params: unknown) => Promise<ServeAnswer>): void
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
  /** Opens a file in the person's editor, at its export's line when one is named, and says which opened it. */
  openInEditor(request: OpenInEditorRequest): Promise<{ opened: string }>
  quit(): Promise<void>
  /** Opens the window's developer tools, or closes them. */
  toggleDevTools(): Promise<void>
  /** The app's theme, so the window's title bar buttons and system dialogs match it. */
  setTheme(theme: "light" | "dark" | "system"): Promise<void>
  /**
   * Runs when the window is asked to close, which waits for it: true closes it, false keeps it open, as when the
   * person cancels on being asked about unsaved changes.
   */
  onClosing(listener: () => Promise<boolean>): void
  /** CPU and memory for each of the app's processes, for the performance stats. */
  metrics(): Promise<ProcessUsage[]>
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
export interface OpenInEditorRequest {
  /** Its absolute path. */
  file: string
  /** The export to open it at, as a component's source names it. */
  export?: string
  /** What Settings says to open it with. */
  editor: CodeEditorChoice
}

export interface SaveDialogOptions {
  title: string
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
}

/** A frame the offscreen render window draws, to measure it or capture it. */
export interface RenderJob {
  /** The project drawn, so the render window lets go of its last guest when the project's moves to a new address. */
  projectId: string
  guestUrl: string
  /** Components the guest adds before drawing, since the type checker found them after it loaded. */
  components?: Record<string, Pick<ComponentSource, "path" | "export">>
  theme: ThemeVariable[]
  tree: unknown
  /**
   * The frame and the window it stands for, as core's `frameGeometry` gives them, so the offscreen frame matches the
   * live one. `height` is the frame's own fixed height, which clips it; without one the frame is as tall as its content.
   * `viewport` is the browser window, which viewport units and the project's window size checks measure, and which
   * keeps its height when the frame grows past it.
   */
  mode: {
    width: number
    height?: number
    viewport: FrameViewport
    classNames: string[]
    attributes: Record<string, string>
    /** The mode's options by variable, for decorators. */
    globals?: Record<string, string>
  }
  scale: number
  /** Also check the frame with axe-core. */
  audit?: boolean
  /** When auditing, the color tokens to read the values of in the frame, for contrast fixes. */
  colorTokens?: string[]
  /**
   * Draw what the frame's components portal out of it (a dialog, a popover's popup, a menu) inside it, in the flow after
   * the rest, as a component preview does (PAR-517).
   */
  inlinePortals?: true
  /**
   * Every token value that differs from the project's compiled CSS, such as unsaved edits: the complete set, not
   * changes. Each frame starts from the compiled stylesheet and lays these over it, so no frame inherits another's.
   */
  previews?: TokenChange[]
}

/** A component's preview to look up or make: the job that draws it, as inserting it would place it. */
export interface PreviewJob {
  component: string
  job: RenderJob
}

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

/** One frame in a project's picture: its bitmap, and its mode as the board's caption names it. */
export interface PictureFrame {
  /** The bitmap as a data URL: a WebP, or a PNG where the service couldn't encode one. */
  src: string
  /** The mode's name, such as Mobile. */
  mode: string
  /** The frame's width and its window's height, in its own CSS pixels: the picture shows the top of the frame. */
  width: number
  height: number
}

/** A screen in a project's picture: its main frame, and the phone frame beside it where its board shows one. */
export interface PictureScreen {
  name: string
  main: PictureFrame
  phone?: PictureFrame
}

/**
 * A project's picture for the start page (PAR-607): its first few screens as the canvas last drew them once saved, so a
 * card can show the first and flip through the rest.
 */
export interface ProjectPicture {
  /** When it was taken, in milliseconds since 1970. */
  taken: number
  screens: PictureScreen[]
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

export type { MeasuredNode }

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
  error?: string
  issues?: AccessibilityIssue[]
  contrast?: FrameContrast
}

/** A message the project's own code wrote to the console. The same message several times in a row is one entry. */
export interface ConsoleEntry {
  level: "info" | "warning" | "error" | "debug"
  text: string
  /** The script that wrote it, and the line. */
  source: string
  line: number
  /** On the person's canvas, or in the hidden window agents render in. */
  where: "canvas" | "offscreen"
  count: number
  /** When it was first and last written, in milliseconds since 1970. */
  first: number
  last: number
}
