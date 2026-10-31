import { toggleHidden } from "@parity-app/core"
import {
  alignBoxes,
  alignInLayouts,
  type Alignment,
  copyLayersInPlace,
  type DesignBox,
  distributeBoxes,
  type Order,
  removeDesigns,
  removeLayers,
  reorderLayer,
  repositionDesigns,
  siblingsOf,
  topLayers,
  unwrapLayout,
  wrapInLayout
} from "@parity-app/editor"
import { toast } from "sonner"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import { frameViewport } from "../canvas/view.ts"
import type { ContainerEntry } from "../design-store.ts"
import { designsSelection, layersSelection, selectedDesigns, selectedNodes } from "../selection.ts"
import type { ProjectSession } from "../workspace.ts"
import { editingState } from "./LayerPanel.tsx"

/**
 * What acts on several layers or designs at once: deleting, duplicating, selecting all, wrapping in a layout, ordering,
 * hiding, aligning and distributing. Each is one undo step, however many things it touches. The rules are
 * `@parity-app/editor`'s; this applies them to the selection and the store.
 */

/** The design the selected layers are in, with their ids, outermost first. Undefined unless layers are selected. */
export function selectedLayers(session: ProjectSession): { entry: ContainerEntry; ids: string[] } | undefined {
  const current = session.selection.get()
  const entry = current.design ? session.store.getEntry(current.design) : undefined
  const ids = selectedNodes(current)
  if (!entry || ids.length === 0) return undefined
  const top = topLayers(entry.container, ids)
  return top.length > 0 ? { entry, ids: top } : undefined
}

export function deleteLayers(session: ProjectSession): boolean {
  const layers = selectedLayers(session)
  if (!layers) return false
  const { entry, ids } = layers
  let parent: string | undefined
  session.store.updateContainer(
    entry.key,
    ids.length === 1 ? "Delete layer" : `Delete ${ids.length} layers`,
    (container) => {
      const removed = removeLayers(container, ids)
      parent = removed.parent
      return removed.container
    }
  )
  const current = session.selection.get()
  session.selection.set(parent ? layersSelection(entry.key, [parent], current) : { design: entry.key })
  return true
}

/** Copies each selected layer in place, just after itself, and selects the copies. */
export function duplicateLayers(session: ProjectSession): boolean {
  const layers = selectedLayers(session)
  if (!layers) return false
  const { entry, ids } = layers
  let copies: string[] = []
  session.store.updateContainer(
    entry.key,
    ids.length === 1 ? "Duplicate layer" : `Duplicate ${ids.length} layers`,
    (container) => {
      const copied = copyLayersInPlace(container, ids)
      copies = copied.copies
      return copied.container
    }
  )
  session.selection.set(layersSelection(entry.key, copies, session.selection.get()))
  return copies.length > 0
}

export function deleteDesigns(session: ProjectSession): boolean {
  const keys = selectedDesigns(session.selection.get())
  const entries = keys.flatMap((key) => session.store.getEntry(key) ?? [])
  if (entries.length === 0) return false
  session.store.change(entries.length === 1 ? "Delete design" : `Delete ${entries.length} designs`, (snapshot) => ({
    ...snapshot,
    documents: removeDesigns(
      snapshot.documents,
      entries.map((entry) => ({ path: entry.path, id: entry.container.id }))
    )
  }))
  session.selection.set({})
  return true
}

/** Ctrl+A: the selected layer and its siblings, or every design. */
export function selectAll(session: ProjectSession): void {
  const { store, selection } = session
  const current = selection.get()
  const entry = current.design ? store.getEntry(current.design) : undefined
  if (entry && current.node) {
    const siblings = siblingsOf(entry.container.root, current.node)
    if (siblings) selection.set(layersSelection(entry.key, siblings, current))
    return
  }
  selection.set(designsSelection(store.getEntries().map((candidate) => candidate.key)))
}

/** Puts the selected layers in a new layout, laid out the way their parent lays them out, and selects it. */
export function wrapLayers(session: ProjectSession): boolean {
  const layers = selectedLayers(session)
  if (!layers) return false
  const { entry, ids } = layers
  const current = session.selection.get()
  const state = editingState(entry.container, current.state)
  const viewport = frameViewport(session.store.getModes(), current.mode)
  let id: string | undefined
  try {
    session.store.updateContainer(entry.key, "Wrap in layout", (container) => {
      const wrapped = wrapInLayout(container, ids, state, viewport)
      id = wrapped.id
      return wrapped.container
    })
  } catch (error) {
    toast.info(error instanceof Error ? error.message : String(error))
    return false
  }
  if (!id) return false
  session.selection.set(layersSelection(entry.key, [id], current))
  return true
}

/** Takes the selected layout away, leaving its layers where it was. */
export function unwrapLayer(session: ProjectSession): boolean {
  const layers = selectedLayers(session)
  if (!layers || layers.ids.length !== 1) return false
  const { entry, ids } = layers
  let children: string[] | undefined
  session.store.updateContainer(entry.key, "Unwrap layout", (container) => {
    const unwrapped = unwrapLayout(container, ids[0]!)
    children = unwrapped?.children
    return unwrapped?.container ?? container
  })
  if (!children) {
    toast.info("Select a layout to unwrap it")
    return false
  }
  session.selection.set(layersSelection(entry.key, children, session.selection.get()))
  return true
}

const orderLabels: Record<Order, string> = {
  forward: "Bring forward",
  backward: "Send backward",
  front: "Bring to front",
  back: "Send to back"
}

/** Moves the selected layer among its siblings: forward is later in its layout, and down the Layers list. */
export function orderLayer(session: ProjectSession, order: Order): boolean {
  const layers = selectedLayers(session)
  if (!layers || layers.ids.length !== 1) return false
  const { entry, ids } = layers
  let moved = false
  session.store.updateContainer(entry.key, orderLabels[order], (container) => {
    const next = reorderLayer(container, ids[0]!, order)
    moved = next !== container
    return next
  })
  return moved
}

/** Hides the selected layers in the state being edited, or shows them again when they're all hidden. */
export function toggleHiddenLayers(session: ProjectSession): boolean {
  const layers = selectedLayers(session)
  if (!layers) return false
  const { entry, ids } = layers
  const picked = session.selection.get().state
  session.store.updateContainer(entry.key, "Toggle visibility", (container) =>
    toggleHidden(container, editingState(container, picked).id, ids)
  )
  return true
}

/**
 * Aligns the selection. Designs line up on the canvas by their edges or centers. Layers in a layout align on their
 * parent's cross axis by themselves; along its main axis, the parent moves all its children together.
 */
export function align(session: ProjectSession, alignment: Alignment): void {
  const layers = selectedLayers(session)
  if (layers) {
    const current = session.selection.get()
    const state = editingState(layers.entry.container, current.state)
    const viewport = frameViewport(session.store.getModes(), current.mode)
    session.store.updateContainer(layers.entry.key, "Align", (container) =>
      alignInLayouts(container, layers.ids, state, alignment, viewport)
    )
    return
  }
  const moves = alignBoxes(designBoxes(session), alignment)
  if (moves.size > 0) moveDesigns(session, moves, "Align designs")
}

/** Spaces three or more designs evenly between the outermost two. */
export function distribute(session: ProjectSession, axis: "horizontal" | "vertical"): void {
  const moves = distributeBoxes(designBoxes(session), axis)
  if (moves.size > 0) moveDesigns(session, moves, "Distribute designs")
}

/** The selected designs' boxes on the canvas. */
function designBoxes(session: ProjectSession): DesignBox[] {
  return selectedDesigns(session.selection.get()).flatMap((key) => {
    const entry = session.store.getEntry(key)
    const bounds = entry ? session.editor?.getShapePageBounds(shapeIdFor(key)) : undefined
    return entry && bounds
      ? [
          {
            key,
            position: entry.container.position,
            minX: bounds.minX,
            maxX: bounds.maxX,
            minY: bounds.minY,
            maxY: bounds.maxY
          }
        ]
      : []
  })
}

/** Moves designs to new positions as one undo step. */
export function moveDesigns(
  session: ProjectSession,
  moves: ReadonlyMap<string, { x: number; y: number }>,
  label: string,
  group?: string
): void {
  const { store } = session
  store.change(
    label,
    (snapshot) => {
      const documents = repositionDesigns(
        snapshot.documents,
        [...moves].flatMap(([key, position]) => {
          const entry = store.getEntry(key)
          return entry ? [{ path: entry.path, id: entry.container.id, position }] : []
        })
      )
      return documents === snapshot.documents ? snapshot : { ...snapshot, documents }
    },
    group ? { group } : {}
  )
}
