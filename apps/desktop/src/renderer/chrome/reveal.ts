import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import { findFrames, nodeBox } from "../frame.ts"
import type { ProjectSession } from "../workspace.ts"

/**
 * Brings the selection into view without changing the zoom unless it has to: a design that's off screen is centered,
 * and a layer is scrolled to within its frame.
 */
export function revealSelection(session: ProjectSession): void {
  const editor = session.editor
  const { design, node, note } = session.selection.get()
  const key = note ?? design
  if (!editor || !key) return
  const shape = editor.getShape(shapeIdFor(key))
  if (!shape) return
  const viewport = editor.getViewportPageBounds()

  if (node && design) {
    const host = findFrames(editor.getContainer(), design).find((frame) => frame.dataset.primary === "true")
    const rect = host && nodeBox(host, node)
    if (rect) {
      const topLeft = editor.screenToPage({ x: rect.left, y: rect.top })
      const bottomRight = editor.screenToPage({ x: rect.right, y: rect.bottom })
      const inside =
        topLeft.x >= viewport.minX &&
        topLeft.y >= viewport.minY &&
        bottomRight.x <= viewport.maxX &&
        bottomRight.y <= viewport.maxY
      if (!inside) {
        editor.centerOnPoint(
          { x: (topLeft.x + bottomRight.x) / 2, y: (topLeft.y + bottomRight.y) / 2 },
          { animation: { duration: 250 } }
        )
      }
      return
    }
  }

  const bounds = editor.getShapePageBounds(shape)
  if (!bounds) return
  if (viewport.contains(bounds)) return
  if (bounds.width > viewport.width || bounds.height > viewport.height) {
    editor.zoomToBounds(bounds, { inset: 80, animation: { duration: 250 } })
  } else editor.centerOnPoint(bounds.center, { animation: { duration: 250 } })
}
