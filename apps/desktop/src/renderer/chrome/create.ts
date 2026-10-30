import { type ContainerKind, resolveModes } from "@parity-app/core"
import { newDesign, rightOfEverything } from "@parity-app/editor"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import type { ProjectSession } from "../workspace.ts"

/**
 * Adds an empty design to the project file, to the right of everything, selects it and zooms to it. What it holds and
 * where it goes are `@parity-app/editor`'s; this measures the designs on the canvas and applies it to the store.
 */
export function createDesign(session: ProjectSession, kind: ContainerKind = "screen"): string {
  const { store, editor } = session
  const entries = store.getEntries()
  const position = rightOfEverything(
    entries.map((entry) => ({
      position: entry.container.position,
      bounds: editor?.getShapePageBounds(shapeIdFor(entry.key))
    }))
  )
  const viewport = resolveModes(store.getModes())[0]?.viewport
  const key = store.addContainer(
    store.mainPath,
    newDesign(
      kind,
      entries.map((entry) => entry.container.id),
      position,
      viewport
    ),
    kind === "component" ? "New component" : "New screen"
  )
  session.selection.set({ design: key })
  setTimeout(() => {
    const bounds = session.editor?.getShapePageBounds(shapeIdFor(key))
    if (bounds) session.editor?.zoomToBounds(bounds, { inset: 120, animation: { duration: 250 } })
  }, 300)
  return key
}
