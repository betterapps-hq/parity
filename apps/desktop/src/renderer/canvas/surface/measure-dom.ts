import type { Editor } from "tldraw"
import { findFrames, findNodeElement, nodesAt } from "../../frame.ts"
import { frameGeometry } from "../frame-geometry.ts"
import { createCanvasId } from "../tldraw-names.ts"
import type { MeasuredFrame, MeasurePort } from "./measure.ts"
import type { Drawn, Point, Rect } from "./types.ts"

/** A box the browser gives, as `getBoundingClientRect` does. */
interface ClientBox {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * The measuring service's view of a project tab's canvas: tldraw for boards and the page, and the frames' own elements,
 * through `frame-geometry.ts`, for frames and nodes.
 */
export function domMeasurePort(editor: Editor): MeasurePort {
  const area = () => editor.getContainer()

  const toPage = (box: ClientBox): Rect => {
    const from = editor.screenToPage({ x: box.left, y: box.top })
    const to = editor.screenToPage({ x: box.right, y: box.bottom })

    return { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y }
  }

  const toClient = (at: Point): Point => editor.pageToScreen(at)

  const boardElement = (design: string) =>
    area().querySelector<HTMLElement>(`.container-view[data-design="${CSS.escape(design)}"]`) ?? undefined

  /** A corner radius in page units, from an element drawn `scale` screen pixels to its own. */
  const radiusOf = (element: Element | undefined, scale: number) =>
    element
      ? ((Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0) * scale) / editor.getZoomLevel()
      : 0

  /** Something drawn at `scale` screen pixels to a design pixel. */
  const drawnAt = (box: ClientBox, scale: number, element: Element | undefined): Drawn => ({
    box: toPage(box),
    radius: radiusOf(element, scale),
    size: { width: (box.right - box.left) / scale, height: (box.bottom - box.top) / scale }
  })

  const frameOf = (host: HTMLElement): MeasuredFrame => ({
    mode: host.dataset.mode,
    state: host.dataset.state,
    primary: host.dataset.primary === "true",
    asleep: host.closest("[data-asleep]") !== null,
    measure: () => {
      const geometry = frameGeometry(host)

      return drawnAt(geometry.rect, geometry.scale, host)
    },
    node: (id) => {
      const node = frameGeometry(host).node(id)

      return node && drawnAt(node.box, node.scale, node.hasElement ? findNodeElement(host, id) : undefined)
    },
    contains: (at) => {
      const { x, y } = toClient(at)
      const rect = host.getBoundingClientRect()

      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    },
    nodesAt: (at) => nodesAt(host, toClient(at))
  })

  return {
    board: (design) => {
      // As `canvasIdFor` in CanvasEditor.tsx names a design's board.
      const record = editor.getShape(createCanvasId(encodeURIComponent(design)))
      const bounds = record && editor.getShapePageBounds(record)

      if (!bounds) {
        return undefined
      }

      // The board is drawn in page units, so its own CSS pixels are the page's.
      const element = boardElement(design)

      return {
        box: { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h },
        radius: element ? Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0 : 0,
        size: { width: bounds.w, height: bounds.h }
      }
    },
    boardDrawn: (design) => boardElement(design) !== undefined,
    frames: (design) => findFrames(area(), design).map(frameOf),
    designAt: (at) => {
      const board = editor.getShapeAtPoint(at, { hitInside: true, filter: (item) => item.type === "canvas-container" })

      return board?.type === "canvas-container" ? board.props.key : undefined
    },
    pageToScreen: (at) => editor.pageToViewport(at),
    screenToPage: (at) => {
      const { x, y } = editor.getViewportScreenBounds()

      return editor.screenToPage({ x: at.x + x, y: at.y + y })
    },
    frame: (callback) => {
      const id = requestAnimationFrame(callback)

      return () => cancelAnimationFrame(id)
    }
  }
}
