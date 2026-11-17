import type { Point } from "./drop-slot.ts"

/**
 * The shapes the canvas surface speaks in (PAR-1233, PAR-1236), as docs/proposals/extensions-in-the-window.md sets them
 * out. Page coordinates are tldraw's; screen coordinates are pixels from the canvas area's top-left corner. The
 * window draws through them in `apps/desktop/src/renderer/canvas/surface/`; the policy is here, over ports.
 */

export interface PageRect extends Point {
  width: number
  height: number
}

/** Something stopped or taken back by calling it. */
export interface Disposable {
  dispose(): void
}

/** What the canvas shows: the part of the page in view. Windows differ in size, so it's a rect, not a zoom. */
export type CameraView = PageRect

/** Why following ended. */
export type FollowEnd = "escape" | "panned" | "zoomed" | "navigated" | "replaced" | "disposed"

export interface Camera {
  get(): CameraView
  /** Told, at most once a frame, when what's in view changes. */
  onChange(listener: (view: CameraView) => void): Disposable
  /** Brings `view` into view, fitted to this window within the canvas's zoom limits. Animates unless `animate` is false. */
  show(view: CameraView, options?: { animate?: boolean }): Promise<void>
  /**
   * Keeps showing what `update` gives until it ends. The person's own input ends it: Esc, a pan or zoom, or opening
   * another page. Following's own camera moves are tagged, so they never end it. Nothing is drawn for it here.
   */
  follow(view: CameraView, options?: { owner?: string }): Following
}

export interface Following extends Disposable {
  update(view: CameraView): void
  onEnd(listener: (why: FollowEnd) => void): Disposable
  /** Whether it's still on. */
  readonly active: boolean
}

/** A design on the canvas, or a node in it. */
export interface CanvasRef {
  design: string
  node?: string
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

/** Something drawn: its box on the page, its corner radius in page units, and its laid-out size in design pixels. */
export interface DrawnAt {
  box: PageRect
  radius: number
  size: { width: number; height: number }
  /** Where the caret asked for with `caret` stands, when the text drawn reaches it. */
  caret?: CaretAt
}

export type BoxResult =
  | ({ kind: "drawn" } & DrawnAt)
  /** Its frame is asleep, or its board culled: the frame's box (the board's, when culled) so something can point at it. */
  | { kind: "asleep"; frame: PageRect }
  /** Not on the canvas. */
  | { kind: "missing" }

export interface Measure {
  /** Where something is on the page, or why it isn't there. */
  box(ref: CanvasRef, options?: BoxOptions): BoxResult
  /** Told when that box changes: moved, resized, redrawn, gone to sleep or woken. Not for panning: boxes are on the page. */
  onBoxChange(ref: CanvasRef, listener: (box: BoxResult) => void, options?: BoxOptions): Disposable
  /** What's under a point on the page: the design, and the deepest node of it there. */
  hit(at: Point): { design: string; node?: string } | undefined
  pageToScreen(at: Point): Point
  screenToPage(at: Point): Point
}
