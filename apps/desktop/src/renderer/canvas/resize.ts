import type { NodeStyle } from "@parity/core"
import type { Rect } from "./drop-slot.ts"
import { type DrawnSteps, resizeInsets } from "./insets.ts"

/** A side or corner a resize handle sits on. */
export type Edge = "n" | "e" | "s" | "w" | "ne" | "se" | "sw" | "nw"

/** The sizes a handle changes: a side's handle changes the one across it, a corner's both. */
export function edgeAxes(edge: Edge): { width: boolean; height: boolean } {
  return { width: edge.includes("e") || edge.includes("w"), height: edge.includes("n") || edge.includes("s") }
}

/** How far, in screen pixels, the pointer goes along a handle's axes before the resize starts. */
export const resizeThreshold = 4

/** How close, in screen pixels, an edge comes to the inside of its parent to fill it. */
export const fillDistance = 6

export interface ResizeStart {
  edge: Edge
  /** The layer's box in screen pixels when the drag began. */
  rect: Rect
  /** The box its parent lays it out in, inside the padding, in screen pixels. */
  inner?: Rect
  /** Screen pixels per layout pixel. */
  scale: number
  /** Layout pixels per spacing step. */
  unit: number
  /** For an absolutely placed layer: its style as written, and where its sides are drawn, in steps. */
  absolute?: { style: NodeStyle; drawn: DrawnSteps }
}

export interface ResizeMove {
  /** How far the pointer is from where it was pressed, in screen pixels. */
  dx: number
  dy: number
  /** Keeps a corner's proportions, and turns off filling. */
  shift: boolean
}

/**
 * Follows one drag of a resize handle, giving the style each pointer position makes, or nothing while the drag hasn't
 * started. A handle changes only its own axes, and nothing changes until the pointer has moved along them, so pressing a
 * handle or dragging a side's handle along its side does nothing.
 *
 * A layer in a layout takes a size in whole spacing steps, or fill when its edge comes back to the inside of its parent
 * after leaving it, so an edge that starts there, as the last child in a row does, doesn't fill at once. An absolutely
 * placed layer keeps its far edge where it was: dragging its left or top handle moves that inset too (see
 * `resizeInsets`), and it never fills.
 */
export function resizeGesture(start: ResizeStart): (move: ResizeMove) => NodeStyle | undefined {
  const { edge, rect, inner, scale, unit, absolute } = start
  const axes = edgeAxes(edge)
  const ratio = (rect.right - rect.left) / Math.max(1, rect.bottom - rect.top)
  // How far each moving edge is from the inside of the parent; it fills only once it has been away.
  const gaps = (dx: number, dy: number) => ({
    width: edge.includes("e")
      ? Math.abs(rect.right + dx - (inner?.right ?? Infinity))
      : Math.abs(rect.left + dx - (inner?.left ?? -Infinity)),
    height: edge.includes("s")
      ? Math.abs(rect.bottom + dy - (inner?.bottom ?? Infinity))
      : Math.abs(rect.top + dy - (inner?.top ?? -Infinity))
  })
  const away = gaps(0, 0)
  const armed = { width: away.width >= fillDistance, height: away.height >= fillDistance }
  let started = false

  return ({ dx: pointerX, dy: pointerY, shift }) => {
    const dx = axes.width ? pointerX : 0
    let dy = axes.height ? pointerY : 0
    // Shift on a corner keeps the proportions, following the horizontal movement.
    if (shift && axes.width && axes.height) {
      const signX = edge.includes("w") ? -1 : 1
      const signY = edge.includes("n") ? -1 : 1
      dy = ((signX * dx) / ratio) * signY
    }
    if (!started && Math.hypot(dx, dy) < resizeThreshold) return undefined
    started = true
    const style: NodeStyle = {}
    if (absolute) {
      for (const [axis, size] of [
        ["x", "width"],
        ["y", "height"]
      ] as const) {
        if (!axes[size]) continue
        const end = axis === "x" ? edge.includes("e") : edge.includes("s")
        const moved = (axis === "x" ? dx : dy) / scale
        const length = (axis === "x" ? rect.right - rect.left : rect.bottom - rect.top) / scale
        const result = resizeInsets(absolute.style, absolute.drawn, axis, end, moved, length, unit)
        if (result.size !== undefined) style[size] = result.size
        Object.assign(style, result.insets)
      }
      return style
    }
    const gap = gaps(dx, dy)
    for (const size of ["width", "height"] as const) {
      if (!axes[size]) continue
      if (gap[size] >= fillDistance) armed[size] = true
      const [from, to] =
        size === "width"
          ? [edge.includes("w") ? rect.left + dx : rect.left, edge.includes("e") ? rect.right + dx : rect.right]
          : [edge.includes("n") ? rect.top + dy : rect.top, edge.includes("s") ? rect.bottom + dy : rect.bottom]
      style[size] =
        armed[size] && gap[size] < fillDistance && !shift ? "fill" : Math.max(0, Math.round((to - from) / scale / unit))
    }
    return style
  }
}
