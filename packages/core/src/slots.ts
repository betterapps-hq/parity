import type { ContainerSpec, DesignNode, LayoutNode } from "./document.ts"
import { childNodes, locateNode, mapNode } from "./edit.ts"
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
  if (container.kind !== "component") return []
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
  for (const slot of slots) if (!nested || layersBelow(slot.node) > layersBelow(nested.node)) nested = slot
  return nested
}

/** The slot whose placeholder content holds a layer, if one does. */
export function enclosingSlot(container: ContainerSpec, nodeId: string): string | undefined {
  if (container.kind !== "component") return undefined
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
  if (unusable) return `A slot's name ${unusable}.`
  if (container.params?.[name]) return `A param is already called ${name}. Give the slot another name.`
  const other = designSlots(container).find((slot) => slot.name === name && slot.node.id !== nodeId)
  if (other) return `${other.node.name ?? "Another layout"} is already the ${name} slot.`
  return slotPlaceProblem(container, nodeId)
}

/**
 * Why a layer of a component design can't be a slot by any name, or undefined when it can: one slot can't hold
 * another, since an instance that fills the outer one replaces the inner.
 */
export function slotPlaceProblem(container: ContainerSpec, nodeId: string): string | undefined {
  const holder = enclosingSlot(container, nodeId)
  if (holder) return `This layout is inside the ${holder} slot, so an instance that fills that slot replaces it.`
  const inner = slotsInside(locateNode(container.root, nodeId)?.node)
  if (inner) return `A layout inside this one is already the ${inner} slot.`
  return undefined
}

/**
 * A name a layout can take as a new slot, that no other slot or param has: one from the layout's name, then `content`,
 * numbered as needed. Given `preferred`, it's tried first. Undefined when the layout can't be a slot (see
 * `slotPlaceProblem`).
 */
export function freeSlotName(container: ContainerSpec, nodeId: string, preferred?: string): string | undefined {
  if (slotPlaceProblem(container, nodeId)) return undefined
  const node = locateNode(container.root, nodeId)?.node
  const free = (name: string) => name !== "" && !slotProblem(container, nodeId, name)
  const named = [preferred ?? "", slotName(node?.name ?? ""), "content"].find(free)
  if (named) return named
  let counter = 2
  while (!free(`content${counter}`)) counter++
  return `content${counter}`
}

/**
 * Makes a layout of a component design the slot `name`, or a plain layout again when `name` is undefined. Its
 * children stay, as the placeholder content.
 */
export function setSlot(container: ContainerSpec, nodeId: string, name: string | undefined): ContainerSpec {
  if (container.kind !== "component") throw new Error("Only a component design has slots")
  const node = locateNode(container.root, nodeId)?.node
  if (node?.type !== "layout") throw new Error(`"${nodeId}" isn't a layout, and only a layout can be a slot`)
  if (name !== undefined) {
    const problem = slotProblem(container, nodeId, name)
    if (problem) throw new Error(problem)
  }
  const root = mapNode(container.root, nodeId, (current) => {
    const next = { ...current } as LayoutNode
    if (name === undefined) delete next.slot
    else next.slot = name
    return next
  })
  return { ...container, root }
}

/** The name of the first slot among a layer's descendants. */
function slotsInside(node: DesignNode | undefined): string | undefined {
  for (const child of node ? childNodes(node) : []) {
    if (child.type === "layout" && child.slot !== undefined) return child.slot
    const found = slotsInside(child)
    if (found) return found
  }
  return undefined
}
