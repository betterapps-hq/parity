import { type ContainerKind, generateId, resolveModes, uniqueId } from "@parity-app/core"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import type { ProjectSession } from "../workspace.ts"

/** Where a new design goes: to the right of everything on the canvas, top-aligned with the first design. */
export function emptySpaceRight(session: ProjectSession, gap = 240): { x: number; y: number } {
  const editor = session.editor
  let right = 0
  let top = Infinity
  for (const entry of session.store.getEntries()) {
    const bounds = editor?.getShapePageBounds(shapeIdFor(entry.key))
    right = Math.max(right, bounds ? bounds.maxX : entry.container.position.x + 1400)
    top = Math.min(top, entry.container.position.y)
  }
  return { x: Math.round(right + gap), y: Number.isFinite(top) ? top : 0 }
}

/**
 * Adds an empty design to the project file, to the right of everything, and selects it. A component starts on a
 * narrower frame than a screen, since it's usually smaller than a page.
 */
export function createDesign(session: ProjectSession, kind: ContainerKind = "screen"): string {
  const existing = session.store.getEntries().map((entry) => entry.container.id)
  const name = kind === "component" ? "Untitled component" : "Untitled screen"
  const id = uniqueId(name, existing)
  const taken = new Set<string>()
  const rootId = generateId(taken)
  taken.add(rootId)
  const viewport = resolveModes(session.store.getModes())[0]?.viewport
  const key = session.store.addContainer(
    session.store.mainPath,
    {
      id,
      name,
      kind,
      position: emptySpaceRight(session),
      root:
        kind === "component"
          ? {
              type: "layout",
              id: rootId,
              name: "Root",
              style: { padding: 4, gap: 2 },
              children: [{ type: "text", id: generateId(taken), text: "Component" }]
            }
          : {
              type: "layout",
              id: rootId,
              name: "Page",
              style: { padding: [10, 12], gap: 6, background: "background", foreground: "foreground" },
              children: [
                {
                  type: "text",
                  id: generateId(taken),
                  tag: "h1",
                  text: name,
                  style: { size: "text-2xl", weight: 600 }
                }
              ]
            },
      states: [{ id: "default", name: "Default" }],
      ...(kind === "component" && viewport ? { frames: { [viewport]: { width: 480 } } } : {})
    },
    kind === "component" ? "New component" : "New screen"
  )
  session.selection.set({ design: key })
  setTimeout(() => {
    const bounds = session.editor?.getShapePageBounds(shapeIdFor(key))
    if (bounds) session.editor?.zoomToBounds(bounds, { inset: 120, animation: { duration: 250 } })
  }, 300)
  return key
}
