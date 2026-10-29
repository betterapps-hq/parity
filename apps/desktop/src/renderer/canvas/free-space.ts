import type { Editor } from "tldraw"

/** A box on the canvas, in page coordinates, as tldraw's bounds give one. */
export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** The space copies of designs keep from everything else on the canvas, as far as a duplicate went before. */
export const designGap = 160

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

/** Everything on the canvas page: designs and notes. */
export function takenBounds(editor: Editor): Bounds[] {
  return editor.getCurrentPageShapes().flatMap((shape) => editor.getShapePageBounds(shape) ?? [])
}
