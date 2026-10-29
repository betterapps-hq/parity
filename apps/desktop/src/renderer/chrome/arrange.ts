import {
  boardTarget,
  type CanvasDocument,
  childEntries,
  type ContainerSpec,
  deleteNode,
  editNode,
  findNode,
  generateId,
  insertNode,
  locateNode,
  nodeIds,
  nodeInState,
  topmostNodes,
  unwrapNode,
  withFreshIds,
  wrapNodes
} from "@parity/core"
import { toast } from "sonner"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import type { ContainerEntry } from "../design-store.ts"
import { designsSelection, layersSelection, selectedDesigns, selectedNodes } from "../selection.ts"
import type { ProjectSession } from "../workspace.ts"
import { editingState } from "./LayerPanel.tsx"

/**
 * What acts on several layers or designs at once: deleting, duplicating, selecting all, wrapping in a layout,
 * aligning and distributing. Each is one undo step, however many things it touches.
 */

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom"

/** The design the selected layers are in, with their ids, outermost first. Undefined unless layers are selected. */
export function selectedLayers(session: ProjectSession): { entry: ContainerEntry; ids: string[] } | undefined {
  const current = session.selection.get()
  const entry = current.design ? session.store.getEntry(current.design) : undefined
  const ids = selectedNodes(current)
  if (!entry || ids.length === 0) return undefined
  const top = topmostNodes(entry.container.root, ids)
    .map((node) => node.id)
    .filter((id) => id !== entry.container.root.id)
  return top.length > 0 ? { entry, ids: top } : undefined
}

export function deleteLayers(session: ProjectSession): boolean {
  const layers = selectedLayers(session)
  if (!layers) return false
  const { entry, ids } = layers
  const last = locateNode(entry.container.root, ids.at(-1)!)
  const parent = last?.ancestors.at(-1)
  session.store.updateContainer(
    entry.key,
    ids.length === 1 ? "Delete layer" : `Delete ${ids.length} layers`,
    (container) => ids.reduce((next, id) => (findNode(next.root, id) ? deleteNode(next, id) : next), container)
  )
  const current = session.selection.get()
  session.selection.set(
    !parent || parent.id === entry.container.root.id
      ? { design: entry.key }
      : layersSelection(entry.key, [parent.id], current)
  )
  return true
}

/** Copies each selected layer in place, just after itself, and selects the copies. */
export function duplicateLayers(session: ProjectSession): boolean {
  const layers = selectedLayers(session)
  if (!layers) return false
  const { entry, ids } = layers
  const copies: string[] = []
  session.store.updateContainer(
    entry.key,
    ids.length === 1 ? "Duplicate layer" : `Duplicate ${ids.length} layers`,
    (container) => {
      const taken = nodeIds(container.root)
      let root = container.root
      // Last first, so inserting a copy never moves a later original.
      for (const id of [...ids].reverse()) {
        const location = locateNode(root, id)
        const parent = location?.ancestors.at(-1)
        if (!location || !parent) continue
        const copy = withFreshIds(location.node, taken)
        copies.unshift(copy.id)
        root = insertNode(root, parent.id, copy, { index: location.index + 1, slot: location.slot })
      }
      return { ...container, root }
    }
  )
  session.selection.set(layersSelection(entry.key, copies, session.selection.get()))
  return copies.length > 0
}

export function deleteDesigns(session: ProjectSession): boolean {
  const keys = selectedDesigns(session.selection.get())
  const entries = keys.flatMap((key) => session.store.getEntry(key) ?? [])
  if (entries.length === 0) return false
  session.store.change(entries.length === 1 ? "Delete design" : `Delete ${entries.length} designs`, (snapshot) => {
    const documents = new Map(snapshot.documents)
    for (const entry of entries) {
      const document = documents.get(entry.path)
      if (!document) continue
      const containers = document.containers.filter((container) => container.id !== entry.container.id)
      documents.set(entry.path, { ...document, containers })
    }
    return { ...snapshot, documents }
  })
  session.selection.set({})
  return true
}

/** Ctrl+A: the selected layer and its siblings, or every design. */
export function selectAll(session: ProjectSession): void {
  const { store, selection } = session
  const current = selection.get()
  const entry = current.design ? store.getEntry(current.design) : undefined
  if (entry && current.node) {
    const location = locateNode(entry.container.root, current.node)
    const parent = location?.ancestors.at(-1)
    const siblings = parent && childEntries(parent).find((candidate) => candidate.slot === location?.slot)?.nodes
    if (siblings)
      selection.set(
        layersSelection(
          entry.key,
          siblings.map((node) => node.id),
          current
        )
      )
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
  const parent = locateNode(entry.container.root, ids[0]!)?.ancestors.at(-1)
  const parentStyle = parent ? nodeInState(parent, state).style : undefined
  const id = generateId(nodeIds(entry.container.root))
  try {
    session.store.updateContainer(entry.key, "Wrap in layout", (container) =>
      wrapNodes(container, ids, {
        id,
        style: {
          ...(parentStyle?.direction === "row" ? { direction: "row" as const } : {}),
          ...(parentStyle?.gap !== undefined ? { gap: parentStyle.gap } : {})
        }
      })
    )
  } catch (error) {
    toast.info(error instanceof Error ? error.message : String(error))
    return false
  }
  session.selection.set(layersSelection(entry.key, [id], current))
  return true
}

/** Takes the selected layout away, leaving its layers where it was. */
export function unwrapLayer(session: ProjectSession): boolean {
  const layers = selectedLayers(session)
  if (!layers || layers.ids.length !== 1) return false
  const { entry, ids } = layers
  const node = findNode(entry.container.root, ids[0]!)
  if (node?.type !== "layout") {
    toast.info("Select a layout to unwrap it")
    return false
  }
  session.store.updateContainer(entry.key, "Unwrap layout", (container) => unwrapNode(container, node.id))
  session.selection.set(
    layersSelection(
      entry.key,
      node.children.map((child) => child.id),
      session.selection.get()
    )
  )
  return true
}

/**
 * Aligns the selection. Designs line up on the canvas by their edges or centers. Layers in a layout align on their
 * parent's cross axis by themselves; along its main axis, the parent moves all its children together.
 */
export function align(session: ProjectSession, alignment: Alignment): void {
  if (selectedLayers(session)) alignLayers(session, alignment)
  else alignDesigns(session, alignment)
}

function alignLayers(session: ProjectSession, alignment: Alignment): void {
  const { entry, ids } = selectedLayers(session)!
  const state = editingState(entry.container, session.selection.get().state)
  const horizontal = alignment === "left" || alignment === "center" || alignment === "right"
  const position = { left: "start", center: "center", right: "end", top: "start", middle: "center", bottom: "end" }[
    alignment
  ] as "start" | "center" | "end"
  session.store.updateContainer(entry.key, "Align", (container) => {
    let next = container
    for (const id of ids) {
      const parent = locateNode(next.root, id)?.ancestors.at(-1)
      if (parent?.type !== "layout") continue
      const row = nodeInState(parent, state).style?.direction === "row"
      // A column's cross axis is horizontal; a row's is vertical.
      const crossAxis = row ? !horizontal : horizontal
      next = crossAxis
        ? editNode(next, boardTarget(next, state.id), id, { style: { self: position } })
        : editNode(next, boardTarget(next, state.id), parent.id, { style: { justify: position } })
    }
    return next
  })
}

function alignDesigns(session: ProjectSession, alignment: Alignment): void {
  const boxes = designBoxes(session)
  if (boxes.length < 2) return
  const left = Math.min(...boxes.map((box) => box.minX))
  const right = Math.max(...boxes.map((box) => box.maxX))
  const top = Math.min(...boxes.map((box) => box.minY))
  const bottom = Math.max(...boxes.map((box) => box.maxY))
  const moves = new Map<string, { x: number; y: number }>()
  for (const box of boxes) {
    const { x, y } = box.entry.container.position
    const dx =
      alignment === "left"
        ? left - box.minX
        : alignment === "right"
          ? right - box.maxX
          : alignment === "center"
            ? (left + right) / 2 - (box.minX + box.maxX) / 2
            : 0
    const dy =
      alignment === "top"
        ? top - box.minY
        : alignment === "bottom"
          ? bottom - box.maxY
          : alignment === "middle"
            ? (top + bottom) / 2 - (box.minY + box.maxY) / 2
            : 0
    moves.set(box.entry.key, { x: x + dx, y: y + dy })
  }
  moveDesigns(session, moves, "Align designs")
}

/** Spaces three or more designs evenly between the outermost two. */
export function distribute(session: ProjectSession, axis: "horizontal" | "vertical"): void {
  const boxes = designBoxes(session)
  if (boxes.length < 3) return
  const horizontal = axis === "horizontal"
  const sorted = boxes.toSorted((a, b) => (horizontal ? a.minX - b.minX : a.minY - b.minY))
  const start = horizontal ? sorted[0]!.minX : sorted[0]!.minY
  const end = horizontal ? sorted.at(-1)!.maxX : sorted.at(-1)!.maxY
  const total = sorted.reduce((sum, box) => sum + (horizontal ? box.maxX - box.minX : box.maxY - box.minY), 0)
  const gap = (end - start - total) / (sorted.length - 1)
  const moves = new Map<string, { x: number; y: number }>()
  let cursor = start
  for (const box of sorted) {
    const { x, y } = box.entry.container.position
    moves.set(box.entry.key, horizontal ? { x: x + cursor - box.minX, y } : { x, y: y + cursor - box.minY })
    cursor += (horizontal ? box.maxX - box.minX : box.maxY - box.minY) + gap
  }
  moveDesigns(session, moves, "Distribute designs")
}

function designBoxes(session: ProjectSession) {
  return selectedDesigns(session.selection.get()).flatMap((key) => {
    const entry = session.store.getEntry(key)
    const bounds = entry ? session.editor?.getShapePageBounds(shapeIdFor(key)) : undefined
    return entry && bounds
      ? [{ entry, minX: bounds.minX, maxX: bounds.maxX, minY: bounds.minY, maxY: bounds.maxY }]
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
      const documents = new Map(snapshot.documents)
      let changed = false
      for (const [key, position] of moves) {
        const entry = store.getEntry(key)
        const document: CanvasDocument | undefined = entry && documents.get(entry.path)
        if (!entry || !document) continue
        const rounded = { x: Math.round(position.x), y: Math.round(position.y) }
        const containers = document.containers.map((container): ContainerSpec =>
          container.id === entry.container.id &&
          (container.position.x !== rounded.x || container.position.y !== rounded.y)
            ? { ...container, position: rounded }
            : container
        )
        if (containers.some((container, index) => container !== document.containers[index])) {
          documents.set(entry.path, { ...document, containers })
          changed = true
        }
      }
      return changed ? { ...snapshot, documents } : snapshot
    },
    group ? { group } : {}
  )
}
