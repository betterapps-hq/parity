import {
  type ContainerSpec,
  deleteNode,
  findNode,
  insertNode,
  moveNodes,
  nodeIds,
  type StateSpec,
  topmostNodes,
  withFreshIds
} from "@parity-app/core"
import { asShown, fitBindings } from "./clipboard.ts"
import type { MoveTarget } from "./drop-target.ts"

/**
 * Moving dragged layers to where they're dropped (see `dropTargetAt`). Within a design they keep their ids, and every
 * state's changes to them; into another design they go as they're shown, with fresh ids. Each returns the designs
 * changed, the same ones back when nothing changed, for the app to apply as one undo step.
 */

/** Where in a design the layers go: the layout, their place among its children before the move, and the slot. */
export type MovePlace = Pick<MoveTarget, "parent" | "index" | "slot">

/**
 * Moves the layers `ids` to a place in their own design. The same design back when that leaves it as it was, as when
 * a layer is dropped where it already is, or when the move can't be made, as into one of the layers themselves.
 */
export function moveLayersWithin(container: ContainerSpec, ids: readonly string[], place: MovePlace): ContainerSpec {
  let root = container.root
  try {
    root = moveNodes(container.root, ids, place.parent, { index: place.index, slot: place.slot })
  } catch {
    return container
  }
  return JSON.stringify(root) === JSON.stringify(container.root) ? container : { ...container, root }
}

/**
 * Moves the layers `ids`, the outermost of them, from one design to a place in another: they leave `source` and copies
 * of them go into `destination`, as the source's board shows them in `state` and `viewport` (see `asShown`), with ids
 * new there and the bindings `destination` has params for (see `fitBindings`). Returns both designs and the copies'
 * ids, to select; both the same and no copies when none of the layers is in `source`.
 */
export function moveLayersAcross(
  source: ContainerSpec,
  destination: ContainerSpec,
  ids: readonly string[],
  place: MovePlace,
  state: StateSpec,
  viewport?: string
): { source: ContainerSpec; destination: ContainerSpec; copies: string[] } {
  const taken = nodeIds(destination.root)
  const copies = topmostNodes(source.root, ids).map((node) =>
    withFreshIds(fitBindings(asShown(source, node, state, viewport), destination), taken)
  )
  if (copies.length === 0) return { source, destination, copies: [] }
  let root = destination.root
  for (const [offset, copy] of copies.entries()) {
    root = insertNode(root, place.parent, copy, { index: place.index + offset, slot: place.slot })
  }
  return {
    source: ids.reduce((next, id) => (findNode(next.root, id) ? deleteNode(next, id) : next), source),
    destination: { ...destination, root },
    copies: copies.map((copy) => copy.id)
  }
}
