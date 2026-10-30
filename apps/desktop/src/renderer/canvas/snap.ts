import { snapBox } from "@parity-app/editor"
import type { Box, Editor, TLShapeId } from "tldraw"
import { getPreferences } from "../chrome/preferences.ts"

/**
 * Snaps a shape being dragged to the shapes around it, Figma style, by `@parity-app/editor`'s `snapBox`, and shows
 * tldraw's snap lines where it locks. Returns the position to use. Turned off from the View menu, it moves freely.
 */
export function snapPosition(
  editor: Editor,
  id: TLShapeId,
  position: { x: number; y: number },
  /** Shapes moving along with it, which it doesn't snap to. */
  moving: ReadonlySet<TLShapeId> = new Set()
): { x: number; y: number } {
  if (!getPreferences().snapping) return position
  const shape = editor.getShape(id)
  const own = editor.getShapePageBounds(id)
  if (!shape || !own) return position
  const others = editor
    .getCurrentPageShapes()
    .filter((candidate) => candidate.id !== id && !moving.has(candidate.id))
    .map((candidate) => editor.getShapePageBounds(candidate.id))
    .filter((bounds): bounds is Box => !!bounds)
  const snapped = snapBox({ ...position, w: own.w, h: own.h }, others, editor.getZoomLevel())
  editor.snaps.setIndicators(
    snapped.guides.map((guide) => ({
      id: `snap-${guide.axis}`,
      type: "points" as const,
      points: [guide.from, guide.to]
    }))
  )
  return { x: snapped.x, y: snapped.y }
}

export function clearSnaps(editor: Editor): void {
  editor.snaps.clearIndicators()
}
