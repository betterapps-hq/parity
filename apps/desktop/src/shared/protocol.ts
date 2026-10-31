import type { AccessibilityFinding, AccessibilityIssue, AgentEvent, IconNames, IconSet } from "@parity-app/agent"
import type {
  CanvasDocument,
  ComponentInfo,
  ComponentRenderStatus,
  ComponentSource,
  DescribedTokens,
  DetectionCorrections,
  FrameViewport,
  LeftOutExport,
  LibraryInfo,
  ModeSettings,
  ProjectDetection,
  StorybookInfo,
  ThemeVariable,
  UpdateState
} from "@parity-app/core"
import type { Token, TokenChange } from "@parity-app/tokens"

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
   * Draws one frame offscreen and captures it as a PNG, for the canvas to show in its place when zoomed far out. No
   * PNG when the frame didn't render.
   */
  "frames.capture": { params: { job: RenderJob }; result: { png?: string } }
  /**
   * Checks a design with axe-core in every state, in the modes it shows, offscreen. Automated checks find only some
   * issues, so none found isn't a pass.
   */
  "accessibility.check": {
    params: { projectId: string; design: string }
    result: { findings: AccessibilityFinding[]; frames: number; warnings: string[] }
  }
  /** Writes token values back to the project's stylesheets. */
  "tokens.save": { params: { projectId: string; changes: TokenChange[] }; result: ProjectEditResult }
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
  "agent.snapshot": { params: { tab?: string }; result: TabSnapshot }
  /** Applies an agent's changes as one undoable step. */
  "agent.apply": { params: AgentChanges; result: undefined }
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

export type ServiceMethod = keyof ServiceMethods
export type WindowMethod = keyof WindowMethods

/** Messages on a window's channel to the service. Either side can make requests. */
export type ChannelMessage =
  | { type: "request"; id: number; method: string; params?: unknown }
  | { type: "response"; id: number; result?: unknown; error?: string }

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
export interface TabSnapshot {
  tab: TabSummary
  projectId: string
  guestUrl: string
  components: string[]
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

export interface AgentChanges {
  tab: string
  label: string
  documents: { path: string; document: CanvasDocument }[]
  /** Files the agent emptied of designs. */
  removed?: string[]
  modes?: ModeSettings
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

/** Exposed on `window.canvasHost` by the preload script. */
export interface CanvasHost {
  appVersion: string
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
  request<M extends ServiceMethod>(method: M, params: ServiceMethods[M]["params"]): Promise<ServiceMethods[M]["result"]>
  /** Answers the service's requests. One handler per window. */
  serve(handler: (method: WindowMethod, params: unknown) => Promise<unknown>): void
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
  /** Token changes the canvas previews but the project's compiled CSS may not have yet, applied in order. */
  previews?: TokenChange[]
}

export interface RenderedFrame {
  width: number
  height: number
  nodes: MeasuredNode[]
  overflowsX: boolean
  unknownComponents: string[]
  error?: string
  issues?: AccessibilityIssue[]
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

export interface MeasuredNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  /** True when part of the node is cut off by an ancestor that clips. */
  clipped?: boolean
}
