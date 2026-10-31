import { type ContainerSpec, locateNode, type NodeStyle } from "@parity-app/core"
import { type BoardView, boardReader } from "./shown.ts"

/**
 * Where resize handles go around a selected layer or frame: square handles on the corners and strips along the sides,
 * as in Figma. Around a layer smaller than `smallLayer` on an axis, the handles on that axis sit just outside it, so
 * they never cover it and a press anywhere on it still drags it.
 */

/** A side or corner a resize handle sits on. */
export type Edge = "n" | "e" | "s" | "w" | "ne" | "se" | "sw" | "nw"

/** A box in screen pixels. */
export interface HandleBox {
  x: number
  y: number
  w: number
  h: number
}

/** Under this many screen pixels across an axis, a layer's handles on that axis sit outside it. */
export const smallLayer = 24

/** A corner handle's side, and a side strip's thickness, in screen pixels. */
export const handleSize = 8

/** The box each handle takes around a layer's or a frame's box, in its pixels and in the order the edges are given. */
export function handleBoxes(box: HandleBox, edges: readonly Edge[]): { edge: Edge; box: HandleBox }[] {
  const across = band(box.x, box.w)
  const down = band(box.y, box.h)
  const place = (edge: Edge): HandleBox => {
    let x = across.middle
    if (edge.includes("w")) x = across.start
    else if (edge.includes("e")) x = across.end
    let y = down.middle
    if (edge.includes("n")) y = down.start
    else if (edge.includes("s")) y = down.end
    return { x: x.from, y: y.from, w: x.to - x.from, h: y.to - y.from }
  }
  return edges.map((edge) => ({ edge, box: place(edge) }))
}

interface Span {
  from: number
  to: number
}

/**
 * Along one axis: where the handles at its start and end go, and the span between them that the strips across it
 * take. On a layer large enough they straddle its edges, with the strips stopping short of the corners. On a small one
 * they sit outside its edges, and the strips cover it from edge to edge.
 */
function band(start: number, size: number): { start: Span; middle: Span; end: Span } {
  const end = start + size
  const half = handleSize / 2
  if (size < smallLayer) {
    return {
      start: { from: start - handleSize, to: start },
      middle: { from: start, to: end },
      end: { from: end, to: end + handleSize }
    }
  }
  return {
    start: { from: start - half, to: start + half },
    middle: { from: start + handleSize, to: end - handleSize },
    end: { from: end - half, to: end + half }
  }
}

/**
 * What resizing the layer `id` starts from, as the board being edited shows it: the layer's style, and the direction of
 * the layout it's in (a column unless the board shows a row), or none outside a layout. Undefined when there's no such
 * layer among the design's own.
 */
export function resizeStart(
  container: ContainerSpec,
  id: string,
  view: BoardView
): { style: NodeStyle; parentDirection?: "row" | "column" } | undefined {
  const location = locateNode(container.root, id)
  if (!location) return undefined
  const read = boardReader(container, view)
  const parent = location.ancestors.at(-1)
  const style = read(location.node).style ?? {}
  if (parent?.type !== "layout") return { style }
  return { style, parentDirection: read(parent).style?.direction ?? "column" }
}
