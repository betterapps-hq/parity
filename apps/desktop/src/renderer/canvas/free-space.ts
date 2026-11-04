import { type Bounds, panToShow, viewMargin } from "@parity-app/editor"
import type { Editor } from "tldraw"

/** Everything on the canvas page, designs and notes, for copies of designs to keep clear of (`freeSpotBeside`). */
export function takenBounds(editor: Editor): Bounds[] {
  return editor.getCurrentPageShapes().flatMap((shape) => editor.getShapePageBounds(shape) ?? [])
}

/**
 * Pans the canvas, at the zoom it's at, so designs just placed at `target` (page coordinates) are seen, as a duplicate
 * or a pasted design that lands off screen is (PAR-204). Leaves the view alone when they're in it already.
 */
export function bringIntoView(editor: Editor, target: Bounds): void {
  const view = editor.getViewportPageBounds()
  const camera = editor.getCamera()
  const shift = panToShow(view, target, viewMargin / camera.z)
  if (!shift) return
  editor.setCamera({ x: camera.x - shift.x, y: camera.y - shift.y, z: camera.z }, { animation: { duration: 250 } })
}
