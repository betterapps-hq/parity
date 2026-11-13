import {
  childNodes,
  type ContainerSpec,
  type DesignNode,
  deleteNode,
  findNode,
  generateId,
  insertNode,
  locateNode,
  moveNodes,
  nodeIds
} from "@parity-app/core"

/*
 * What can fill one of an instance's slots, and filling it: the project's components, as a new instance of one, and the
 * layers of the design the instance sits in, moved in. Kept to data in, data out, so it can move into a package once
 * the design is approved.
 */

/** A layer of the design that could go into the slot, with how many listed layers it's inside, to indent it. */
export interface ScreenLayer {
  node: DesignNode
  depth: number
  /** The layer it's in, to tell apart matches with the same name; none for one straight inside the root. */
  parent?: DesignNode
}

/**
 * The layers of a design that can go into one of its instance's slots, in Layers' order: every layer but the design's
 * root, the instance's ancestors, and the instance itself with everything inside it, since none of those can go into
 * the slot. An ancestor is left out, but the rest of what it holds is still listed.
 */
export function screenLayers(root: DesignNode, instanceId: string): ScreenLayer[] {
  const ancestors = new Set(locateNode(root, instanceId)?.ancestors.map((node) => node.id))
  const layers: ScreenLayer[] = []

  const visit = (node: DesignNode, depth: number, parent?: DesignNode): void => {
    if (node.id === instanceId) {
      return
    }

    // A left-out ancestor doesn't indent what it holds, so nothing reads as inside the layer listed before it.
    const listed = !ancestors.has(node.id)

    if (listed) {
      layers.push(parent ? { node, depth, parent } : { node, depth })
    }

    childNodes(node).forEach((child) => visit(child, listed ? depth + 1 : depth, node))
  }

  childNodes(root).forEach((child) => visit(child, 0))

  return layers
}

/** A component that could go into the slot: any of the project's but the instance's own, which can't hold itself. */
export interface SlotComponent {
  id: string
  name: string
}

/** The project's components that can go into an instance's slots, by name: all but the instance's own component. */
export function slotComponents(containers: readonly ContainerSpec[], instance: DesignNode): SlotComponent[] {
  const own = instance.type === "instance" ? instance.design : undefined

  return containers
    .flatMap((container) =>
      container.kind === "component" && container.id !== own ? [{ id: container.id, name: container.name }] : []
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Moves layers of the design into the slot, after what fills it already. The same root back when they can't go. */
export function moveIntoSlot(root: DesignNode, instanceId: string, slot: string, ids: readonly string[]): DesignNode {
  const allowed = new Set(screenLayers(root, instanceId).map((layer) => layer.node.id))
  const moving = ids.filter((id) => allowed.has(id))

  return moving.length === 0 ? root : moveNodes(root, moving, instanceId, { slot })
}

/** Adds a new instance of a component into the slot, after what fills it already. */
export function addToSlot(root: DesignNode, instanceId: string, slot: string, component: string): DesignNode {
  const id = generateId(nodeIds(root))

  return insertNode(root, instanceId, { type: "instance", id, design: component }, { slot })
}

/** Takes one layer out of the slot, deleting it, as Clear deletes what fills a slot. */
export function removeFromSlot(container: ContainerSpec, layerId: string): ContainerSpec {
  return findNode(container.root, layerId) ? deleteNode(container, layerId) : container
}
