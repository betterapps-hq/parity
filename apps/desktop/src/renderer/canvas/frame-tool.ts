import {
  clickedFrameSize,
  draggedBox,
  drawnFrame,
  type FramePreset,
  snaps,
  snapToEdges,
  withFrameSize
} from "@parity-app/editor"
import { useSyncExternalStore } from "react"
import { getPreferences } from "../chrome/preferences.ts"
import type { ProjectDesigns, ProjectSession } from "../workspace.ts"
import { canvasIdFor } from "./CanvasEditor.tsx"
import { followPress, gestures } from "./gesture.ts"
import type { Point } from "./hit.ts"
import { viewCenter } from "./new-screen.ts"

/**
 * The frame tool (F, PAR-545): a drag on the canvas draws a frame, snapping to the edges of the designs around it, and a
 * click makes a 100 × 100 one, as Figma's does. Either is named Frame 1, Frame 2 and so on, selected, with the move
 * tool back. The tool's menu places a frame at one of the modes' sizes, or resizes the selected frame to it. The rules
 * are `@parity-app/editor`'s (frames.ts); this follows the pointer and adds the frame to the store.
 */

/** How near an edge, in screen pixels, a dragged corner snaps to it. */
const snapReach = 6

/** The frame being dragged out, in the canvas area's pixels, with its size in the canvas's and any snapping guides. */
export interface FrameDrawing {
  box: { x: number; y: number; w: number; h: number }
  size: { width: number; height: number }
  guides: { x?: number; y?: number }
}

let drawing: FrameDrawing | undefined
const listeners = new Set<() => void>()

function show(next: FrameDrawing | undefined): void {
  drawing = next

  for (const listener of listeners) {
    listener()
  }
}

/** The frame being drawn, for the overlay to draw. */
export function useFrameDrawing(): FrameDrawing | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    () => drawing
  )
}

/** Adds a frame, selects it, and goes back to the move tool, as one undo step. Returns its key. */
function addFrame(session: ProjectDesigns, at: Point, size: { width: number; height: number }): string {
  const { store, selection } = session

  const frame = drawnFrame(
    store.getEntries().map((entry) => entry.container),
    at,
    size
  )

  const key = store.addContainer(store.mainPath, frame, "Draw frame")
  selection.set({ design: key })
  selection.setTool("select")

  return key
}

/**
 * Follows a press with the frame tool on the canvas area, from `event`: a drag draws a frame from where it began, a
 * click makes one there at 100 × 100. Escape, or the window losing focus, draws nothing. Ctrl or Cmd stops snapping.
 */
export function drawFrame(
  session: ProjectDesigns & Pick<ProjectSession, "editor">,
  area: HTMLElement,
  event: PointerEvent
): void {
  const { editor, store } = session

  if (!editor) {
    return
  }

  const toPage = (point: { clientX: number; clientY: number }) =>
    editor.screenToPage({ x: point.clientX, y: point.clientY })

  const from = toPage(event)

  const boxes = store.getEntries().flatMap((entry) => {
    const bounds = editor.getShapePageBounds(canvasIdFor(entry.key))

    return bounds ? [bounds] : []
  })

  const toArea = (page: Point) => {
    const screen = editor.pageToScreen(page)
    const rect = area.getBoundingClientRect()

    return { x: screen.x - rect.left, y: screen.y - rect.top }
  }

  let last: { x: number; y: number; width: number; height: number } | undefined
  followPress(gestures.frameDraw, store, event, {
    cursor: "crosshair",
    move(moveEvent) {
      const free = toPage(moveEvent)
      const snapping = snaps(moveEvent, getPreferences().snapping)

      const { point, guides } = snapping
        ? snapToEdges(free, boxes, snapReach / editor.getZoomLevel())
        : { point: free, guides: {} }

      last = draggedBox(from, point)
      const topLeft = toArea({ x: last.x, y: last.y })
      const bottomRight = toArea({ x: last.x + last.width, y: last.y + last.height })
      const shownGuides: FrameDrawing["guides"] = {}

      if (guides.x !== undefined) {
        shownGuides.x = toArea({ x: guides.x, y: 0 }).x
      }

      if (guides.y !== undefined) {
        shownGuides.y = toArea({ x: 0, y: guides.y }).y
      }

      show({
        box: { x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y },
        size: { width: last.width, height: last.height },
        guides: shownGuides
      })
    },
    end(kept) {
      show(undefined)

      if (kept && last) {
        addFrame(session, { x: last.x, y: last.y }, last)
      }
    },
    click() {
      addFrame(session, { x: Math.round(from.x), y: Math.round(from.y) }, clickedFrameSize)
    }
  })
}

/**
 * A size from the frame tool's menu: the selected frame, `frame`, takes it, as one undo step; with none selected, a new
 * frame at that size goes in the middle of the view.
 */
export function placeFrame(
  session: ProjectDesigns & Pick<ProjectSession, "editor">,
  preset: FramePreset,
  frame?: string
): void {
  const size = { width: preset.width, height: preset.height }

  if (frame) {
    session.store.updateContainer(frame, `Resize frame to ${preset.name}`, (design) => withFrameSize(design, size))

    return
  }

  const middle = viewCenter(session.editor)
  addFrame(session, { x: middle.x - size.width / 2, y: middle.y - size.height / 2 }, size)
}
