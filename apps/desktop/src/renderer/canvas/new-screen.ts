import type { DesignNode } from "@parity-app/core"
import { type DesignName, designOfLayers } from "@parity-app/editor"
import type { ProjectSession } from "../workspace.ts"
import { hitTest, type Point } from "./hit.ts"

/**
 * What lands on empty space on the canvas makes a screen there, named after what's in it (PAR-546): pasted layers, a
 * layout or text from the insert picker, a component or design dropped from the Assets panel or inserted with nothing
 * selected, and image files. The rule and the names are `@parity-app/editor`'s (`designOfLayers`, `designOfItem`,
 * `designOfImages`); this finds the empty canvas and the middle of the view, and adds the screen to the store.
 */

/**
 * The point on the page under a point on screen (client coordinates), when it's the empty canvas: not over a design's
 * frame, nor over its board around the frames. Undefined otherwise, or before the canvas is drawn.
 */
export function emptyCanvasAt(session: ProjectSession, area: ParentNode, point: Point): Point | undefined {
  const { store, editor } = session
  if (!editor || hitTest(area, store, point, editor)) return undefined
  const page = editor.screenToPage(point)
  const board = editor.getShapeAtPoint(page, { hitInside: true, filter: (shape) => shape.type === "canvas-container" })
  return board ? undefined : { x: Math.round(page.x), y: Math.round(page.y) }
}

/** The middle of the view, on the page: where what's added with nothing selected goes. */
export function viewCenter(session: ProjectSession): Point {
  const bounds = session.editor?.getViewportPageBounds()
  return bounds ? { x: Math.round(bounds.midX), y: Math.round(bounds.midY) } : { x: 0, y: 0 }
}

/** A design's name by its id, the project's own or a library's, as the Layers panel names an instance. */
export function designNames(session: ProjectSession): DesignName {
  const { store } = session
  const entries = store.getEntries()
  return (id) =>
    entries.find((entry) => entry.container.id === id)?.container.name ?? store.getComponentLibrary().get(id)?.name
}

/**
 * Layers with no design to go into make a new screen with its top left `at`, named after them (`designOfLayers`), as
 * one undo step, `label`. The screen is selected. Returns its key.
 */
export function addScreenOfLayers(
  session: ProjectSession,
  nodes: readonly DesignNode[],
  at: Point,
  label: string
): string {
  const { store, selection } = session
  const ids = store.getEntries().map((entry) => entry.container.id)
  const key = store.addContainer(store.mainPath, designOfLayers(nodes, ids, at, designNames(session)), label)
  selection.set({ design: key })
  return key
}
