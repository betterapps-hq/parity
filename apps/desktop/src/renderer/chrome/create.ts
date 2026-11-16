import { type MadeKind, resolveModes } from "@parity-app/core"
import { newDesign, rightOfEverything } from "@parity-app/editor"
import { addContainer, containerEntries } from "@parity-app/multiplayer"
import { canvasIdFor } from "../canvas/CanvasEditor.tsx"
import type { ProjectDesigns, ProjectSession } from "../workspace.ts"

/**
 * Adds an empty design to the project file and selects it: New screen and New component, from the menus, Search
 * actions, their keys and Layers' +. It goes to the right of everything, and the view zooms to it; given a point on
 * the page, as the canvas's right-click menu gives one, its top left goes there instead, already in view. What it
 * holds and where it goes are `@parity-app/editor`'s; this measures the designs on the canvas and applies it to the
 * document.
 */
export function createDesign(
  session: ProjectDesigns & Pick<ProjectSession, "editor">,
  kind: MadeKind = "screen",
  at?: { x: number; y: number }
): string {
  const { doc, editor } = session
  const entries = containerEntries(doc)

  const position =
    at ??
    rightOfEverything(
      entries.map((entry) => ({
        position: entry.container.position,
        bounds: editor?.getShapePageBounds(canvasIdFor(entry.key))
      }))
    )

  const viewport = resolveModes(doc.modes())[0]?.viewport

  const key = addContainer(
    doc,
    doc.main,
    newDesign(
      kind,
      entries.map((entry) => entry.container.id),
      { x: Math.round(position.x), y: Math.round(position.y) },
      { viewport }
    ),
    kind === "component" ? "New component" : "New screen"
  )

  session.selection.set({ design: key })

  if (at) {
    return key
  }

  setTimeout(() => {
    const bounds = session.editor?.getShapePageBounds(canvasIdFor(key))

    if (bounds) {
      session.editor?.zoomToBounds(bounds, { inset: 120, animation: { duration: 250 } })
    }
  }, 300)

  return key
}
