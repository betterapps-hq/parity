import type {
  Commands,
  Disposable,
  ExtensionApi,
  ExtensionInfo,
  Log,
  Navigate,
  Parity,
  Project,
  RemoteApi,
  Selection,
  Settings
} from "./api.ts"
import type { Capability } from "./manifest.ts"

/*
 * @internal What only Parity's own extensions use (docs/proposals/extensions-in-the-window.md): a window module, which
 * runs on the window's main thread in each project tab its extension is active for, and the link between it and its
 * Node half. Parity's built-in extensions are built and released with the app, so this changes with the app and
 * promises nothing beyond the build it ships in. It's this package's `./internal` entry, which no published package
 * will carry.
 */

/** What a window module exports. */
export interface WindowModule<WindowApi extends object = object, ForNode extends ExtensionApi = ExtensionApi> {
  /**
   * Called once per project tab. What it returns:
   * - `window`: called directly by other window modules in the same tab, with any values, including functions.
   * - `node`: called by its own Node half, across processes, so JSON in and JSON out.
   */
  activateWindow(parity: WindowParity): Activated<WindowApi, ForNode> | Promise<Activated<WindowApi, ForNode>>
  /** Called before it stops, after everything in `parity.subscriptions` has been disposed. */
  deactivateWindow?(): void | Promise<void>
}

/** What `activateWindow` gives back: an API for other window modules, and one for its own Node half. */
export interface Activated<WindowApi extends object = object, ForNode extends ExtensionApi = ExtensionApi> {
  window?: WindowApi
  node?: ForNode
}

/** A window module, typed from its first line: `export default defineWindowModule({ activateWindow(parity) { … } })`. */
export function defineWindowModule<WindowApi extends object = object, ForNode extends ExtensionApi = ExtensionApi>(
  module: WindowModule<WindowApi, ForNode>
): WindowModule<WindowApi, ForNode> {
  return module
}

/** Where the other half is. */
export type HalfState = "starting" | "ready" | "restarting" | "stopped"

/** A call to the other half while it isn't `ready`. Calls aren't queued: a queued call can arrive long after it makes sense. */
export class HalfUnavailableError extends Error {
  readonly state: Exclude<HalfState, "ready">

  constructor(state: Exclude<HalfState, "ready">, half: "window" | "node") {
    super(`The ${half === "node" ? "Node half" : "window module"} is ${state}, so it can't be called`)
    this.name = "HalfUnavailableError"
    this.state = state
  }
}

/** A window module called an API its manifest's `capabilities` doesn't name. */
export class CapabilityMissingError extends Error {
  readonly capability: Capability
  readonly api: string

  constructor(extension: string, capability: Capability, api: string) {
    super(`${extension} uses ${api}, which needs the "${capability}" capability in its manifest`)
    this.name = "CapabilityMissingError"
    this.capability = capability
    this.api = api
  }
}

/** In the window module: its own Node half. */
export interface HostLink {
  /** What the Node half's `activate` returned, typed by the caller. Calls go across processes. */
  api<Api extends ExtensionApi>(): RemoteApi<Api>
  /** The Node half's state now, and as it changes. `stopped` for an extension without one. */
  readonly state: HalfState
  onStateChange(listener: (state: HalfState) => void): Disposable
}

/** In the Node half's `Parity`, as `parity.window`: its window module in the project's tab. */
export interface WindowLink {
  /** What the tab's window module returned as `node`. A project is open in at most one tab. */
  api<Api extends ExtensionApi>(): RemoteApi<Api>
  readonly state: HalfState
  onStateChange(listener: (state: HalfState) => void): Disposable
}

/** The Node half's `Parity`, for an internal extension with a window module. */
export interface InternalParity extends Parity {
  readonly window: WindowLink
}

/** Another internal extension's window module in the same tab, by `extensionDependencies`. */
export interface OtherWindowModule<Api extends object> {
  id: string
  /** Undefined while that extension is off. Window dependencies are optional: it isn't turned on for this one. */
  readonly api: Api | undefined
  onAvailable(listener: (api: Api) => void): Disposable
  onGone(listener: () => void): Disposable
}

/** The extensions a window module builds on, in the same tab. */
export interface WindowExtensions {
  /** One its manifest names in `extensionDependencies`. Throws for one it doesn't. */
  get<Api extends object>(id: string): OtherWindowModule<Api>
}

/**
 * What a window module gets, for one project tab. It has the Node half's reads (selection, settings, navigation) and
 * what only makes sense in the window. Files, processes, providers and edits stay in the Node half. What needs a
 * capability (the canvas, the camera, presence, sync, agents' activity) comes with phase 3 onwards, each checked
 * against the manifest's `capabilities` as it's used.
 */
export interface WindowParity {
  readonly extension: ExtensionInfo
  readonly project: Pick<Project, "root" | "name">
  /** The project tab it runs in. */
  readonly tab: string
  /** Disposed, newest first, when it stops in this tab. */
  readonly subscriptions: Disposable[]
  readonly commands: Commands
  readonly selection: Selection
  readonly navigate: Navigate
  readonly settings: Settings
  readonly log: Log
  readonly host: HostLink
  readonly extensions: WindowExtensions
}
