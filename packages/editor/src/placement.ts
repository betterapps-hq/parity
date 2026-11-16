import type { Point } from "./drop-slot.ts"

/**
 * Where new designs go on the canvas: a new design to the right of everything, a component made from layers above
 * everything, and copies beside their originals in the first free space, panning to them when they land off screen.
 * The app measures the designs' boxes and the view with the canvas and passes them in.
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
export function freeSpotBeside(original: Bounds, taken: readonly Bounds[], gap = designGap): Point {
  const width = original.maxX - original.minX
  const height = original.maxY - original.minY
  const y = original.minY
  let x = original.maxX + gap

  for (;;) {
    const blocking = taken.filter(
      (other) =>
        other.minX < x + width + gap && other.maxX + gap > x && other.minY < y + height + gap && other.maxY + gap > y
    )

    if (blocking.length === 0) {
      return { x, y }
    }

    x = Math.max(...blocking.map((other) => other.maxX)) + gap
  }
}

/**
 * Where a new design goes: `gap` to the right of everything on the canvas, top-aligned with the topmost design's
 * position, in whole pixels. On an empty canvas, `gap` from the origin.
 */
export function rightOfEverything(designs: readonly PlacedDesign[], gap = 240): Point {
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
export function aboveEverything(from: Point, designs: readonly PlacedDesign[]): Point {
  let top = from.y

  for (const design of designs) {
    top = Math.min(top, design.bounds?.minY ?? design.position.y)
  }

  return { x: from.x, y: Math.round(top - componentRise) }
}

/** Where pasted copies of designs go, and the box they take there, when it's known before the canvas draws them. */
export interface PastedPlacement {
  /** How far the copies move from their originals' positions. */
  shift: { x: number; y: number }
  /** Where they land, in page coordinates, to bring into view; undefined until the canvas has drawn them. */
  shown?: Bounds
}

/**
 * Where pasted copies of `designs` go. When each original is on this canvas, drawn (`bounds`), the copies sit to the
 * right of them, top-aligned, in the first free space along their row (see `freeSpotBeside`), and are the originals'
 * size. Otherwise, as when they come from another project, their top left goes to `center`, the middle of the view,
 * and their size is only known once the canvas draws them, so `shown` is left out rather than guessed.
 */
export function pastedPlacement(
  designs: readonly PlacedDesign[],
  center: { x: number; y: number },
  taken: readonly Bounds[]
): PastedPlacement {
  const drawn = designs.flatMap((design) => design.bounds ?? [])

  if (designs.length === 0 || drawn.length < designs.length) {
    const left = Math.min(...designs.map((design) => design.position.x))
    const top = Math.min(...designs.map((design) => design.position.y))

    return { shift: designs.length === 0 ? { x: 0, y: 0 } : { x: center.x - left, y: center.y - top } }
  }

  const around = {
    minX: Math.min(...drawn.map((box) => box.minX)),
    minY: Math.min(...drawn.map((box) => box.minY)),
    maxX: Math.max(...drawn.map((box) => box.maxX)),
    maxY: Math.max(...drawn.map((box) => box.maxY))
  }

  const spot = freeSpotBeside(around, taken)
  const shift = { x: spot.x - around.minX, y: 0 }

  return {
    shift,
    shown: { minX: around.minX + shift.x, minY: around.minY, maxX: around.maxX + shift.x, maxY: around.maxY }
  }
}

/** Screen pixels a design brought into view keeps from the canvas's edges, room for its title above it. */
export const viewMargin = 64

/**
 * How far to move the view, in page units, so `target` is seen in it with `margin` clear (PAR-204): nothing when it's in
 * view already; otherwise the least move along each axis that brings it in, so what was in view stays as near as it
 * can. Along an axis where it's larger than the view, its start being in view is enough, where its title is; else its
 * start comes to the view's start.
 */
export function panToShow(view: Bounds, target: Bounds, margin = 0): { x: number; y: number } | undefined {
  const along = (viewMin: number, viewMax: number, min: number, max: number) => {
    // Too large to fit: its start in view is enough, else it comes to the view's start.
    if (max - min + 2 * margin > viewMax - viewMin) {
      return min - margin < viewMin || min + margin > viewMax ? min - margin - viewMin : 0
    }

    if (min - margin < viewMin) {
      return min - margin - viewMin
    }

    if (max + margin > viewMax) {
      return max + margin - viewMax
    }

    return 0
  }

  const x = along(view.minX, view.maxX, target.minX, target.maxX)
  const y = along(view.minY, view.maxY, target.minY, target.maxY)

  return x === 0 && y === 0 ? undefined : { x, y }
}
