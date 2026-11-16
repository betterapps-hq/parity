import type { BoxOptions, BoxResult, CanvasRef, Disposable, Drawn, Measure, Point, Rect } from "./types.ts"

/** A frame a design draws, as the measuring service reads it. Each part is read when it's asked for. */
export interface MeasuredFrame {
  readonly mode: string | undefined
  readonly state: string | undefined
  readonly primary: boolean
  readonly asleep: boolean
  /** The frame itself. */
  measure(): Drawn
  /** A node it draws, or nothing when it draws none. */
  node(id: string): Drawn | undefined
  /** Whether a page point is inside it. */
  contains(at: Point): boolean
  /** The nodes it draws under a page point, outermost first. */
  nodesAt(at: Point): string[]
}

/** What the measuring service needs from the canvas, so it runs the same over the window (`measure-dom.ts`) and in tests. */
export interface MeasurePort {
  /** A design's board, wherever it is on the page, even culled; nothing when it isn't on the canvas. */
  board(design: string): Drawn | undefined
  /** Whether the board is drawn now, rather than culled out of view. */
  boardDrawn(design: string): boolean
  /** The frames drawn for a design, in the page's order. */
  frames(design: string): MeasuredFrame[]
  /** The design whose board is under a page point, topmost. */
  designAt(at: Point): string | undefined
  pageToScreen(at: Point): Point
  screenToPage(at: Point): Point
  /** Calls back on the next animation frame. Returns what cancels it. */
  frame(callback: () => void): () => void
}

/**
 * The frame to measure for a state and mode: the one drawing both, then one in the mode, then the primary frame, as the
 * agent presence has found its targets.
 */
export function pickFrame<Frame extends Pick<MeasuredFrame, "mode" | "state" | "primary">>(
  frames: readonly Frame[],
  { state, mode }: Pick<BoxOptions, "state" | "mode"> = {}
): Frame | undefined {
  return (
    (state !== undefined || mode !== undefined
      ? frames.find(
          (frame) => (mode === undefined || frame.mode === mode) && (state === undefined || frame.state === state)
        )
      : undefined) ??
    (mode !== undefined ? frames.find((frame) => frame.mode === mode) : undefined) ??
    frames.find((frame) => frame.primary) ??
    frames[0]
  )
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01

const sameRect = (a: Rect, b: Rect) =>
  near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height)

/** Whether two results say the same thing, within a hundredth of a unit. */
export function sameBox(a: BoxResult, b: BoxResult): boolean {
  if (a.kind === "drawn" && b.kind === "drawn") {
    return (
      sameRect(a.box, b.box) &&
      near(a.radius, b.radius) &&
      near(a.size.width, b.size.width) &&
      near(a.size.height, b.size.height)
    )
  }

  if (a.kind === "asleep" && b.kind === "asleep") {
    return sameRect(a.frame, b.frame)
  }

  return a.kind === b.kind
}

const missing: BoxResult = { kind: "missing" }
const drawn = (each: Drawn): BoxResult => ({ kind: "drawn", ...each })

/** Where things are on the canvas, read through `port`, and what stops it. */
export function createMeasure(port: MeasurePort): Measure & Disposable {
  const box = (ref: CanvasRef, options: BoxOptions = {}): BoxResult => {
    const within = options.in ?? (ref.node === undefined ? "frame" : "node")
    const board = port.board(ref.design)

    if (within === "board") {
      return board ? drawn(board) : missing
    }

    if (!board) {
      return missing
    }

    const frame = pickFrame(port.frames(ref.design), options)

    // Culled out of view, its frames aren't drawn; its board still says where it is.
    if (!frame) {
      return port.boardDrawn(ref.design) ? missing : { kind: "asleep", frame: board.box }
    }

    if (frame.asleep) {
      return { kind: "asleep", frame: frame.measure().box }
    }

    if (within === "frame" || ref.node === undefined) {
      return drawn(frame.measure())
    }

    const node = frame.node(ref.node)

    return node ? drawn(node) : missing
  }

  interface Watch {
    ref: CanvasRef
    options: BoxOptions | undefined
    listener: (box: BoxResult) => void
    last: BoxResult
  }

  const watches = new Set<Watch>()
  let cancel: (() => void) | undefined

  const tick = () => {
    cancel = undefined

    if (watches.size === 0) {
      return
    }

    for (const watch of Array.from(watches)) {
      const now = box(watch.ref, watch.options)

      if (!sameBox(now, watch.last)) {
        watch.last = now
        watch.listener(now)
      }
    }

    cancel = port.frame(tick)
  }

  return {
    box,
    onBoxChange(ref, listener, options) {
      const watch: Watch = { ref, options, listener, last: box(ref, options) }
      watches.add(watch)
      cancel ??= port.frame(tick)

      return {
        dispose: () => {
          watches.delete(watch)

          if (watches.size === 0) {
            cancel?.()
            cancel = undefined
          }
        }
      }
    },
    hit(at) {
      const design = port.designAt(at)

      if (design === undefined) {
        return undefined
      }

      const frame = port.frames(design).find((each) => !each.asleep && each.contains(at))
      const node = frame?.nodesAt(at).at(-1)

      return node === undefined ? { design } : { design, node }
    },
    pageToScreen: (at) => port.pageToScreen(at),
    screenToPage: (at) => port.screenToPage(at),
    dispose() {
      watches.clear()
      cancel?.()
      cancel = undefined
    }
  }
}
