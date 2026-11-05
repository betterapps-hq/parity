import { type ContainerKind, resolveModes } from "@parity-app/core"
import { newDesign, rightOfEverything } from "@parity-app/editor"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import type { ProjectSession } from "../workspace.ts"

/**
 * Adds an empty design to the project file and selects it: New screen and New component, from the menus, Search
 * actions, their keys and Layers' +. It goes to the right of everything, and the view zooms to it; given a point on
 * the page, as the canvas's right-click menu gives one, its top left goes there instead, already in view. What it
 * holds and where it goes are `@parity-app/editor`'s; this measures the designs on the canvas and applies it to the
 * store.
 */
export function createDesign(
  session: ProjectSession,
  kind: ContainerKind = "screen",
  at?: { x: number; y: number }
): string {
  const { store, editor } = session
  const entries = store.getEntries()
  const position =
    at ??
    rightOfEverything(
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
      { x: Math.round(position.x), y: Math.round(position.y) },
      { viewport }
    ),
    kind === "component" ? "New component" : "New screen"
  )
  session.selection.set({ design: key })
  if (at) return key
  setTimeout(() => {
    const bounds = session.editor?.getShapePageBounds(shapeIdFor(key))
    if (bounds) session.editor?.zoomToBounds(bounds, { inset: 120, animation: { duration: 250 } })
  }, 300)
  return key
}
