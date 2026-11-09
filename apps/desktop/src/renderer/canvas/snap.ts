import { snapBox } from "@parity-app/editor"
import type { Box, Editor } from "tldraw"
import type { Point } from "./hit.ts"
import type { CanvasId } from "./tldraw-names.ts"

/**
 * Snaps a shape being dragged to the shapes around it, Figma style, by `@parity-app/editor`'s `snapBox`, and shows
 * tldraw's snap lines where it locks. Returns the position to use. Callers ask `snaps` first, for the View menu's
 * preference and Ctrl.
 */
export function snapPosition(
  editor: Editor,
  id: CanvasId,
  position: Point,
  /** Shapes moving along with it, which it doesn't snap to. */
  moving: ReadonlySet<CanvasId> = new Set()
): Point {
  const dragged = editor.getShape(id)
  const own = editor.getShapePageBounds(id)

  if (!dragged || !own) {
    return position
  }

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
