/**
 * Where new designs go on the canvas: a new design to the right of everything, a component made from layers above
 * everything, and copies beside their originals in the first free space. The app measures the designs' boxes with the
 * canvas and passes them in.
 */

/** A box on the canvas, in page coordinates, as tldraw's bounds give one. */
export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** A design already on the canvas: its position in its document, and its box when the canvas has drawn it. */
export interface PlacedDesign {
  position: { x: number; y: number }
  bounds?: Bounds
}

/** The space copies of designs keep from everything else on the canvas, as far as a duplicate went before. */
export const designGap = 160

/** How wide a design counts as when the canvas hasn't drawn it yet, for a new design to clear it. */
const undrawnWidth = 1400

/** How far above the topmost design a component made from layers goes. */
const componentRise = 640

/**
 * Where copies of designs go: to the right of the originals, top-aligned with them, at the first place along that row
 * where they keep `gap` clear of everything else on the canvas. Returns the copies' new top-left corner.
 */
export function freeSpotBeside(original: Bounds, taken: readonly Bounds[], gap = designGap): { x: number; y: number } {
  const width = original.maxX - original.minX
  const height = original.maxY - original.minY
  const y = original.minY
  let x = original.maxX + gap
  for (;;) {
    const blocking = taken.filter(
      (other) =>
        other.minX < x + width + gap && other.maxX + gap > x && other.minY < y + height + gap && other.maxY + gap > y
    )
    if (blocking.length === 0) return { x, y }
    x = Math.max(...blocking.map((other) => other.maxX)) + gap
  }
}

/**
 * Where a new design goes: `gap` to the right of everything on the canvas, top-aligned with the topmost design's
 * position, in whole pixels. On an empty canvas, `gap` from the origin.
 */
export function rightOfEverything(designs: readonly PlacedDesign[], gap = 240): { x: number; y: number } {
  let right = 0
  let top = Infinity
  for (const design of designs) {
    right = Math.max(right, design.bounds ? design.bounds.maxX : design.position.x + undrawnWidth)
    top = Math.min(top, design.position.y)
  }
  return { x: Math.round(right + gap), y: Number.isFinite(top) ? top : 0 }
}

/**
 * Where a component made from a design's layers goes: above everything on the canvas, lined up with the design it
 * came from, so components sit on top and screens below.
 */
export function aboveEverything(
  from: { x: number; y: number },
  designs: readonly PlacedDesign[]
): { x: number; y: number } {
  let top = from.y
  for (const design of designs) top = Math.min(top, design.bounds?.minY ?? design.position.y)
  return { x: from.x, y: Math.round(top - componentRise) }
}
