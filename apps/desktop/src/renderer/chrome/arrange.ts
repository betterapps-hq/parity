import { toggleHidden } from "@parity-app/core"
import {
  alignBoxes,
  alignInLayouts,
  type Alignment,
  copyLayersInPlace,
  deleteDesign,
  type DesignBox,
  designsLocked,
  distributeBoxes,
  kindsName,
  layersLocked,
  lockableIds,
  type Order,
  removeLayers,
  reorderLayer,
  repositionDesigns,
  setDesignLocked,
  siblingsOf,
  toggleLockedLayers,
  topLayers,
  unwrapLayout,
  wrapInLayout,
  type EditFrame,
  designsSelection,
  layersSelection,
  selectedDesigns,
  selectedNodes
} from "@parity-app/editor"
import {
  type ContainerEntry,
  changeSnapshot,
  containerEntries,
  containerEntry,
  designsLabel,
  editFrame,
  type ProjectDoc,
  updateContainer,
  updateContainers
} from "@parity-app/multiplayer"
import { canvasIdFor } from "../canvas/CanvasEditor.tsx"
import { reportError } from "../report-error.ts"
import { notify } from "../toasts.tsx"
import type { ProjectDesigns, ProjectSession } from "../workspace.ts"

/**
 * What acts on several layers or designs at once: deleting, duplicating, selecting all, wrapping in a layout, ordering,
 * hiding, aligning and distributing. Each is one undo step, however many things it touches. The rules are
 * `@parity-app/editor`'s; this applies them to the selection and the document.
 */

/** The design the selected layers are in, with their ids, outermost first. Undefined unless layers are selected. */
export function selectedLayers(
  session: ProjectDesigns
): { entry: ContainerEntry; ids: string[]; frame: EditFrame } | undefined {
  const current = session.selection.get()
  const entry = current.design ? containerEntry(session.doc, current.design) : undefined
  const frame = editFrame(session.doc, current)
  const ids = selectedNodes(current)

  if (!entry || !frame || ids.length === 0) {
    return undefined
  }

  const top = topLayers(entry.container, ids)

  return top.length > 0 ? { entry, ids: top, frame } : undefined
}

export function deleteLayers(session: ProjectDesigns): boolean {
  const layers = selectedLayers(session)

  if (!layers) {
    return false
  }

  const { entry, ids } = layers
  let parent: string | undefined
  updateContainer(
    session.doc,
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
export function duplicateLayers(session: ProjectDesigns): boolean {
  const layers = selectedLayers(session)

  if (!layers) {
    return false
  }

  const { entry, ids } = layers
  let copies: string[] = []
  updateContainer(
    session.doc,
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

export function deleteDesigns(session: ProjectDesigns): boolean {
  const keys = selectedDesigns(session.selection.get())
  const entries = keys.flatMap((key) => containerEntry(session.doc, key) ?? [])

  if (entries.length === 0) {
    return false
  }

  changeSnapshot(session.doc, `Delete ${kindsName(entries.map((entry) => entry.container.kind))}`, (snapshot) =>
    deleteDesign(snapshot, ...entries.map((entry) => ({ path: entry.path, id: entry.container.id })))
  )
  session.selection.set({})

  return true
}

/** Ctrl+A: the selected layer and its siblings, or every design, of those `drawn` keeps, as the canvas in focus draws. */
export function selectAll(session: ProjectDesigns, drawn: (key: string) => boolean = () => true): void {
  const { doc, selection } = session
  const current = selection.get()
  const entry = current.design ? containerEntry(doc, current.design) : undefined

  // Layers of a design another lens's canvas draws, kept selected as the lens changed, count as nothing selected here.
  if (entry && current.node && drawn(entry.key)) {
    const siblings = siblingsOf(entry.container.root, current.node)

    if (siblings) {
      selection.set(layersSelection(entry.key, siblings, current))
    }

    return
  }

  selection.set(designsSelection(containerEntries(doc).flatMap(({ key }) => (drawn(key) ? [key] : []))))
}

/** Puts the selected layers in a new layout, laid out the way their parent lays them out, and selects it. */
export function wrapLayers(session: ProjectDesigns): boolean {
  const layers = selectedLayers(session)

  if (!layers) {
    return false
  }

  const { entry, ids } = layers
  const { state, viewport } = layers.frame
  let id: string | undefined

  try {
    updateContainer(session.doc, entry.key, "Wrap in layout", (container) => {
      const wrapped = wrapInLayout(container, ids, state, viewport)
      id = wrapped.id

      return wrapped.container
    })
  } catch (error) {
    reportError(error, { operation: "layers.wrap", title: "Couldn't wrap these layers" })

    return false
  }

  if (!id) {
    return false
  }

  session.selection.set(layersSelection(entry.key, [id], session.selection.get()))

  return true
}

/** Takes the selected layout away, leaving its layers where it was. */
export function unwrapLayer(session: ProjectDesigns): boolean {
  const layers = selectedLayers(session)

  if (!layers || layers.ids.length !== 1) {
    return false
  }

  const { entry, ids } = layers
  let children: string[] | undefined
  updateContainer(session.doc, entry.key, "Unwrap layout", (container) => {
    const unwrapped = unwrapLayout(container, ids[0]!)
    children = unwrapped?.children

    return unwrapped?.container ?? container
  })

  if (!children) {
    notify.info("Select a layout to unwrap it")

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
export function orderLayer(session: ProjectDesigns, order: Order): boolean {
  const layers = selectedLayers(session)

  if (!layers || layers.ids.length !== 1) {
    return false
  }

  const { entry, ids } = layers
  let moved = false
  updateContainer(session.doc, entry.key, orderLabels[order], (container) => {
    const next = reorderLayer(container, ids[0]!, order)
    moved = next !== container

    return next
  })

  return moved
}

/** Hides the selected layers in the state being edited, or shows them again when they're all hidden. */
export function toggleHiddenLayers(session: ProjectDesigns): boolean {
  const layers = selectedLayers(session)

  if (!layers) {
    return false
  }

  const { entry, ids, frame } = layers
  updateContainer(session.doc, entry.key, "Toggle visibility", (container) =>
    toggleHidden(container, frame.state.id, ids)
  )

  return true
}

/**
 * Locks the selected layers, or the selected designs, or unlocks them when they're all locked (PAR-192). Layers inside
 * an instance and the design's root are left alone (see `lockableIds`); the selection stays, so it can be unlocked.
 */
export function toggleLockedSelection(session: ProjectDesigns): boolean {
  const layers = selectedLayers(session)

  if (layers) {
    const { entry, ids } = layers
    const own = lockableIds(entry.container, ids)

    if (own.length === 0) {
      return false
    }

    const label = `${layersLocked(entry.container, own) ? "Unlock" : "Lock"} ${own.length === 1 ? "layer" : "layers"}`
    updateContainer(session.doc, entry.key, label, (container) => toggleLockedLayers(container, own))

    return true
  }

  const keys = selectedDesigns(session.selection.get())
  const entries = keys.flatMap((key) => containerEntry(session.doc, key) ?? [])

  if (entries.length === 0) {
    return false
  }

  const lock = !designsLocked(entries.map((entry) => entry.container))
  const label = `${lock ? "Lock" : "Unlock"} ${designsLabel(session.doc, keys)}`
  updateContainers(
    session.doc,
    entries.map((entry) => entry.key),
    label,
    (containers) => containers.map((container) => setDesignLocked(container, lock))
  )

  return true
}

/**
 * Aligns the selection. Designs line up on the canvas by their edges or centers. Layers in a layout align on their
 * parent's cross axis by themselves; along its main axis, the parent moves all its children together.
 */
export function align(session: ProjectDesigns & Pick<ProjectSession, "editor">, alignment: Alignment): void {
  const layers = selectedLayers(session)

  if (layers) {
    const { state, viewport } = layers.frame
    updateContainer(session.doc, layers.entry.key, "Align", (container) =>
      alignInLayouts(container, layers.ids, state, alignment, viewport)
    )

    return
  }

  const moves = alignBoxes(designBoxes(session), alignment)
  const selected = selectedDesigns(session.selection.get())

  if (moves.size > 0) {
    moveDesigns(session.doc, moves, `Align ${designsLabel(session.doc, selected)}`)
  }
}

/** Spaces three or more designs evenly between the outermost two. */
export function distribute(
  session: ProjectDesigns & Pick<ProjectSession, "editor">,
  axis: "horizontal" | "vertical"
): void {
  const moves = distributeBoxes(designBoxes(session), axis)
  const selected = selectedDesigns(session.selection.get())

  if (moves.size > 0) {
    moveDesigns(session.doc, moves, `Distribute ${designsLabel(session.doc, selected)}`)
  }
}

/** The selected designs' boxes on the canvas. */
function designBoxes(session: ProjectDesigns & Pick<ProjectSession, "editor">): DesignBox[] {
  return selectedDesigns(session.selection.get()).flatMap((key) => {
    const entry = containerEntry(session.doc, key)
    const bounds = entry ? session.editor?.getShapePageBounds(canvasIdFor(key)) : undefined

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
  doc: ProjectDoc,
  moves: ReadonlyMap<string, { x: number; y: number }>,
  label: string
): void {
  changeSnapshot(doc, label, (snapshot) => {
    const documents = repositionDesigns(
      snapshot.documents,
      [...moves].flatMap(([key, position]) => {
        const entry = containerEntry(doc, key)

        return entry ? [{ path: entry.path, id: entry.container.id, position }] : []
      })
    )

    return documents === snapshot.documents ? snapshot : { ...snapshot, documents }
  })
}
