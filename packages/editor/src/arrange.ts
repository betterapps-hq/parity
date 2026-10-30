import {
  boardTarget,
  type CanvasDocument,
  childEntries,
  type ContainerSpec,
  deleteNode,
  type DesignNode,
  editNode,
  findNode,
  generateId,
  insertNode,
  locateNode,
  moveNode,
  nodeIds,
  nodeInState,
  type StateSpec,
  topmostNodes,
  unwrapNode,
  withFreshIds,
  wrapNodes
} from "@parity-app/core"

/**
 * Arranging layers and designs: deleting, duplicating, wrapping in a layout and unwrapping, ordering, aligning and
 * distributing. Each takes a design, or the documents designs are in, and returns it changed, for the app to apply as
 * one undo step however many things it touches. The same one back means nothing changed.
 */

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom"

export type Order = "forward" | "backward" | "front" | "back"

/** A design's box on the canvas, in page coordinates, with its position in its document. */
export interface DesignBox {
  key: string
  position: { x: number; y: number }
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** A design to change in the documents: the document's path and the design's id there. */
export interface DesignRef {
  path: string
  id: string
}

/** The layers among `ids` that arranging acts on: those inside no other of them, outermost first, but not the root. */
export function topLayers(container: ContainerSpec, ids: Iterable<string>): string[] {
  return topmostNodes(container.root, ids)
    .map((node) => node.id)
    .filter((id) => id !== container.root.id)
}

/**
 * Deletes the layers `ids`. Returns the design, and the layout that held the last of them, to select next; none when
 * that's the design's root.
 */
export function removeLayers(
  container: ContainerSpec,
  ids: readonly string[]
): { container: ContainerSpec; parent?: string } {
  const parent = ids.length > 0 ? locateNode(container.root, ids.at(-1)!)?.ancestors.at(-1) : undefined
  const next = ids.reduce((current, id) => (findNode(current.root, id) ? deleteNode(current, id) : current), container)
  return { container: next, ...(parent && parent.id !== container.root.id ? { parent: parent.id } : {}) }
}

/** Copies each of the layers `ids` in place, just after itself, with fresh ids. Returns the copies' ids in order. */
export function copyLayersInPlace(
  container: ContainerSpec,
  ids: readonly string[]
): { container: ContainerSpec; copies: string[] } {
  const taken = nodeIds(container.root)
  const copies: string[] = []
  let root = container.root
  // Last first, so inserting a copy never moves a later original.
  for (const id of ids.toReversed()) {
    const location = locateNode(root, id)
    const parent = location?.ancestors.at(-1)
    if (!location || !parent) continue
    const copy = withFreshIds(location.node, taken)
    copies.unshift(copy.id)
    root = insertNode(root, parent.id, copy, { index: location.index + 1, slot: location.slot })
  }
  return { container: copies.length > 0 ? { ...container, root } : container, copies }
}

/** Takes the designs out of their documents. */
export function removeDesigns(
  documents: ReadonlyMap<string, CanvasDocument>,
  designs: readonly DesignRef[]
): ReadonlyMap<string, CanvasDocument> {
  const next = new Map(documents)
  for (const design of designs) {
    const document = next.get(design.path)
    if (!document) continue
    next.set(design.path, {
      ...document,
      containers: document.containers.filter((container) => container.id !== design.id)
    })
  }
  return next
}

/** The layer `id` and its siblings, in the layout or slot they share, for selecting all. */
export function siblingsOf(root: DesignNode, id: string): string[] | undefined {
  const location = locateNode(root, id)
  const parent = location?.ancestors.at(-1)
  const siblings = parent && childEntries(parent).find((candidate) => candidate.slot === location?.slot)?.nodes
  return siblings?.map((node) => node.id)
}

/**
 * Puts the layers `ids` in a new layout, laid out the way their parent lays them out in `state`: in a row when it's a
 * row, and with its gap. Returns the design and the new layout's id. Throws, with a message to show, when they can't be
 * wrapped together.
 */
export function wrapInLayout(
  container: ContainerSpec,
  ids: readonly string[],
  state: StateSpec
): { container: ContainerSpec; id: string } {
  const parent = ids.length > 0 ? locateNode(container.root, ids[0]!)?.ancestors.at(-1) : undefined
  const parentStyle = parent ? nodeInState(parent, state).style : undefined
  const id = generateId(nodeIds(container.root))
  const next = wrapNodes(container, ids, {
    id,
    style: {
      ...(parentStyle?.direction === "row" ? { direction: "row" as const } : {}),
      ...(parentStyle?.gap !== undefined ? { gap: parentStyle.gap } : {})
    }
  })
  return { container: next, id }
}

/**
 * Takes the layout `id` away, leaving its layers where it was. Returns the design and those layers' ids; none when `id`
 * isn't a layout.
 */
export function unwrapLayout(
  container: ContainerSpec,
  id: string
): { container: ContainerSpec; children: string[] } | undefined {
  const node = findNode(container.root, id)
  if (node?.type !== "layout") return undefined
  return { container: unwrapNode(container, id), children: node.children.map((child) => child.id) }
}

/**
 * Moves the layer `id` among its siblings. Later in a layout paints in front, as in CSS, so bringing a layer forward
 * moves it later in its layout, and down the Layers list. The same design back when it's already there.
 */
export function reorderLayer(container: ContainerSpec, id: string, order: Order): ContainerSpec {
  const location = locateNode(container.root, id)
  const parent = location?.ancestors.at(-1)
  const siblings = parent && childEntries(parent).find((candidate) => candidate.slot === location?.slot)?.nodes
  if (!location || !parent || !siblings) return container
  const last = siblings.length - 1
  const index = {
    forward: Math.min(location.index + 1, last),
    backward: Math.max(location.index - 1, 0),
    front: last,
    back: 0
  }[order]
  if (index === location.index) return container
  return {
    ...container,
    // Moving later counts the siblings before the layer leaves its place.
    root: moveNode(container.root, id, parent.id, {
      index: index > location.index ? index + 1 : index,
      slot: location.slot
    })
  }
}

/**
 * Aligns the layers `ids` in their layouts, as `state` shows them. A layer aligns on its parent's cross axis by itself;
 * along its main axis, the parent moves all its children together. Layers outside a layout stay as they are.
 */
export function alignInLayouts(
  container: ContainerSpec,
  ids: readonly string[],
  state: StateSpec,
  alignment: Alignment
): ContainerSpec {
  const horizontal = alignment === "left" || alignment === "center" || alignment === "right"
  const position = (
    { left: "start", center: "center", right: "end", top: "start", middle: "center", bottom: "end" } as const
  )[alignment]
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
}

/**
 * Where designs go to line up on the canvas by their edges or centers: each one's new position, by key. None for fewer
 * than two.
 */
export function alignBoxes(boxes: readonly DesignBox[], alignment: Alignment): Map<string, { x: number; y: number }> {
  const moves = new Map<string, { x: number; y: number }>()
  if (boxes.length < 2) return moves
  const left = Math.min(...boxes.map((box) => box.minX))
  const right = Math.max(...boxes.map((box) => box.maxX))
  const top = Math.min(...boxes.map((box) => box.minY))
  const bottom = Math.max(...boxes.map((box) => box.maxY))
  for (const box of boxes) {
    const { x, y } = box.position
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
    moves.set(box.key, { x: x + dx, y: y + dy })
  }
  return moves
}

/**
 * Where designs go to space them evenly between the outermost two along `axis`: each one's new position, by key. None
 * for fewer than three.
 */
export function distributeBoxes(
  boxes: readonly DesignBox[],
  axis: "horizontal" | "vertical"
): Map<string, { x: number; y: number }> {
  const moves = new Map<string, { x: number; y: number }>()
  if (boxes.length < 3) return moves
  const horizontal = axis === "horizontal"
  const sorted = boxes.toSorted((a, b) => (horizontal ? a.minX - b.minX : a.minY - b.minY))
  const start = horizontal ? sorted[0]!.minX : sorted[0]!.minY
  const end = horizontal ? sorted.at(-1)!.maxX : sorted.at(-1)!.maxY
  const total = sorted.reduce((sum, box) => sum + (horizontal ? box.maxX - box.minX : box.maxY - box.minY), 0)
  const gap = (end - start - total) / (sorted.length - 1)
  let cursor = start
  for (const box of sorted) {
    const { x, y } = box.position
    moves.set(box.key, horizontal ? { x: x + cursor - box.minX, y } : { x, y: y + cursor - box.minY })
    cursor += (horizontal ? box.maxX - box.minX : box.maxY - box.minY) + gap
  }
  return moves
}

/**
 * Moves designs to new positions, rounded to whole pixels. The same documents back when none of them moved, so nothing
 * is recorded.
 */
export function repositionDesigns(
  documents: ReadonlyMap<string, CanvasDocument>,
  moves: Iterable<DesignRef & { position: { x: number; y: number } }>
): ReadonlyMap<string, CanvasDocument> {
  const next = new Map(documents)
  let changed = false
  for (const { path, id, position } of moves) {
    const document = next.get(path)
    if (!document) continue
    const rounded = { x: Math.round(position.x), y: Math.round(position.y) }
    const containers = document.containers.map((container): ContainerSpec =>
      container.id === id && (container.position.x !== rounded.x || container.position.y !== rounded.y)
        ? { ...container, position: rounded }
        : container
    )
    if (containers.some((container, index) => container !== document.containers[index])) {
      next.set(path, { ...document, containers })
      changed = true
    }
  }
  return changed ? next : documents
}
