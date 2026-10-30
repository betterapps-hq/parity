/**
 * Snapping a design being dragged on the canvas to the designs around it, Figma style: its left, centre or right lines
 * up with another's left, centre or right when they come close, and likewise top, middle and bottom. The canvas passes
 * the boxes in and draws the guides that come back.
 */

/** How close, in screen pixels, an edge or centre has to come to another's to lock to it. */
export const snapDistance = 8

/** A box on the canvas, in page coordinates: its top left, width and height, as tldraw's `Box` has them. */
export interface SnapBox {
  x: number
  y: number
  w: number
  h: number
}

/** A line to draw where a box locked, in page coordinates, along one axis: `x` is a vertical line, `y` a horizontal one. */
export interface SnapGuide {
  axis: "x" | "y"
  from: { x: number; y: number }
  to: { x: number; y: number }
}

export interface Snapped {
  /** Where the box goes. */
  x: number
  y: number
  /** A guide for each axis it locked along, spanning it and the box it locked to. */
  guides: SnapGuide[]
}

/**
 * Where a box being dragged to `box`'s position goes, snapped to `others`: along each axis, the nearest of its three
 * lines (start, centre, end) to any of theirs, within `snapDistance` screen pixels at `zoom`. Of lines just as near, the
 * first box's comes first. An axis with nothing near stays where it is.
 */
export function snapBox(box: SnapBox, others: readonly SnapBox[], zoom: number): Snapped {
  const threshold = snapDistance / zoom
  const best = (mine: number[], theirs: (other: SnapBox) => number[]) => {
    let found: { delta: number; line: number; other: SnapBox } | undefined
    for (const other of others) {
      for (const line of theirs(other)) {
        for (const edge of mine) {
          const delta = line - edge
          if (Math.abs(delta) <= threshold && (!found || Math.abs(delta) < Math.abs(found.delta))) {
            found = { delta, line, other }
          }
        }
      }
    }
    return found
  }
  // A box's start, centre and end along an axis.
  const lines = (start: number, size: number) => [start, start + size / 2, start + size]
  const x = best(lines(box.x, box.w), (other) => lines(other.x, other.w))
  const y = best(lines(box.y, box.h), (other) => lines(other.y, other.h))
  const snapped = { x: box.x + (x?.delta ?? 0), y: box.y + (y?.delta ?? 0) }

  const guides: SnapGuide[] = []
  if (x) {
    const top = Math.min(snapped.y, x.other.y)
    const bottom = Math.max(snapped.y + box.h, x.other.y + x.other.h)
    guides.push({ axis: "x", from: { x: x.line, y: top }, to: { x: x.line, y: bottom } })
  }
  if (y) {
    const left = Math.min(snapped.x, y.other.x)
    const right = Math.max(snapped.x + box.w, y.other.x + y.other.w)
    guides.push({ axis: "y", from: { x: left, y: y.line }, to: { x: right, y: y.line } })
  }
  return { ...snapped, guides }
}
