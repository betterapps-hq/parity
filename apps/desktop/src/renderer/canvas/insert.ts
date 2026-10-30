import {
  dropAt,
  type DropLine,
  dropLayout,
  type InsertAt,
  type InsertItem,
  insertIntoDesign,
  insertLabel,
  whereToInsert
} from "@parity-app/editor"
import type { ContainerEntry, DesignStore } from "../design-store.ts"
import { findNodeElement, nodeBox } from "../frame.ts"
import type { ProjectSession } from "../workspace.ts"
import { hitTest, type Point } from "./hit.ts"

/**
 * Inserting from the Assets panel, by a drop on the canvas or a click. The rules are `@parity-app/editor`'s; this
 * measures the layout under the pointer, and applies them to the selection and the store.
 */

/** The drag data type for items dragged from the Components panel onto the canvas. */
export const insertMime = "application/x-parity-insert"

export interface DropTarget extends InsertAt {
  entry: ContainerEntry
  index: number
  mode: string
  state: string
  /** Where the item would land, as a line in client coordinates. */
  line: DropLine
}

/**
 * Where a drop at a point lands: the deepest layout under it, between the children either side of the point along the
 * layout's direction, with the line to draw there.
 */
export function dropTarget(area: ParentNode, store: DesignStore, point: Point): DropTarget | undefined {
  const hit = hitTest(area, store, point)
  if (!hit) return undefined
  const layout = dropLayout(hit.chain)
  if (!layout) return undefined
  const element = findNodeElement(hit.host, layout.id)
  if (!element) return undefined
  const children = layout.children.flatMap((child, index) => {
    const box = nodeBox(hit.host, child.id)
    return box ? [{ index, box }] : []
  })
  const { index, line } = dropAt(
    {
      row: getComputedStyle(element).flexDirection.startsWith("row"),
      box: element.getBoundingClientRect(),
      children,
      count: layout.children.length
    },
    point
  )
  return { entry: hit.entry, parent: layout.id, index, mode: hit.mode, state: hit.state, line }
}

/** Inserts an item into a layout, as one undoable step, and selects it. Returns its id, unless the design is gone. */
export function insertItem(
  session: ProjectSession,
  target: InsertAt & { entry: ContainerEntry; mode?: string; state?: string },
  item: InsertItem
): string | undefined {
  const { store, selection, components } = session
  const context = {
    info: item.kind === "component" ? components.get()[item.component] : undefined,
    sources: session.info.sources,
    library: store.getComponentLibrary()
  }
  let node: string | undefined
  store.updateContainer(target.entry.key, insertLabel(item), (container) => {
    const inserted = insertIntoDesign(container, target, item, context)
    node = inserted.node
    return inserted.container
  })
  if (node) selection.set({ design: target.entry.key, node, mode: target.mode, state: target.state })
  return node
}

/**
 * Inserts at the selection, for a click instead of a drag: into a selected layout, after any other selected layer, or
 * at the end of a selected design. Returns false when nothing is selected to insert into.
 */
export function insertAtSelection(session: ProjectSession, item: InsertItem): boolean {
  const current = session.selection.get()
  const entry = current.design ? session.store.getEntry(current.design) : undefined
  if (!entry) return false
  const at = whereToInsert(entry.container.root, current.node)
  if (!at) return false
  insertItem(session, { entry, ...at, mode: current.mode, state: current.state }, item)
  return true
}
