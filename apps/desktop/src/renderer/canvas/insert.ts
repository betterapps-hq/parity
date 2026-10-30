import {
  type ComponentInfo,
  componentNode,
  type DesignNode,
  type ImageCredit,
  generateId,
  insertNode,
  locateNode,
  nodeIds,
  type ContainerSpec,
  withLibraryContext
} from "@parity/core"
import type { ContainerEntry, DesignStore } from "../design-store.ts"
import { findNodeElement, nodeBox } from "../frame.ts"
import type { ProjectSession } from "../workspace.ts"
import { hitTest, type Point } from "./hit.ts"

// Where a library part goes when it's inserted, shared with `parity lib check`, which tries it the same way.
export { withLibraryContext }

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
  | { kind: "instance"; design: string }
  | { kind: "image"; src: string; alt?: string; credit?: ImageCredit; width: number; height: number }

/** Images go in this many spacing steps wide (320px at 4px a step), their height following their shape. */
const imageSteps = 80

/** The drag data type for items dragged from the Components panel onto the canvas. */
export const insertMime = "application/x-parity-insert"

/** The component's name without its library: `nova/Button` reads as Button. */
export function componentLabel(component: string): string {
  return component.split("/").at(-1) ?? component
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

export interface DropTarget {
  entry: ContainerEntry
  /** The layout the item goes into, and where among its children. */
  parent: string
  index: number
  mode: string
  state: string
  /** Where the item would land, as a line in client coordinates. */
  line: { x: number; y: number; w: number; h: number }
}

/**
 * Where a drop at a point lands: the deepest layout under it, between the children either side of the point along the
 * layout's direction, with the line to draw there.
 */
export function dropTarget(area: ParentNode, store: DesignStore, point: Point): DropTarget | undefined {
  const hit = hitTest(area, store, point)
  if (!hit) return undefined
  const layout = hit.chain.findLast((node) => node.type === "layout")
  if (layout?.type !== "layout") return undefined
  const element = findNodeElement(hit.host, layout.id)
  if (!element) return undefined
  const row = getComputedStyle(element).flexDirection.startsWith("row")
  const box = element.getBoundingClientRect()
  const children = layout.children
    .map((child, index) => ({ index, rect: nodeBox(hit.host, child.id) }))
    .filter((child): child is { index: number; rect: DOMRect } => !!child.rect)
  const after = children.find((child) =>
    row ? point.x < child.rect.left + child.rect.width / 2 : point.y < child.rect.top + child.rect.height / 2
  )
  const index = after?.index ?? layout.children.length
  let edge: number
  if (after) edge = row ? after.rect.left - 2 : after.rect.top - 2
  else if (children.length > 0) edge = row ? children.at(-1)!.rect.right + 1 : children.at(-1)!.rect.bottom + 1
  else edge = row ? box.left + 4 : box.top + 4
  const line = row
    ? {
        x: edge,
        y: (after ?? children.at(-1))?.rect.top ?? box.top + 4,
        w: 2,
        h: (after ?? children.at(-1))?.rect.height ?? box.height - 8
      }
    : { x: box.left + 4, y: edge, w: box.width - 8, h: 2 }
  return { entry: hit.entry, parent: layout.id, index, mode: hit.mode, state: hit.state, line }
}

/** Inserts an item into a layout, as one undoable step, and selects it. */
export function insertItem(
  session: ProjectSession,
  target: { entry: ContainerEntry; parent: string; index?: number; slot?: string; mode?: string; state?: string },
  item: InsertItem
): string {
  const { store, selection, components } = session
  const info = item.kind === "component" ? components.get()[item.component] : undefined
  const taken = nodeIds(target.entry.container.root)
  const part = nodeForItem(item, info, taken)
  const location = locateNode(target.entry.container.root, target.parent)
  const around = location
    ? [...location.ancestors, location.node].flatMap((node) => (node.type === "component" ? [node.component] : []))
    : []
  const node = withLibraryContext(part, session.info.sources, around, taken)
  let label = "image"
  if (item.kind === "component") label = componentLabel(item.component)
  else if (item.kind === "instance") label = "component"
  store.updateContainer(target.entry.key, `Add ${label}`, (container: ContainerSpec) => ({
    ...container,
    root: insertNode(container.root, target.parent, node, { index: target.index, slot: target.slot })
  }))
  selection.set({ design: target.entry.key, node: part.id, mode: target.mode, state: target.state })
  return part.id
}

/**
 * Inserts at the selection, for a click instead of a drag: into a selected layout, after any other selected layer, or
 * at the end of a selected design. Returns false when nothing is selected to insert into.
 */
export function insertAtSelection(session: ProjectSession, item: InsertItem): boolean {
  const current = session.selection.get()
  const entry = current.design ? session.store.getEntry(current.design) : undefined
  if (!entry) return false
  const { root } = entry.container
  if (current.node) {
    const location = locateNode(root, current.node)
    if (!location) return false
    if (location.node.type === "layout") {
      insertItem(session, { entry, parent: location.node.id, ...current }, item)
      return true
    }
    const parent = location.ancestors.at(-1)
    if (!parent) return false
    insertItem(session, { entry, parent: parent.id, index: location.index + 1, slot: location.slot, ...current }, item)
    return true
  }
  if (root.type !== "layout") return false
  insertItem(session, { entry, parent: root.id, ...current }, item)
  return true
}
