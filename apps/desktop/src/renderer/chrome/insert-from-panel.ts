import type { InsertItem } from "@parity-app/editor"
import type { DragEvent } from "react"
import { toast } from "sonner"
import { insertDrag } from "../canvas/gesture.ts"
import { insertAtSelection, insertMime } from "../canvas/insert.ts"
import type { ProjectDesigns, ProjectSession } from "../workspace.ts"

/*
 * What every tab of things to insert shares: a click adds the item where the selection is, and a drag carries it onto
 * the canvas, where `CanvasDrop` places it.
 */

/**
 * Adds an item where the selection is, or as a new screen in the middle of the view with nothing selected, or says
 * what to select when the selected design has nowhere for it.
 */
export function addAtSelection(
  session: ProjectDesigns & Pick<ProjectSession, "components" | "editor" | "info">,
  item: InsertItem
): void {
  if (!insertAtSelection(session, item)) {
    toast.info("Select a layout, or a layer to add it after")
  }
}

/** Props that make an element drag an item onto the canvas. */
export function dragItem(item: InsertItem) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(insertMime, JSON.stringify(item))
      event.dataTransfer.effectAllowed = "copy"
      insertDrag.start()
    },
    onDragEnd: () => insertDrag.end()
  }
}
