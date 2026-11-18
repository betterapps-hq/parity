import type {
  Commands,
  Disposable,
  ExtensionApi,
  ExtensionInfo,
  Log,
  Navigate,
  NodeRef,
  Parity,
  Project,
  RemoteApi,
  Selection,
  Settings
} from "./api.ts"
import type { Capability, JsonValue } from "./manifest.ts"

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

/** A point on the page, or on the screen from the canvas area's top-left corner. */
export interface Point {
  x: number
  y: number
}

export interface Rect extends Point {
  width: number
  height: number
}

/** What the canvas shows: the part of the page in view. Windows differ in size, so it's a rect, not a zoom. */
export type CameraView = Rect

/** Why following ended. */
export type FollowEnd = "escape" | "panned" | "zoomed" | "navigated" | "replaced" | "disposed"

/** The canvas's camera (`camera` capability). */
export interface Camera {
  /** What's in view now. Before the tab's canvas has mounted, an empty rect at the origin. */
  get(): CameraView
  /** Told, at most once a frame, when what's in view changes. Kept across the canvas mounting again. */
  onChange(listener: (view: CameraView) => void): Disposable
  /**
   * Brings `view` into view, fitted to this window within the canvas's zoom limits. Animates unless `animate` is false.
   * Rejects before the tab's canvas has mounted.
   */
  show(view: CameraView, options?: { animate?: boolean }): Promise<void>
  /**
   * Keeps showing what `update` gives until it ends. The person's own input ends it: Esc, a pan or zoom, or opening
   * another page. Following's own camera moves never end it. Parity draws nothing for it; the extension draws its own
   * frame and banner. Throws before the tab's canvas has mounted.
   */
  follow(view: CameraView): Following
}

export interface Following extends Disposable {
  /** Moves what's followed. Drawn at most once a frame; the latest wins. */
  update(view: CameraView): void
  /** Told once, when it ends. */
  onEnd(listener: (why: FollowEnd) => void): Disposable
}

/** What a layer draws: what React renders, typed here without React so this entry needs none. */
export type LayerChildren = object | string | number | bigint | boolean | null | undefined

/** A layer: on the page, in one of three orders, or on the screen at the canvas's edge. */
export type LayerOptions =
  | {
      /** Unique in the tab, as `multiplayer.pointers`. */
      id: string
      space: "page"
      order: "underDesigns" | "overDesigns" | "overSelection"
      /** Hidden while the person edits text on the canvas. */
      hideWhileEditing?: boolean
    }
  | {
      id: string
      space: "screen"
      order: "edge"
      /**
       * A corner, along the bottom, or `fill`: the whole canvas area, as following's frame covers it. `topRight` is on the
       * zoom controls' row, just left of them, at their height, and below them on a canvas narrower than 676px.
       */
      placement: "topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "bottom" | "fill"
    }

export interface BoxOptions {
  /** What to measure: the board around a design, the frame a state and mode draws in, or a node in that frame. */
  in?: "board" | "frame" | "node"
  /** Which frame. When none matches both, a frame in `mode` is used, then the primary frame. */
  state?: string
  mode?: string
  /** With a node, also where a caret before character `caret` of the text it draws stands, as `caret` in the result. */
  caret?: number
}

/** A caret as it's drawn on the page: where it stands along the line, and the line's top and bottom. */
export interface CaretAt {
  x: number
  top: number
  bottom: number
}

export type BoxResult =
  /**
   * Drawn: its box on the page, its corner radius in page units, and its laid-out size in design pixels. With `caret`
   * asked for, where that caret stands, when the text drawn reaches it.
   */
  | { kind: "drawn"; box: Rect; radius: number; size: { width: number; height: number }; caret?: CaretAt }
  /** Its frame is asleep (scrolled far away or culled): the frame's box, so something can still point at it. */
  | { kind: "asleep"; frame: Rect }
  /** Not on the canvas. */
  | { kind: "missing" }

/** A node in a preview, following a point on the page: its top-left, keeping its size. */
export interface PreviewItem {
  /** A design (`type: "design"`, its key) for a board, or a layer (`designKey/layerId`). */
  ref: NodeRef
  at: Point
  state?: string
  mode?: string
}

export interface PreviewOptions {
  /** Where dragged layers would land: before the parent's child at `index`, in the frame of `state` and `mode`. */
  drop?: { parent: NodeRef; index: number; state?: string; mode?: string }
  /** The person dragging, for the outline round what moves. Claimed from people's colors while the preview lasts. */
  color: ColorKey
  label?: string
}

/** Someone else's drag, shown on this canvas without writing anything. */
export interface Preview extends Disposable {
  /** Moves the items, at most once a frame. Later calls in a frame replace earlier ones. */
  update(items: PreviewItem[], options?: Partial<PreviewOptions>): void
  /**
   * Settles when the covering write arrives: someone else's change to what it moves. If none comes within 2 s, it's
   * disposed anyway.
   */
  settleOnWrite(): void
  /** Called off: what moved flies back to where it was. */
  cancel(): void
}

/** How long `canvas.hold` holds a board, however long it's asked to: it's let go after this anyway. */
export const holdLimitMs = 10_000

/** A board held where it is while an agent moves it (`hold` capability), for at most `holdLimitMs`. */
export interface Held extends Disposable {
  /** Moves the held board, at most once a frame. */
  update(at: Point): void
  /** Lets go: the board shows where the document says. Disposing does the same. */
  release(): void
}

/**
 * Drawing on the canvas (`canvas` capability): layers kept in step with the camera, where things are on the page, and
 * previews of other people's drags.
 */
export interface CanvasSurface {
  /**
   * Draws `children` in a layer over the canvas, inside the project tab's own React tree with an error boundary of its
   * own, paused while the tab is hidden. In `page` space, children are placed in page coordinates; to keep something
   * the same size on screen, scale it by `1 / zoom`. Layers don't take the pointer unless an element inside asks with
   * `data-canvas-interactive`.
   */
  // oxlint-disable-next-line anti-slop/no-object-parameters -- what React renders, typed without React so this entry needs none
  layer(options: LayerOptions, children: LayerChildren): Disposable
  /** The camera, as `parity.camera`. Needs the `camera` capability too. */
  readonly camera: Camera
  /** Where something is on the page, or why it isn't there. `missing` before the tab's canvas has mounted. */
  box(ref: NodeRef, options?: BoxOptions): BoxResult
  /**
   * Told, at most once a frame, when that box changes: moved, resized, redrawn, gone to sleep or woken. Not for panning:
   * boxes are on the page.
   */
  onBoxChange(ref: NodeRef, listener: (box: BoxResult) => void, options?: BoxOptions): Disposable
  /** What's under a point on the page: the design, and the deepest node of it there. */
  hit(at: Point): { design: string; node?: string } | undefined
  pageToScreen(at: Point): Point
  screenToPage(at: Point): Point
  /** Shows nodes another person is dragging, moving as they do, without writing anything. */
  preview(items: PreviewItem[], options: PreviewOptions): Preview
  /** Holds a board where it is while an agent moves it, for at most `holdLimitMs`. Needs the `hold` capability too. */
  hold(design: string, at: Point): Held
}

/** Whose color something is: a person's peer id, or `${peer}:${agentId}` for an agent. Unique across a room's copies. */
export type ColorKey = string

/** A gradient for pointers, a solid color for outlines, and the ink that reads on it. */
export interface Palette {
  /** Its number in its list. A room hands out numbers, never colors. */
  n: number
  /** A hand-tuned palette's name, as `Ember`; a generated one's is its hue, as `Hue 137`. */
  name: string
  stops: [string, string, string]
  color: string
  ink: string
}

/** One list of colors, handed out by key. Neither list runs out. */
export interface Colors {
  /**
   * The palette for `key`: its assigned one, or the lowest-numbered one no other key holds. Never fails. Each claim is
   * counted, and the key's color is given back once this extension has released it as often.
   */
  claim(key: ColorKey): Palette
  /** Gives back one claim on `key`'s color, when its person or agent has gone. */
  release(key: ColorKey): void
  /** Sets `key`'s palette by number, as the room decided. It wins over a claim. */
  assign(key: ColorKey, n: number): void
  /** Palette `n`: hand-tuned below `tuned`, generated from `n` above it. The same in every copy. */
  palette(n: number): Palette
  /** How many palettes are hand-tuned. */
  readonly tuned: number
}

/**
 * Colors for people and agents. People's and agents' palettes are two lists, told apart by style rather than hue, so
 * `parity.colors` is people's and `parity.colors.agents` is agents'. Claims are counted per extension and given back
 * when it stops in the tab.
 */
export interface WindowColors extends Colors {
  readonly agents: Colors
}

/** Where a gesture's nodes are drawn: which design's frame, by state and mode. */
export interface InFrame {
  state?: string
  mode?: string
}

/** A resize handle. */
export type Handle = "top" | "right" | "bottom" | "left" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight"

/**
 * What this person is doing with the pointer or the keyboard on the canvas: what it does and where it started. How it
 * goes on is worked out from the pointer, so nothing in a gesture is sent every frame but the pointer itself.
 */
export type Gesture =
  | {
      kind: "move"
      phase: "start" | "drop" | "end" | "cancel"
      /** What moves, where each is from the pointer, and which frame it's in. */
      targets: (InFrame & { ref: NodeRef; offset: Point; size: { width: number; height: number } })[]
      /** Only for layers in a layout: where they'd land. A `drop` event comes each time this changes. */
      drop?: InFrame & { parent: NodeRef; index: number }
    }
  | { kind: "resize"; phase: "start" | "end" | "cancel"; ref: NodeRef; frame?: InFrame; handle: Handle; from: Rect }
  | { kind: "marquee"; phase: "start" | "end" | "cancel"; from: Point }
  | {
      kind: "text"
      phase: "start" | "caret" | "end"
      ref: NodeRef
      frame?: InFrame
      caret?: { anchor: number; focus: number }
    }

/** What this person is looking at: the design, and the state and mode it shows. */
export interface Viewing {
  design?: string
  state?: string
  mode?: string
}

/** The person signed in (`presence.self`). */
export interface Self {
  name: string
  avatar?: string
  /**
   * How their account avatar shows them in this window, while they're signed in: their provider's picture, or their
   * initials on their own color. Only for drawing them to themselves; never send it to anyone else.
   */
  own?: OwnLook
}

/** How someone's account avatar looks: their provider's picture, when there is one, else their initials on a color. */
export interface OwnLook {
  photo?: string
  initials: string
  /** A CSS color their initials sit on, in white. */
  color: string
}

/** What this person is doing (`presence` capability). Only about this person: showing others is the extension's job. */
export interface Presence {
  /** The person signed in, as others should see them, and as their account avatar shows them to themselves. */
  readonly self: Self
  /**
   * Told where the pointer is on the page, at most once a frame with the latest. Its leaving the canvas (`over: false`)
   * is never dropped.
   */
  onPointer(listener: (pointer: { at: Point; over: boolean }) => void): Disposable
  /**
   * Told each gesture's start, its drop target changing, and its end or cancel, every one in order. A move's drop
   * reaches `sync.onLocalChanges` before its `end` is told here.
   */
  onGesture(listener: (gesture: Gesture) => void): Disposable
  /** Told each time the design, state or mode this person sees changes, every one in order. */
  onViewing(listener: (viewing: Viewing) => void): Disposable
}

/** One step of an agent's work. */
export interface AgentStep {
  kind:
    | "read"
    | "write"
    | "move"
    | "screenshot"
    | "measure"
    | "accessibility"
    | "problems"
    | "console"
    | "board"
    | "start"
    | "end"
  /** The agent's id, unique in its copy. With `from`, it's unique in the room. */
  agentId: string
  /** Who's calling, as `Claude Code`. */
  agent?: string
  label?: string
  /** What it works on: a design (`type: "design"`, its key) for a board, or a layer (`designKey/layerId`). */
  ref?: NodeRef
  state?: string
  mode?: string
  /** Where a moved design's board was and where it goes, on the page. */
  from?: Point
  to?: Point
  error?: string
}

/** Agents' activity (`agents` capability): this copy's, and other copies' passed in. */
export interface Agents {
  /**
   * Told each step of every agent working in this project: this copy's (no `from`), and other copies' passed in with
   * `receive` (their `from`). This copy's steps come before the write they describe is applied.
   */
  onActivity(listener: (steps: AgentStep[], from?: string) => void): Disposable
  /** Passes on another copy's agent steps, from the copy `from`. They're told through `onActivity`, in order. */
  receive(steps: AgentStep[], options: { from: string }): void
}

/** How the project opens, as the extension that brings the room says. */
export type OpenFrom = { from: "files" } | { from: "snapshot"; snapshot: Uint8Array; lineage: string }

/** Bytes from a copy of another lineage: another document, though it may be the same project. */
export class LineageError extends Error {
  readonly lineage: string
  readonly theirs: string

  constructor(lineage: string, theirs: string) {
    super(`These changes are from another copy of the document (${theirs}), not this one's (${lineage})`)
    this.name = "LineageError"
    this.lineage = lineage
    this.theirs = theirs
  }
}

/**
 * Sharing the document (`sync` capability, with `contributes.sync`). The document stays in core: Loro, undo and saving.
 * The extension brings the room: it says how the document opens, carries its changes, and says whether this copy
 * writes files.
 */
export interface Sync {
  /** The format of the bytes it carries, as `loro/1`. The extension passes them on without reading them. */
  readonly format: string
  /**
   * Says how the project opens, before it does. Core waits up to 30 s. `{ from: "files" }` opens the project's files in
   * a new document, with a new lineage, and this copy writes files; `{ from: "snapshot" }` opens on another copy's
   * document, keeping its lineage, and this copy doesn't write files until told to. If the handler rejects or takes too
   * long, the project opens from files, alone, and sync is detached until `reopen()`.
   */
  onOpen(handler: () => Promise<OpenFrom>): Disposable
  /** The document's lineage: an id every copy that shares it has. Empty until the document opens through `onOpen`. */
  readonly lineage: string
  /**
   * Told the bytes of every change committed here, in order, none dropped: the person's, an agent's, an extension's,
   * repairs, and files reloaded from disk.
   */
  onLocalChanges(listener: (bytes: Uint8Array) => void): Disposable
  /**
   * Takes in another copy's changes, in the order called, waiting until the document is open. `pending` is true when
   * some of them need changes this copy hasn't got yet; it keeps them and applies them when the gap is filled. Rejects
   * with `LineageError` for bytes from another lineage.
   */
  receive(bytes: Uint8Array): Promise<{ pending: boolean }>
  /** This copy's version: what it has of the document, to compare with another copy's. */
  version(): Uint8Array
  /** The changes another copy at `version` is missing. */
  changesSince(version: Uint8Array): Uint8Array
  /** The whole document, for a copy that's joining. Waits until the document is open. */
  snapshot(): Promise<Uint8Array>
  /**
   * Whether this copy writes the project's files. `true` resolves once the files that differ from what was last written
   * are written; `false` once writes in flight have finished.
   */
  setWritesFiles(writes: boolean): Promise<void>
  readonly writesFiles: boolean
  /** Closes the project and opens it again through `onOpen`. */
  reopen(): Promise<void>
}

/**
 * What a window module gets, for one project tab. It has the Node half's reads (selection, settings, navigation) and
 * what only makes sense in the window. Files, processes, providers and edits stay in the Node half. What needs a
 * capability is checked against the manifest's `capabilities` as it's read, and throws `CapabilityMissingError`
 * without it.
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
  readonly colors: WindowColors
  /** `canvas` capability; `camera` for `canvas.camera`; `hold` for `canvas.hold`. */
  readonly canvas: CanvasSurface
  /** `camera` capability. */
  readonly camera: Camera
  /** `presence` capability. */
  readonly presence: Presence
  /** `sync` capability. */
  readonly sync: Sync
  /** `agents` capability. */
  readonly agents: Agents
  readonly host: HostLink
  readonly extensions: WindowExtensions
  /**
   * The extension's own telemetry: events defined in `@parity-app/telemetry` for it, as the multiplayer extension's
   * `room.*`. Core checks each against its schema; one that isn't defined is dropped.
   */
  readonly telemetry: { record(event: string, attributes: Readonly<Record<string, JsonValue>>): void }
}
