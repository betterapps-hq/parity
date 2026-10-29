import { type ContainerKind, uniqueId } from "@parity/core"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import { designGap, freeSpotBeside, takenBounds } from "../canvas/free-space.ts"
import type { ContainerEntry } from "../design-store.ts"
import type { ProjectSession } from "../workspace.ts"

export function renameDesign(session: ProjectSession, entry: ContainerEntry, name: string): void {
  const trimmed = name.trim()
  if (!trimmed || trimmed === entry.container.name) return
  session.store.updateContainer(entry.key, "Rename design", (container) => ({ ...container, name: trimmed }))
}

/**
 * Copies a design, states and all, into the same file, to the right of the original in the first free space along its
 * row, and selects the copy.
 */
export function duplicateDesign(session: ProjectSession, entry: ContainerEntry): string {
  const { store, editor } = session
  const taken = store.getEntries().map((candidate) => candidate.container.id)
  const name = `${entry.container.name} copy`
  const id = uniqueId(name, taken)
  const bounds = editor?.getShapePageBounds(shapeIdFor(entry.key))
  const x =
    editor && bounds
      ? freeSpotBeside(bounds, takenBounds(editor)).x + entry.container.position.x - bounds.minX
      : entry.container.position.x + 1400 + designGap
  const key = store.addContainer(
    entry.path,
    { ...structuredClone(entry.container), id, name, position: { x: Math.round(x), y: entry.container.position.y } },
    "Duplicate design"
  )
  session.selection.set({ design: key })
  return key
}

export function setDesignKind(session: ProjectSession, entry: ContainerEntry, kind: ContainerKind): void {
  session.store.updateContainer(entry.key, kind === "component" ? "Make component" : "Make screen", (container) => ({
    ...container,
    kind
  }))
}

export function deleteDesign(session: ProjectSession, entry: ContainerEntry): void {
  session.store.removeContainer(entry.key)
  session.selection.set({})
}
