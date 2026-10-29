import type { AccessibilityFinding, AccessibilityIssue, AgentEvent } from "@parity/agent"
import type {
  CanvasDocument,
  ComponentInfo,
  ComponentSource,
  DescribedTokens,
  LibraryInfo,
  ModeSettings,
  ProjectDetection,
  StorybookInfo,
  ThemeVariable,
  Token
} from "@parity/core"

/** Requests a canvas window sends to the project service, by method name. */
export interface ServiceMethods {
  /** Opens a project, or returns it if it's already open. Without a root, opens the default project. */
  "project.open": { params: { root?: string }; result: ProjectInfo }
  "project.close": { params: { projectId: string }; result: undefined }
  /** The project's components and their props, once inferred from source. */
  "project.components": { params: { projectId: string }; result: Record<string, ComponentInfo> }
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
  "library.add": { params: { projectId: string; library: string }; result: { log: string } }
  /** Imports an installed library's styles into the project's stylesheet. */
  "library.importStyles": { params: { projectId: string; library: string }; result: undefined }
  "document.save": { params: { projectId: string; path: string; document: CanvasDocument }; result: undefined }
  /**
   * Saves an image pasted onto the canvas into the project's public folder, where the dev server serves it. `data` is
   * the file, base64 encoded; `type` its media type.
   */
  "images.import": {
    params: { projectId: string; name: string; type: string; data: string }
    result: { src: string; path: string }
  }
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
   * Checks a design with axe-core in every state, in the modes it shows, offscreen. Automated checks find only some
   * issues, so none found isn't a pass.
   */
  "accessibility.check": {
    params: { projectId: string; design: string }
    result: { findings: AccessibilityFinding[]; frames: number; warnings: string[] }
  }
  /** Writes token values back to the project's stylesheets. */
  "tokens.save": { params: { projectId: string; changes: TokenChange[] }; result: { files: string[] } }
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
    }
    result: undefined
  }
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

/** A new value for a token in one theme: `default` for the root, otherwise the theme class (e.g. `dark`). */
export interface TokenChange {
  name: string
  theme: string
  value: string
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
  iconLibraries: string[]
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
   * What it does: the app itself, this window or another, the offscreen renderer agents use, the project service that
   * runs the project's build tool, the GPU, or one of Electron's helpers.
   */
  role: "app" | "this-window" | "window" | "offscreen" | "service" | "gpu" | "helper"
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
  guestUrl: string
  theme: ThemeVariable[]
  tree: unknown
  mode: {
    width: number
    height?: number
    classNames: string[]
    attributes: Record<string, string>
    /** The mode's options by variable, for decorators. */
    globals?: Record<string, string>
  }
  scale: number
  /** Also check the frame with axe-core. */
  audit?: boolean
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
