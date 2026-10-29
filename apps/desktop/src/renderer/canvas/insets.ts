import type { NodeStyle } from "@parity/core"

/**
 * Moving and resizing an absolutely placed layer by its insets, the distances from its parent's edges it's placed at,
 * as dragging it, nudging it and its resize handles do. Lengths are steps of the spacing scale: insets go in half
 * steps, sizes in whole ones.
 */

export type Side = "top" | "right" | "bottom" | "left"

/** Where a layer's sides are drawn, in steps of the spacing scale from its parent's edges. */
export type DrawnSteps = Record<Side, number>

/** The sides along each axis: the one a layer is placed from by default first. */
const sides = { x: ["left", "right"], y: ["top", "bottom"] } as const

const half = (steps: number) => Math.round(steps * 2) / 2

/**
 * The insets that move an absolutely placed layer `dx` and `dy` steps of the spacing scale, as dragging and nudging it
 * do. Along each axis it moves by the side it's placed from (the left or top, unless only the right or bottom is set),
 * or by both when it's stretched between them, so it keeps its size. Each side moves from where it is: its number,
 * negative too, or, for a length token or a side left unset, where `drawn` says it's drawn. Without `drawn`, an unset
 * side counts from 0 and an axis with a token stays, named by `blocked`. An axis it doesn't move along keeps what's
 * written, tokens included.
 */
export function shiftInsets(
  style: NodeStyle,
  dx: number,
  dy: number,
  drawn?: DrawnSteps
): { change: NodeStyle; blocked?: Side } {
  const change: NodeStyle = {}
  let blocked: Side | undefined
  for (const [start, end, by] of [
    ["left", "right", dx],
    ["top", "bottom", dy]
  ] as const) {
    if (by === 0) continue
    const placed: Side[] =
      style[start] === undefined
        ? style[end] === undefined
          ? [start]
          : [end]
        : style[end] === undefined
          ? [start]
          : [start, end]
    const at = (side: Side): number | undefined => {
      const value = style[side]
      if (typeof value === "number") return value
      return drawn?.[side] ?? (value === undefined ? 0 : undefined)
    }
    const token = placed.find((side) => at(side) === undefined)
    if (token) {
      blocked ??= token
      continue
    }
    for (const side of placed) change[side] = at(side)! + (side === start ? by : -by)
  }
  return { change, ...(blocked ? { blocked } : {}) }
}

/**
 * One axis of resizing an absolutely placed layer by a handle, keeping the opposite edge where it was. `end` says the
 * handle is on the right (or bottom) edge rather than the left (or top); `delta` is how far it moved, and `size` the
 * layer's size along the axis when the drag began, both in layout pixels; `unit` is the pixels in a step.
 *
 * A layer placed from both sides with no size of its own is sized by its insets, so the dragged side's inset moves. A
 * layer placed from the far side alone grows from there, so a handle on that side moves its inset as the size changes.
 * Otherwise it's placed from the near side, which moves with a handle there. A side moves from where it is, as in
 * `shiftInsets`, and only a side that moves is written, so one that stays keeps a token.
 */
export function resizeInsets(
  style: NodeStyle,
  drawn: DrawnSteps,
  axis: "x" | "y",
  end: boolean,
  delta: number,
  size: number,
  unit: number
): { size?: number; insets: NodeStyle } {
  const [near, far] = sides[axis]
  const hasNear = style[near] !== undefined
  const hasFar = style[far] !== undefined
  const sized = style[axis === "x" ? "width" : "height"] !== undefined
  const shift = (side: Side, by: number): NodeStyle => {
    const value = style[side]
    const from = typeof value === "number" ? value : drawn[side]
    const to = half(from + by)
    return to === from ? {} : { [side]: to }
  }
  if (hasNear && hasFar && !sized) {
    return { insets: end ? shift(far, -delta / unit) : shift(near, delta / unit) }
  }
  const next = Math.max(0, Math.round((size + (end ? delta : -delta)) / unit))
  // How far the edge that isn't anchored moved, in steps, once the size is rounded to whole steps.
  const grown = next - size / unit
  const fromFar = hasFar && !hasNear
  if (fromFar && end) return { size: next, insets: shift(far, -grown) }
  if (!fromFar && !end) return { size: next, insets: shift(near, -grown) }
  return { size: next, insets: {} }
}
