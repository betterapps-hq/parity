import {
  type ComponentInfo,
  type ComponentLibrary,
  componentNode,
  type ComponentSource,
  type ContainerSpec,
  type DesignNode,
  type ImageNode,
  type VideoNode,
  detachInstance,
  finiteNumber,
  generateId,
  imageCredit,
  insertNode,
  jsonText,
  locateNode,
  nodeIds,
  plainObject,
  slotAtPath,
  withLibraryContext
} from "@parity-app/core"
import { z } from "zod"
import { placedAt } from "./paste-here.ts"

/**
 * Inserting from the Assets panel: the layer an item becomes, where a click or a drop puts it, and the design with it
 * in. The app reads the selection, the components and the boxes the canvas draws, passes them in, and applies the
 * design that comes back as one undo step.
 */

/** A picture or a video, at its own size in pixels, with what it shows and who made it. */
const mediaItem = z.object({
  src: z.string(),
  alt: z.string().optional(),
  credit: imageCredit.optional(),
  width: finiteNumber,
  height: finiteNumber
})

/**
 * Something from the Assets panel or the Media tab: one of the project's or a library's components (icons included), a
 * component design, an image or a video.
 */
const insertItem = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("component"),
    component: z.string(),
    /** Props it starts with, such as the weight a Phosphor icon is drawn in. */
    props: plainObject.optional()
  }),
  z.object({
    kind: z.literal("instance"),
    design: z.string(),
    /** Placed as a copy of what it shows, no longer linked, as a library's design can be. */
    detached: z.literal(true).optional()
  }),
  mediaItem.extend({ kind: z.literal("image") }),
  mediaItem.extend({ kind: z.literal("video") })
])

export type InsertItem = z.infer<typeof insertItem>

/** The item dragged from the Assets panel, read back from the drag's text, or undefined when it doesn't parse. */
export function readInsertItem(text: string): InsertItem | undefined {
  return jsonText(insertItem).safeParse(text).data
}

/** Images and videos go in this many spacing steps wide (320px at 4px a step), their height following their shape. */
const imageSteps = 80

/** The component's name without its library: `nova/Button` reads as Button. */
export function componentLabel(component: string): string {
  return component.split("/").at(-1) ?? component
}

/** The undo step's label for inserting an item: "Add Button", "Add component", "Add copy", "Add image" or "Add video". */
export function insertLabel(item: InsertItem): string {
  if (item.kind === "component") {
    return `Add ${componentLabel(item.component)}`
  }

  if (item.kind === "instance") {
    return item.detached ? "Add copy" : "Add component"
  }

  return item.kind === "video" ? "Add video" : "Add image"
}

/**
 * A new node for an item, ready to show something: required props get their default or first option, and a component
 * that takes children gets its own name as text, so it isn't an empty box, unless it sets its own size (see
 * `componentNode`).
 */
export function nodeForItem(item: InsertItem, info: ComponentInfo | undefined, taken: Set<string>): DesignNode {
  if (item.kind === "instance") {
    return { type: "instance", id: generateId(taken), design: item.design }
  }

  if (item.kind === "image" || item.kind === "video") {
    const height = Math.max(1, Math.round((imageSteps * item.height) / Math.max(1, item.width)))

    const media: ImageNode | VideoNode = { type: item.kind, id: generateId(taken), src: item.src }

    if (item.alt) {
      media.alt = item.alt
    }

    if (item.credit) {
      media.credit = item.credit
    }

    media.style = { width: imageSteps, height }

    return media
  }

  return componentNode(item.component, info, taken, item.props)
}

/** Where an item goes: the layout (or component, with `slot`) it goes into, and where among its children. */
export interface InsertAt {
  parent: string
  /** Its place among the parent's children; the end when left out. */
  index?: number
  slot?: string
  /**
   * Placed absolutely at these insets, in half steps of the spacing scale, as an item dropped in an absolutely placed
   * layout goes at the pointer (see `slotHere`).
   */
  at?: { left: number; top: number }
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

/** A design with an item inserted, and the inserted layer's id. */
export interface Inserted {
  container: ContainerSpec
  node: string
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
): Inserted {
  const taken = nodeIds(container.root)
  const part = nodeForItem(item, context.info, taken)
  const location = locateNode(container.root, at.parent)

  const around = location
    ? [...location.ancestors, location.node].flatMap((node) => (node.type === "component" ? [node.component] : []))
    : []

  const inContext = withLibraryContext(part, context.sources, around, taken)
  const node = at.at ? placedAt(inContext, at.at) : inContext

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
 * after it in its layout or slot; into the end of a selected slot of one of the design's instances (see `slotAtPath`);
 * with no layer selected, at the end of the design's root. Undefined when there's nowhere to insert: the layer isn't in
 * the design, it's a root that isn't a layout, or the root isn't one.
 */
export function whereToInsert(root: DesignNode, node?: string, library?: ComponentLibrary): InsertAt | undefined {
  const slot = node && library ? slotAtPath(root, node, library) : undefined

  if (slot) {
    return { parent: slot.instance.id, slot: slot.slot.name }
  }

  if (node) {
    const location = locateNode(root, node)

    if (!location) {
      return undefined
    }

    if (location.node.type === "layout") {
      return { parent: location.node.id }
    }

    const parent = location.ancestors.at(-1)

    if (!parent) {
      return undefined
    }

    const after: InsertAt = { parent: parent.id, index: location.index + 1 }

    if (location.slot) {
      after.slot = location.slot
    }

    return after
  }

  return root.type === "layout" ? { parent: root.id } : undefined
}
