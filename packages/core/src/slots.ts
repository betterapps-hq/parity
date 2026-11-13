import type { ContainerSpec, DesignNode, InstanceNode, LayoutNode } from "./document.ts"
import {
  childNodes,
  deleteNode,
  findNode,
  generateId,
  insertNode,
  locateNode,
  mapNode,
  moveNodes,
  nodeIds
} from "./edit.ts"
import type { ComponentLibrary } from "./render.ts"
import { slotName, slotNameProblem } from "./slot-names.ts"

/** A layout a component design leaves for its instances to fill. */
export interface DesignSlot {
  name: string
  /** The layout, whose children are the placeholder content. */
  node: LayoutNode
}

/**
 * A component design's slots, outermost first, in the order Layers lists them. Only a component has slots. A slot
 * inside another one's placeholder isn't one of them: an instance that fills the outer slot replaces it.
 */
export function designSlots(container: ContainerSpec): DesignSlot[] {
  if (container.kind !== "component") {
    return []
  }

  const slots: DesignSlot[] = []

  const visit = (node: DesignNode): void => {
    if (node.type === "layout" && node.slot !== undefined) {
      slots.push({ name: node.slot, node })

      return
    }

    childNodes(node).forEach(visit)
  }

  visit(container.root)

  return slots
}

/** One of an instance's slots: the component's slot, and the layers the instance fills it with, if any. */
export interface InstanceSlot extends DesignSlot {
  /** Layers of the design the instance sits in; empty while the slot shows its placeholder. */
  fill: DesignNode[]
}

/** The slots of an instance's component, in its order, each with what the instance fills it with. */
export function instanceSlots(instance: InstanceNode, library: ComponentLibrary): InstanceSlot[] {
  const component = library.get(instance.design)

  if (!component) {
    return []
  }

  return designSlots(component).map((slot) => ({ ...slot, fill: instance.slots?.[slot.name] ?? [] }))
}

/**
 * The slot a path inside one of a design's own instances points at, as selecting a slot selects it: the instance's id,
 * then the component's slot layout, `card/body`. Undefined for any other path.
 */
export function slotAtPath(
  root: DesignNode,
  path: string,
  library: ComponentLibrary
): { instance: InstanceNode; slot: InstanceSlot } | undefined {
  const [instanceId, layoutId, ...deeper] = path.split("/")

  if (!instanceId || !layoutId || deeper.length > 0) {
    return undefined
  }

  const instance = findNode(root, instanceId)

  if (instance?.type !== "instance") {
    return undefined
  }

  const slot = instanceSlots(instance, library).find((each) => each.node.id === layoutId)

  return slot ? { instance, slot } : undefined
}

/** Empties the slot an instance fills, deleting its layers, so it shows the placeholder again. */
export function clearSlot(root: DesignNode, instanceId: string, slot: string): DesignNode {
  return mapNode(root, instanceId, (node) => {
    if (node.type !== "instance") {
      throw new Error(`"${instanceId}" isn't an instance`)
    }

    const { [slot]: _cleared, ...rest } = node.slots ?? {}
    const { slots: _slots, ...instance } = node

    return Object.keys(rest).length > 0 ? { ...instance, slots: rest } : instance
  })
}

/** A layer of a design that can fill one of its instance's slots, as the slot's picker lists it (PAR-1046). */
export interface SlotCandidate {
  node: DesignNode
  /** How many listed layers it's inside, to nest it as Layers does. */
  depth: number
  /** The layer it's in, to tell apart two candidates with one name; none straight inside the root. */
  parent?: DesignNode
}

/**
 * The layers of a design that can fill one of its instance's slots, in Layers' order: all but the root, the instance's
 * ancestors, and the instance with everything in it, none of which can go into the slot. An ancestor left out doesn't
 * nest what it holds, so nothing reads as inside the layer listed before it.
 */
export function slotCandidates(root: DesignNode, instanceId: string): SlotCandidate[] {
  const ancestors = new Set(locateNode(root, instanceId)?.ancestors.map((node) => node.id))
  const candidates: SlotCandidate[] = []

  const visit = (node: DesignNode, depth: number, parent: DesignNode | undefined): void => {
    if (node.id === instanceId) {
      return
    }

    const listed = !ancestors.has(node.id)

    if (listed) {
      candidates.push(parent ? { node, depth, parent } : { node, depth })
    }

    childNodes(node).forEach((child) => visit(child, listed ? depth + 1 : depth, node))
  }

  childNodes(root).forEach((child) => visit(child, 0, undefined))

  return candidates
}

/**
 * The project's components that can fill an instance's slots, by name: any but the instance's own component and the
 * design it sits in, neither of which can hold itself.
 */
export function slotComponents(
  containers: readonly ContainerSpec[],
  design: ContainerSpec,
  instance: InstanceNode
): ContainerSpec[] {
  return containers
    .filter((each) => each.kind === "component" && each.id !== instance.design && each.id !== design.id)
    .toSorted((a, b) => a.name.localeCompare(b.name))
}

/** Deletes what fills one of an instance's slots, with its layers' changes in every state, before it's filled again. */
function emptied(container: ContainerSpec, instanceId: string, slot: string): ContainerSpec {
  const instance = findNode(container.root, instanceId)
  const fill = instance?.type === "instance" ? (instance.slots?.[slot] ?? []) : []

  return fill.reduce((current, node) => deleteNode(current, node.id), container)
}

/**
 * Fills one of an instance's slots with a layer of its design, moved in with its id and its changes, in place of what
 * filled it, which is deleted, as Clear deletes it: a slot holds one layer here. Refuses a layer that can't go in (see
 * `slotCandidates`).
 */
export function fillSlotWithLayer(
  container: ContainerSpec,
  instanceId: string,
  slot: string,
  layerId: string
): ContainerSpec {
  if (!slotCandidates(container.root, instanceId).some((candidate) => candidate.node.id === layerId)) {
    throw new Error(`"${layerId}" can't go in a slot of "${instanceId}"`)
  }

  const cleared = emptied(container, instanceId, slot)

  return { ...cleared, root: moveNodes(cleared.root, [layerId], instanceId, { slot }) }
}

/** Fills one of an instance's slots with a new instance of a component, in place of what filled it. Its id comes back. */
export function fillSlotWithComponent(container: ContainerSpec, instanceId: string, slot: string, component: string) {
  const cleared = emptied(container, instanceId, slot)
  const id = generateId(nodeIds(cleared.root))
  const root = insertNode(cleared.root, instanceId, { type: "instance", id, design: component }, { slot })

  return { container: { ...cleared, root }, id }
}

/** How many layers a layer holds below itself. */
function layersBelow(node: DesignNode): number {
  return childNodes(node).reduce((count, child) => count + 1 + layersBelow(child), 0)
}

/**
 * The slot code nests between a component's tags, as React's `children` and Vue's default slot: the one holding the
 * most layers, the first in layer order on a tie. The others are props that take layers. A designer only names slots;
 * which one is written between the tags is code's choice, so the biggest part isn't passed as a prop.
 */
export function childrenSlot(slots: DesignSlot[]): DesignSlot | undefined {
  let nested: DesignSlot | undefined

  for (const slot of slots) {
    if (!nested || layersBelow(slot.node) > layersBelow(nested.node)) {
      nested = slot
    }
  }

  return nested
}

/** The slot whose placeholder content holds a layer, if one does. */
export function enclosingSlot(container: ContainerSpec, nodeId: string): string | undefined {
  if (container.kind !== "component") {
    return undefined
  }

  const location = locateNode(container.root, nodeId)
  const holder = location?.ancestors.find((node) => node.type === "layout" && node.slot !== undefined)

  return holder?.type === "layout" ? holder.slot : undefined
}

/**
 * Why a layer of a component design can't be the slot `name`, or undefined when it can. The sentence names the slot,
 * so it reads on its own.
 */
export function slotProblem(container: ContainerSpec, nodeId: string, name: string): string | undefined {
  const unusable = slotNameProblem(name)

  if (unusable) {
    return `A slot's name ${unusable}.`
  }

  if (container.params?.[name]) {
    return `A param is already called ${name}. Give the slot another name.`
  }

  const other = designSlots(container).find((slot) => slot.name === name && slot.node.id !== nodeId)

  if (other) {
    return `${other.node.name ?? "Another layout"} is already the ${name} slot.`
  }

  return slotPlaceProblem(container, nodeId)
}

/**
 * Why a layer of a component design can't be a slot by any name, or undefined when it can: one slot can't hold
 * another, since an instance that fills the outer one replaces the inner.
 */
export function slotPlaceProblem(container: ContainerSpec, nodeId: string): string | undefined {
  const holder = enclosingSlot(container, nodeId)

  if (holder) {
    return `This layout is inside the ${holder} slot, so an instance that fills that slot replaces it.`
  }

  const inner = slotsInside(locateNode(container.root, nodeId)?.node)

  if (inner) {
    return `A layout inside this one is already the ${inner} slot.`
  }

  return undefined
}

/**
 * A name a layout can take as a new slot, that no other slot or param has: one from the layout's name, then `content`,
 * numbered as needed. Given `preferred`, it's tried first. Undefined when the layout can't be a slot (see
 * `slotPlaceProblem`).
 */
export function freeSlotName(container: ContainerSpec, nodeId: string, preferred?: string): string | undefined {
  if (slotPlaceProblem(container, nodeId)) {
    return undefined
  }

  const node = locateNode(container.root, nodeId)?.node
  const free = (name: string) => name !== "" && !slotProblem(container, nodeId, name)
  const named = [preferred ?? "", slotName(node?.name ?? ""), "content"].find(free)

  if (named) {
    return named
  }

  let counter = 2

  while (!free(`content${counter}`)) {
    counter++
  }

  return `content${counter}`
}

/**
 * Makes a layout of a component design the slot `name`, or a plain layout again when `name` is undefined. Its
 * children stay, as the placeholder content.
 */
export function setSlot(container: ContainerSpec, nodeId: string, name: string | undefined): ContainerSpec {
  if (container.kind !== "component") {
    throw new Error("Only a component design has slots")
  }

  const node = locateNode(container.root, nodeId)?.node

  if (node?.type !== "layout") {
    throw new Error(`"${nodeId}" isn't a layout, and only a layout can be a slot`)
  }

  if (name !== undefined) {
    const problem = slotProblem(container, nodeId, name)

    if (problem) {
      throw new Error(problem)
    }
  }

  const root = mapNode(container.root, nodeId, (current) => {
    // This only ever gets the layout checked above; any other node would go back as it was.
    if (current.type !== "layout") {
      return current
    }

    const next: LayoutNode = { ...current }

    if (name === undefined) {
      delete next.slot
    } else {
      next.slot = name
    }

    return next
  })

  return { ...container, root }
}

/** The name of the first slot among a layer's descendants. */
function slotsInside(node: DesignNode | undefined): string | undefined {
  for (const child of node ? childNodes(node) : []) {
    if (child.type === "layout" && child.slot !== undefined) {
      return child.slot
    }

    const found = slotsInside(child)

    if (found) {
      return found
    }
  }

  return undefined
}
