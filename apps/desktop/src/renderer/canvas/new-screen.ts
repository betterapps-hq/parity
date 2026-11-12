import type { DesignNode } from "@parity-app/core"
import { type DesignName, designOfLayers, frameOfText } from "@parity-app/editor"
import type { Editor } from "tldraw"
import type { DesignStore } from "../design-store.ts"
import type { ProjectDesigns, ProjectSession } from "../workspace.ts"
import { hitTest, type Point } from "./hit.ts"

/**
 * What lands on empty space on the canvas makes a frame there, named after what's in it (PAR-546, PAR-545): pasted layers, a
 * layout or text from the insert picker, a component or design dropped from the Assets panel or inserted with nothing
 * selected, and image files. The rule and the names are `@parity-app/editor`'s (`designOfLayers`, `designOfItem`,
 * `designOfImages`); this finds the empty canvas and the middle of the view, and adds the frame to the store.
 */

/**
 * The point on the page under a point on screen (client coordinates), when it's the empty canvas: not over a design's
 * frame, nor over its board around the frames. Undefined otherwise, or before the canvas is drawn.
 */
export function emptyCanvasAt(
  session: Pick<ProjectSession, "editor" | "store">,
  area: ParentNode,
  point: Point
): Point | undefined {
  const { store, editor } = session

  if (!editor || hitTest(area, store, point, editor)) {
    return undefined
  }

  const page = editor.screenToPage(point)
  const board = editor.getShapeAtPoint(page, { hitInside: true, filter: (item) => item.type === "canvas-container" })

  return board ? undefined : { x: Math.round(page.x), y: Math.round(page.y) }
}

/** The middle of the view, on the page: where what's added with nothing selected goes. */
export function viewCenter(editor: Editor | undefined): Point {
  const bounds = editor?.getViewportPageBounds()

  return bounds ? { x: Math.round(bounds.midX), y: Math.round(bounds.midY) } : { x: 0, y: 0 }
}

/** A design's name by its id, the project's own or a library's, as the Layers panel names an instance. */
export function designNames(store: DesignStore): DesignName {
  const entries = store.getEntries()

  return (id) =>
    entries.find((entry) => entry.container.id === id)?.container.name ?? store.getComponentLibrary().get(id)?.name
}

/**
 * Layers with no design to go into make a new frame with its top left `at`, named after them (`designOfLayers`), as
 * one undo step, `label`. The frame is selected. Returns its key.
 */
export function addFrameOfLayers(
  session: ProjectDesigns,
  nodes: readonly DesignNode[],
  at: Point,
  label: string
): string {
  const { store, selection } = session
  const ids = store.getEntries().map((entry) => entry.container.id)
  const key = store.addContainer(store.mainPath, designOfLayers(nodes, ids, at, designNames(store)), label)
  selection.set({ design: key })

  return key
}

/** A frame added for text: its design's key, and the text layer's id. */
export interface FrameOfText {
  key: string
  node: string
}

/**
 * Text on the empty canvas, from the text tool or a paste: a text layer in a frame that hugs it, with its top left
 * `at`, named after its text (`frameOfText`), as one undo step, `label`. The frame is selected. Returns its key and the
 * text layer's id, which the text tool edits in place.
 */
export function addFrameOfText(session: ProjectDesigns, text: string, at: Point, label: string): FrameOfText {
  const { store, selection } = session

  const { design, node } = frameOfText(
    text,
    store.getEntries().map((entry) => entry.container.id),
    at
  )

  const key = store.addContainer(store.mainPath, design, label)
  selection.set({ design: key })

  return { key, node }
}
