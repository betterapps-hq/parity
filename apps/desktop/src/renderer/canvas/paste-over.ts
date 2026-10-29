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
} from "@parity/core"

const insets = ["position", "top", "right", "bottom", "left"] as const

/**
 * Paste over selection: each of the layers `ids` is replaced by a copy of `nodes`, with fresh ids, in its place: at its
 * index in its layout or slot, and at its insets when it's placed absolutely in the state shown. Layers inside instances
 * and the design's root aren't replaced. Returns the design and the copies' ids, in the design's order.
 */
export function replaceLayers(
  container: ContainerSpec,
  ids: readonly string[],
  nodes: readonly DesignNode[],
  state: StateSpec
): { container: ContainerSpec; copies: string[] } {
  const variants = shownVariants(container)
  const targets = topmostNodes(container.root, ids).filter((node) => node.id !== container.root.id)
  const taken = nodeIds(container.root)
  const copies: string[] = []
  let next = container
  // The last first, so replacing one never moves the place of another still to come.
  for (const target of targets.toReversed()) {
    const location = locateNode(next.root, target.id)
    const parent = location?.ancestors.at(-1)
    if (!location || !parent) continue
    const style = nodeInState(location.node, state, variants).style ?? {}
    const place: NodeStyle | undefined =
      style.position === "absolute"
        ? Object.fromEntries(insets.flatMap((key) => (style[key] === undefined ? [] : [[key, style[key]]])))
        : undefined
    const made = nodes.map((node) => {
      const copy = withFreshIds(node, taken)
      if (!place) return copy
      const own = Object.fromEntries(
        Object.entries(copy.style ?? {}).filter(([key]) => !(insets as readonly string[]).includes(key))
      )
      return { ...copy, style: { ...own, ...place } }
    })
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
