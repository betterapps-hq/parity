import {
  type Box,
  designOfItem,
  type InsertAt,
  type InsertContext,
  type InsertItem,
  insertIntoDesign,
  insertLabel,
  type Point,
  whereToInsert
} from "@parity-app/editor"
import type { ContainerEntry } from "../design-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { designNames, viewCenter } from "./new-screen.ts"
import { type HereMeasures, placeAtPoint } from "./paste-here.ts"

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
  /** The layout it goes into, on screen. */
  box: Box
  /** Where among the children it lands, as a line on screen; none in an absolutely placed layout. */
  line?: Box
}

/**
 * Where an item dragged from the panel and dropped at a point lands (PAR-205): the deepest of the design's own layouts
 * under it, in the frame there, at the slot under the pointer, as a dragged layer, a dropped image file and Paste here
 * land (`placeAtPoint`, through `slotHere` and `slotAt`), so in a grid or a wrapping row the line of children the
 * pointer is on comes first. In an absolutely placed layout it goes last, at the pointer. A drag passes `measures`, so
 * the layout under the pointer is measured once while it stays over it, not at every event.
 */
export function dropTarget(
  session: ProjectSession,
  area: ParentNode,
  point: Point,
  measures?: HereMeasures
): DropTarget | undefined {
  const place = placeAtPoint(session, area, point, measures)
  if (place.kind !== "layout") return undefined
  const { hit, slot } = place
  const { box } = place.here
  return {
    entry: hit.entry,
    parent: slot.layout,
    index: slot.index,
    ...(slot.slot ? { slot: slot.slot } : {}),
    mode: hit.mode,
    state: hit.state,
    box: { x: box.left, y: box.top, w: box.right - box.left, h: box.bottom - box.top },
    ...(slot.line ? { line: slot.line } : {}),
    ...(slot.free ? { at: slot.at } : {})
  }
}

/** What inserting an item needs to know from the project: its component's props, the sources and the library. */
export function insertContext(session: ProjectSession, item: InsertItem): InsertContext {
  return {
    info: item.kind === "component" ? session.components.get()[item.component] : undefined,
    sources: session.info.sources,
    library: session.store.getComponentLibrary()
  }
}

/** Inserts an item into a layout, as one undoable step, and selects it. Returns its id, unless the design is gone. */
export function insertItem(
  session: ProjectSession,
  target: InsertAt & { entry: ContainerEntry; mode?: string; state?: string },
  item: InsertItem
): string | undefined {
  const { store, selection } = session
  const context = insertContext(session, item)
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
 * An item with no design to go into, dropped on the empty canvas or inserted with nothing selected, makes a new frame
 * holding it, with its top left `at`, named after it (`designOfItem`, PAR-546, PAR-545). One undo step, and the frame
 * is selected, as a paste there selects the frame it makes.
 */
export function addFrameOfItem(session: ProjectSession, item: InsertItem, at = viewCenter(session)): string {
  const { store, selection } = session
  const { design } = designOfItem(
    item,
    insertContext(session, item),
    store.getEntries().map((entry) => entry.container.id),
    at,
    designNames(session)
  )
  const key = store.addContainer(store.mainPath, design, insertLabel(item))
  selection.set({ design: key })
  return key
}

/**
 * Inserts at the selection, for a click instead of a drag: into a selected layout or slot of an instance, after any
 * other selected layer, or at the end of a selected design. With no design selected, it lands on the canvas, so it makes a new frame there, in
 * the middle of the view (PAR-546). Returns false when the selected design has nowhere to insert it.
 */
export function insertAtSelection(session: ProjectSession, item: InsertItem): boolean {
  const current = session.selection.get()
  if (!current.design) {
    addFrameOfItem(session, item)
    return true
  }
  const entry = session.store.getEntry(current.design)
  if (!entry) return false
  const at = whereToInsert(entry.container.root, current.node, session.store.getComponentLibrary())
  if (!at) return false
  insertItem(session, { entry, ...at, mode: current.mode, state: current.state }, item)
  return true
}
