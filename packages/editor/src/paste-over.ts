import {
  type ContainerSpec,
  deleteNode,
  type DesignNode,
  insertNode,
  locateNode,
  nodeIds,
  nodeInState,
  type NodeStyle,
  shownVariants,
  type StateSpec,
  topmostNodes,
  withFreshIds
} from "@parity-app/core"
import { copyDesigns } from "./clipboard.ts"

/**
 * Figma's two pastes that go where the selection is. Paste over selection (Ctrl+Shift+V) puts the clipboard on top of
 * the selection and removes nothing; Paste to replace (Ctrl+Shift+R) puts it in place of each selected layer.
 */

const insets = ["position", "top", "right", "bottom", "left"] as const

/** Copies of `nodes` with fresh ids, placed at a layer's insets when it's placed absolutely as the state shows it. */
function copiesAt(
  layer: DesignNode,
  nodes: readonly DesignNode[],
  taken: Set<string>,
  state: StateSpec,
  container: ContainerSpec
): DesignNode[] {
  const style = nodeInState(layer, state, shownVariants(container)).style ?? {}
  const place: NodeStyle | undefined =
    style.position === "absolute"
      ? Object.fromEntries(insets.flatMap((key) => (style[key] === undefined ? [] : [[key, style[key]]])))
      : undefined
  return nodes.map((node) => {
    const copy = withFreshIds(node, taken)
    if (!place) return copy
    const own = Object.fromEntries(
      Object.entries(copy.style ?? {}).filter(([key]) => !(insets as readonly string[]).includes(key))
    )
    return { ...copy, style: { ...own, ...place } }
  })
}

/**
 * Paste over selection, for layers: copies of `nodes`, with fresh ids, go just after the last of the layers `ids` in the
 * design's order, in its layout or slot, so they paint on top of it, and at its insets when it's placed absolutely in
 * the state shown. Nothing is removed, and a selected layout gets them beside it, not inside. Layers inside instances
 * and the design's root don't count. Returns the design and the copies' ids.
 */
export function placeOver(
  container: ContainerSpec,
  ids: readonly string[],
  nodes: readonly DesignNode[],
  state: StateSpec
): { container: ContainerSpec; copies: string[] } {
  const target = topmostNodes(container.root, ids)
    .filter((node) => node.id !== container.root.id)
    .at(-1)
  const location = target && locateNode(container.root, target.id)
  const parent = location?.ancestors.at(-1)
  if (!location || !parent) return { container, copies: [] }
  const made = copiesAt(location.node, nodes, nodeIds(container.root), state, container)
  let root = container.root
  for (const [offset, copy] of made.entries()) {
    root = insertNode(root, parent.id, copy, { index: location.index + 1 + offset, slot: location.slot })
  }
  return { container: { ...container, root }, copies: made.map((copy) => copy.id) }
}

/**
 * Paste over selection, for designs: copies of `designs` that sit as they sat together, with their top left corner at
 * `at`, the selected designs' own. Each keeps its id unless `taken` has it, as a paste does.
 */
export function designsAt(
  designs: readonly ContainerSpec[],
  taken: readonly string[],
  at: { x: number; y: number }
): ContainerSpec[] {
  const left = Math.min(...designs.map((design) => design.position.x))
  const top = Math.min(...designs.map((design) => design.position.y))
  return copyDesigns(designs, taken, { x: at.x - left, y: at.y - top })
}

/**
 * Paste to replace: each of the layers `ids` is replaced by a copy of `nodes`, with fresh ids, in its place: at its
 * index in its layout or slot, and at its insets when it's placed absolutely in the state shown. Layers inside instances
 * and the design's root aren't replaced. Returns the design and the copies' ids, in the design's order.
 */
export function replaceLayers(
  container: ContainerSpec,
  ids: readonly string[],
  nodes: readonly DesignNode[],
  state: StateSpec
): { container: ContainerSpec; copies: string[] } {
  const targets = topmostNodes(container.root, ids).filter((node) => node.id !== container.root.id)
  const taken = nodeIds(container.root)
  const copies: string[] = []
  let next = container
  // The last first, so replacing one never moves the place of another still to come.
  for (const target of targets.toReversed()) {
    const location = locateNode(next.root, target.id)
    const parent = location?.ancestors.at(-1)
    if (!location || !parent) continue
    const made = copiesAt(location.node, nodes, taken, state, next)
    next = deleteNode(next, target.id)
    let root = next.root
    for (const [offset, copy] of made.entries()) {
      root = insertNode(root, parent.id, copy, { index: location.index + offset, slot: location.slot })
    }
    next = { ...next, root }
    copies.unshift(...made.map((copy) => copy.id))
  }
  return { container: next, copies }
}
