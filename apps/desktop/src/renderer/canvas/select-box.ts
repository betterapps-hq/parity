import { childNodes } from "@parity/core"
import { nodeBox } from "../frame.ts"
import type { ProjectSession } from "../workspace.ts"
import type { Hit } from "./hit.ts"
import { boardClick, boxSelection, touchedBy } from "./pick.ts"

/** How far, in screen pixels, the pointer goes before a press becomes a box, as before a layer's press becomes a drag. */
const threshold = 4

/**
 * Follows a press on a frame's background, where no layer is. Released where it was pressed, it selects the board (or
 * with Shift adds it to the selected designs, or takes it out). Dragged, it draws a box, tldraw's own, and selects the
 * frame's top-level layers it touches as it goes, adding them to the selection with Shift. Escape puts back what was
 * selected before. The board never moves: it's moved by its title or its background around the frames.
 */
export function pressBackground(session: ProjectSession, start: PointerEvent, hit: Hit): void {
  const { selection, editor } = session
  const before = selection.get()
  const design = hit.entry.key
  const frame = { mode: hit.mode, state: hit.state }
  const layers = childNodes(hit.entry.container.root).map((node) => node.id)
  let boxing = false

  const onMove = (event: PointerEvent) => {
    const dx = event.clientX - start.clientX
    const dy = event.clientY - start.clientY
    if (!boxing && Math.hypot(dx, dy) < threshold) return
    boxing = true
    event.preventDefault()
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
  }
  const finish = (done: boolean) => {
    window.removeEventListener("pointermove", onMove, true)
    window.removeEventListener("pointerup", onUp, true)
    window.removeEventListener("pointercancel", onCancel, true)
    window.removeEventListener("keydown", onKey, true)
    editor?.updateInstanceState({ brush: null })
    if (!boxing) {
      if (done) selection.set(boardClick(before, design, start.shiftKey))
      return
    }
    if (!done) selection.set(before)
  }
  const onUp = () => finish(true)
  const onCancel = () => finish(false)
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    event.stopImmediatePropagation()
    finish(false)
  }
  window.addEventListener("pointermove", onMove, true)
  window.addEventListener("pointerup", onUp, true)
  window.addEventListener("pointercancel", onCancel, true)
  window.addEventListener("keydown", onKey, true)
}
