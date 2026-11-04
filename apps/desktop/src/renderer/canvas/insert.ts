import {
  type InsertAt,
  type InsertItem,
  insertIntoDesign,
  insertLabel,
  slotHere,
  whereToInsert
} from "@parity-app/editor"
import { editingState } from "../chrome/LayerPanel.tsx"
import type { ContainerEntry } from "../design-store.ts"
import { spacingUnit } from "../tokens-store.ts"
import type { ProjectSession } from "../workspace.ts"
import { hitTest, type Point } from "./hit.ts"
import { measureHere } from "./paste-here.ts"
import { frameViewport } from "./view.ts"

/**
 * Inserting from the Assets panel, by a drop on the canvas or a click. The rules are `@parity-app/editor`'s; this
 * measures the layout under the pointer, and applies them to the selection and the store.
 */

/** The drag data type for items dragged from the Components panel onto the canvas. */
export const insertMime = "application/x-parity-insert"

/** A box on screen, in client coordinates. */
interface ScreenRect {
  x: number
  y: number
  w: number
  h: number
}

export interface DropTarget extends InsertAt {
  entry: ContainerEntry
  index: number
  mode: string
  state: string
  /** The layout it goes into, on screen. */
  box: ScreenRect
  /** Where among the children it lands, as a line on screen; none in an absolutely placed layout. */
  line?: ScreenRect
}

/**
 * Where an item dragged from the panel and dropped at a point lands (PAR-205): the deepest of the design's own layouts
 * under it, in the frame there, at the slot under the pointer, as a dragged layer, a dropped image file and Paste here
 * land (`slotHere`, through `slotAt`), so in a grid or a wrapping row the line of children the pointer is on comes
 * first. In an absolutely placed layout it goes last, at the pointer.
 */
export function dropTarget(session: ProjectSession, area: ParentNode, point: Point): DropTarget | undefined {
  const { store, editor } = session
  const hit = hitTest(area, store, point, editor)
  const here = hit && measureHere(hit, point, spacingUnit(session.tokens.get()))
  if (!hit || !here) return undefined
  const state = editingState(hit.entry.container, hit.state)
  const slot = slotHere(hit.entry.container, here, state, frameViewport(store.getModes(), hit.mode))
  if (!slot) return undefined
  const { box } = here
  return {
    entry: hit.entry,
    parent: slot.layout,
    index: slot.index,
    mode: hit.mode,
    state: hit.state,
    box: { x: box.left, y: box.top, w: box.right - box.left, h: box.bottom - box.top },
    ...(slot.line ? { line: slot.line } : {}),
    ...(slot.free ? { at: slot.at } : {})
  }
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
