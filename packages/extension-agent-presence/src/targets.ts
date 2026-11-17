import type { NodeRef } from "@parity-app/extension"
import type { BoxOptions, BoxResult, Rect } from "@parity-app/extension/internal"
import type { Box } from "./motion.ts"
import { boardOf, layerOf, type QueuedStep } from "./queue.ts"

/** What a target is measured through: the layer's camera and boxes (`@parity-app/canvas-layer`'s context). */
export interface TargetReads {
  view(): { zoom: number; view: Rect }
  box(ref: NodeRef, options?: BoxOptions): BoxResult
}

/**
 * Something the agent looks at, measured again each time it's asked for, so it follows the canvas as it pans. Boxes
 * are on the screen, from the canvas's top left, as the pointer is drawn.
 */
export interface Target {
  box(): Box
  /** Its corner radius on the screen, so its scan has the same shape. */
  radius(): number
  /** Its laid-out size in design pixels, for a measurement's label; undefined when its frame is asleep. */
  size(): { width: number; height: number } | undefined
}

/** A page rect on the screen, from the canvas's top left. */
export function onScreen(rect: Rect, camera: { zoom: number; view: Rect }): Box {
  const { zoom, view } = camera

  return { x: (rect.x - view.x) * zoom, y: (rect.y - view.y) * zoom, w: rect.width * zoom, h: rect.height * zoom }
}

/** The measured box of what a step looks at: a layer in its frame, the frame itself, or for a move, the board. */
function measure(reads: TargetReads, step: QueuedStep): BoxResult {
  const design = boardOf(step)

  if (!design) {
    return { kind: "missing" }
  }

  const board: NodeRef = { owner: "design", type: "design", key: design }
  const frame: BoxOptions = {}

  if (step.state !== undefined) {
    frame.state = step.state
  }

  if (step.mode !== undefined) {
    frame.mode = step.mode
  }

  // A move is of the board, which the pointer drags.
  if (step.kind === "move") {
    return reads.box(board, { in: "board" })
  }

  if (layerOf(step) !== undefined && step.ref) {
    const node = reads.box(step.ref, { ...frame, in: "node" })

    if (node.kind === "drawn") {
      return node
    }
  }

  // What the agent looks at is the design itself, the screen or component in its frame, not the board around it.
  const shown = reads.box(board, { ...frame, in: "frame" })

  return shown.kind === "missing" ? reads.box(board, { in: "board" }) : shown
}

/** Where a box result is on the page: what's drawn, or an asleep frame's box, which can still be pointed at. */
function rectOf(result: BoxResult): Rect | undefined {
  if (result.kind === "drawn") {
    return result.box
  }

  return result.kind === "asleep" ? result.frame : undefined
}

/**
 * Where a step's target is on the screen, followed as the canvas moves. Undefined when it isn't on the canvas or is
 * out of view, as the canvas culls boards it has scrolled past.
 */
export function locate(reads: TargetReads, step: QueuedStep): Target | undefined {
  let found = measure(reads, step)
  const camera = reads.view()
  const first = rectOf(found)

  if (!first) {
    return undefined
  }

  let last = onScreen(first, camera)
  const width = camera.view.width * camera.zoom
  const height = camera.view.height * camera.zoom
  const inView = last.x < width && last.y < height && last.x + last.w > 0 && last.y + last.h > 0

  if (last.w === 0 || last.h === 0 || !inView) {
    return undefined
  }

  return {
    box: () => {
      // A write can draw it again; measure it anew, or stay where it was.
      const next = measure(reads, step)
      const rect = rectOf(next)

      if (rect) {
        found = next
        last = onScreen(rect, reads.view())
      }

      return last
    },
    radius: () => (found.kind === "drawn" ? found.radius * reads.view().zoom : 0),
    size: () => (found.kind === "drawn" ? found.size : undefined)
  }
}
