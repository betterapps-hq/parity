import type { Box, Editor, TLShapeId } from "tldraw"
import { getPreferences } from "../chrome/preferences.ts"

/** How close, in screen pixels, an edge or center has to come to another's to lock to it. */
const snapDistance = 8

interface Snapped {
  x: number
  y: number
}

/**
 * Snaps a shape being dragged to the shapes around it, Figma style: its left, center or right lines up with another's
 * left, center or right when they come close, and likewise top, middle and bottom. Shows tldraw's snap lines where
 * they lock. Returns the position to use. Turned off from the View menu, it moves freely.
 */
export function snapPosition(
  editor: Editor,
  id: TLShapeId,
  position: { x: number; y: number },
  /** Shapes moving along with it, which it doesn't snap to. */
  moving: ReadonlySet<TLShapeId> = new Set()
): Snapped {
  if (!getPreferences().snapping) return position
  const shape = editor.getShape(id)
  const own = editor.getShapePageBounds(id)
  if (!shape || !own) return position
  const width = own.width
  const height = own.height
  const others = editor
    .getCurrentPageShapes()
    .filter((candidate) => candidate.id !== id && !moving.has(candidate.id))
    .map((candidate) => editor.getShapePageBounds(candidate.id))
    .filter((bounds): bounds is Box => !!bounds)
  const threshold = snapDistance / editor.getZoomLevel()

  const best = (mine: number[], theirs: (bounds: Box) => number[]) => {
    let found: { delta: number; line: number; other: Box } | undefined
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
  const x = best([position.x, position.x + width / 2, position.x + width], (box) => [box.minX, box.midX, box.maxX])
  const y = best([position.y, position.y + height / 2, position.y + height], (box) => [box.minY, box.midY, box.maxY])
  const snapped = { x: position.x + (x?.delta ?? 0), y: position.y + (y?.delta ?? 0) }

  const indicators = []
  if (x) {
    const top = Math.min(snapped.y, x.other.minY)
    const bottom = Math.max(snapped.y + height, x.other.maxY)
    indicators.push({
      id: "snap-x",
      type: "points" as const,
      points: [
        { x: x.line, y: top },
        { x: x.line, y: bottom }
      ]
    })
  }
  if (y) {
    const left = Math.min(snapped.x, y.other.minX)
    const right = Math.max(snapped.x + width, y.other.maxX)
    indicators.push({
      id: "snap-y",
      type: "points" as const,
      points: [
        { x: left, y: y.line },
        { x: right, y: y.line }
      ]
    })
  }
  editor.snaps.setIndicators(indicators)
  return snapped
}

export function clearSnaps(editor: Editor): void {
  editor.snaps.clearIndicators()
}
