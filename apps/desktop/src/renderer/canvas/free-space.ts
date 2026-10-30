import type { Bounds } from "@parity-app/editor"
import type { Editor } from "tldraw"

/** Everything on the canvas page, designs and notes, for copies of designs to keep clear of (`freeSpotBeside`). */
export function takenBounds(editor: Editor): Bounds[] {
  return editor.getCurrentPageShapes().flatMap((shape) => editor.getShapePageBounds(shape) ?? [])
}
