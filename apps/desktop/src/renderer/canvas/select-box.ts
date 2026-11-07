import { childNodes } from "@parity-app/core"
import { nodeBox } from "../frame.ts"
import type { ProjectSession } from "../workspace.ts"
import { followPress, gestures } from "./gesture.ts"
import type { Hit } from "./hit.ts"
import { boardClick, boxSelection, touchedBy } from "./pick.ts"

/**
 * Follows a press on a frame's background, where no layer is. Released where it was pressed, it selects the board (or
 * with Shift adds it to the selected designs, or takes it out). Dragged, it draws a box, tldraw's own, and selects the
 * frame's top-level layers it touches as it goes, other than locked ones, adding them to the selection with Shift. Escape, the pointer
 * cancelled or the window losing focus puts back what was selected before (see `gestures.boxSelect`). The board never
 * moves: it's moved by its title or its background around the frames.
 */
export function pressBackground(session: ProjectSession, start: PointerEvent, hit: Hit): void {
  const { selection, editor } = session
  const before = selection.get()
  const design = hit.entry.key
  const frame = { mode: hit.mode, state: hit.state }
  // A locked layer isn't touched by the box (PAR-192).
  const layers = childNodes(hit.entry.container.root).flatMap((node) => (node.locked ? [] : [node.id]))

  followPress(gestures.boxSelect, session.store, start, {
    move(event) {
      const box = {
        left: Math.min(start.clientX, event.clientX),
        top: Math.min(start.clientY, event.clientY),
        right: Math.max(start.clientX, event.clientX),
        bottom: Math.max(start.clientY, event.clientY)
      }
      if (editor) {
        const from = editor.screenToPage({ x: box.left, y: box.top })
        const to = editor.screenToPage({ x: box.right, y: box.bottom })
        editor.updateInstanceState({ brush: { x: from.x, y: from.y, w: to.x - from.x, h: to.y - from.y } })
      }
      // Measured on every move, since the camera can move while the box is drawn.
      const boxes = layers.flatMap((id) => {
        const rect = nodeBox(hit.host, id)
        return rect ? [{ id, box: rect }] : []
      })
      selection.set(boxSelection(before, design, frame, touchedBy(box, boxes), event.shiftKey))
    },
    end(kept) {
      editor?.updateInstanceState({ brush: null })
      if (!kept) selection.set(before)
    },
    click: () => selection.set(boardClick(before, design, start.shiftKey))
  })
}
