import {
  type ComponentInfo,
  type ComponentLibrary,
  componentNode,
  type ComponentSource,
  type ContainerSpec,
  type DesignNode,
  detachInstance,
  generateId,
  type ImageCredit,
  insertNode,
  type LayoutNode,
  locateNode,
  nodeIds,
  withLibraryContext
} from "@parity-app/core"

/**
 * Inserting from the Assets panel: the layer an item becomes, where a click or a drop puts it, and the design with it
 * in. The app reads the selection, the components and the boxes the canvas draws, passes them in, and applies the
 * design that comes back as one undo step.
 */

/**
 * Something from the Assets panel: one of the project's or a library's components (icons included), a component
 * design, or an image.
 */
export type InsertItem =
  | {
      kind: "component"
      component: string
      /** Props it starts with, such as the weight a Phosphor icon is drawn in. */
      props?: Record<string, unknown>
    }
  | {
      kind: "instance"
      design: string
      /** Placed as a copy of what it shows, no longer linked, as a library's design can be. */
      detached?: true
    }
  | { kind: "image"; src: string; alt?: string; credit?: ImageCredit; width: number; height: number }

/** Images go in this many spacing steps wide (320px at 4px a step), their height following their shape. */
const imageSteps = 80

/** The component's name without its library: `nova/Button` reads as Button. */
export function componentLabel(component: string): string {
  return component.split("/").at(-1) ?? component
}

/** The undo step's label for inserting an item: "Add Button", "Add component", "Add copy" or "Add image". */
export function insertLabel(item: InsertItem): string {
  if (item.kind === "component") return `Add ${componentLabel(item.component)}`
  if (item.kind === "instance") return item.detached ? "Add copy" : "Add component"
  return "Add image"
}

/**
 * A new node for an item, ready to show something: required props get their default or first option, and a component
 * that takes children gets its own name as text, so it isn't an empty box.
 */
export function nodeForItem(item: InsertItem, info: ComponentInfo | undefined, taken: Set<string>): DesignNode {
  if (item.kind === "instance") return { type: "instance", id: generateId(taken), design: item.design }
  if (item.kind === "image") {
    const height = Math.max(1, Math.round((imageSteps * item.height) / Math.max(1, item.width)))
    return {
      type: "image",
      id: generateId(taken),
      src: item.src,
      ...(item.alt ? { alt: item.alt } : {}),
      ...(item.credit ? { credit: item.credit } : {}),
      style: { width: imageSteps, height }
    }
  }
  return componentNode(item.component, info, taken, item.props)
}

/** Where an item goes: the layout (or component, with `slot`) it goes into, and where among its children. */
export interface InsertAt {
  parent: string
  /** Its place among the parent's children; the end when left out. */
  index?: number
  slot?: string
}

/** What inserting needs to know beyond the design. */
export interface InsertContext {
  /** What the item's component takes, when it's a component the project knows. */
  info?: ComponentInfo
  /** Where the project's and its libraries' components come from, for the parents a library part needs around it. */
  sources: Record<string, ComponentSource>
  /** Every component design instances can place, for baking a detached copy. */
  library: ComponentLibrary
}

/**
 * Inserts an item into a design, inside the library parents it needs that aren't around it already. A detached copy
 * becomes the plain layers its design shows. Returns the design, and the inserted layer's id, which a detached copy
 * keeps, so it's selected the same way.
 */
export function insertIntoDesign(
  container: ContainerSpec,
  at: InsertAt,
  item: InsertItem,
  context: InsertContext
): { container: ContainerSpec; node: string } {
  const taken = nodeIds(container.root)
  const part = nodeForItem(item, context.info, taken)
  const location = locateNode(container.root, at.parent)
  const around = location
    ? [...location.ancestors, location.node].flatMap((node) => (node.type === "component" ? [node.component] : []))
    : []
  const node = withLibraryContext(part, context.sources, around, taken)
  const placed = {
    ...container,
    root: insertNode(container.root, at.parent, node, { index: at.index, slot: at.slot })
  }
  return {
    container: item.kind === "instance" && item.detached ? detachInstance(placed, part.id, context.library) : placed,
    node: part.id
  }
}

/**
 * Where a click inserts, rather than a drag, with `node` the selected layer: into it when it's a layout, else just
 * after it in its layout or slot; with no layer selected, at the end of the design's root. Undefined when there's
 * nowhere to insert: the layer isn't in the design, it's a root that isn't a layout, or the root isn't one.
 */
export function whereToInsert(root: DesignNode, node?: string): InsertAt | undefined {
  if (node) {
    const location = locateNode(root, node)
    if (!location) return undefined
    if (location.node.type === "layout") return { parent: location.node.id }
    const parent = location.ancestors.at(-1)
    if (!parent) return undefined
    return { parent: parent.id, index: location.index + 1, ...(location.slot ? { slot: location.slot } : {}) }
  }
  return root.type === "layout" ? { parent: root.id } : undefined
}

/** A box on screen, as the DOM measures one. */
export interface ScreenBox {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/** A line to draw where a drop lands, in the same coordinates as the boxes it came from. */
export interface DropLine {
  x: number
  y: number
  w: number
  h: number
}

/** The layout a drop goes into, as the canvas draws it. */
export interface DropLayout {
  /** Whether it lays its children out in a row; a column otherwise. */
  row: boolean
  box: ScreenBox
  /** Its drawn children's boxes, each with its place among all its children, in order. */
  children: { index: number; box: ScreenBox }[]
  /** How many children it has, drawn or not. */
  count: number
}

/** The layout a drop at a layer goes into: the deepest layout in the chain from the design's root down to the layer. */
export function dropLayout(chain: readonly DesignNode[]): LayoutNode | undefined {
  return chain.findLast((node): node is LayoutNode => node.type === "layout")
}

/**
 * Where among a layout's children a drop at `point` lands: before the first child whose middle is past the point along
 * the layout's direction, else at the end. Returns that place, and the line to draw there.
 */
export function dropAt(layout: DropLayout, point: { x: number; y: number }): { index: number; line: DropLine } {
  const { row, box, children } = layout
  const after = children.find((child) =>
    row ? point.x < child.box.left + child.box.width / 2 : point.y < child.box.top + child.box.height / 2
  )
  const last = children.at(-1)
  const index = after?.index ?? layout.count
  let edge: number
  if (after) edge = row ? after.box.left - 2 : after.box.top - 2
  else if (last) edge = row ? last.box.right + 1 : last.box.bottom + 1
  else edge = row ? box.left + 4 : box.top + 4
  const beside = (after ?? last)?.box
  const line = row
    ? { x: edge, y: beside?.top ?? box.top + 4, w: 2, h: beside?.height ?? box.height - 8 }
    : { x: box.left + 4, y: edge, w: box.width - 8, h: 2 }
  return { index, line }
}
