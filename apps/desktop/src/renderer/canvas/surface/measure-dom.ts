import type { DrawnAt, MeasuredFrame, MeasurePort, PageRect, Point } from "@parity-app/editor"
import type { Editor } from "tldraw"
import { findFrames, findNodeElement, nodesAt } from "../../frame.ts"
import { frameGeometry } from "../frame-geometry.ts"
import { caretLine, drawnText } from "../text-caret.ts"
import { createCanvasId } from "../tldraw-names.ts"

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

  const toPage = (box: ClientBox): PageRect => {
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
  const drawnAt = (box: ClientBox, scale: number, element: Element | undefined): DrawnAt => ({
    box: toPage(box),
    radius: radiusOf(element, scale),
    size: { width: (box.right - box.left) / scale, height: (box.bottom - box.top) / scale }
  })

  /** Whether a client point is inside an element's box. */
  const holds = (element: Element, at: Point) => {
    const { x, y } = toClient(at)
    const rect = element.getBoundingClientRect()

    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }

  /**
   * A design's frame. A design narrower than its window lays out across the whole window and its `.mode-frame` shows
   * only its own width (ModeView.tsx), so the box is the frame's, at the host's scale.
   */
  const frameOf = (host: HTMLElement): MeasuredFrame => {
    const shown = host.closest(".mode-frame") ?? host

    return {
      mode: host.dataset.mode,
      state: host.dataset.state,
      primary: host.dataset.primary === "true",
      asleep: host.closest("[data-asleep]") !== null,
      measure: () => drawnAt(shown.getBoundingClientRect(), frameGeometry(host).scale, shown),
      node: (id) => {
        const node = frameGeometry(host).node(id)

        return node && drawnAt(node.box, node.scale, node.hasElement ? findNodeElement(host, id) : undefined)
      },
      // Only where the text drawn is as long as the place it's at, since another state or mode can draw other text.
      caret: (id, offset) => {
        const element = findNodeElement(host, id)
        const line = element && offset <= drawnText(element).length ? caretLine(element, offset) : undefined

        if (!line) {
          return undefined
        }

        const top = editor.screenToPage({ x: line.x, y: line.top })

        return { x: top.x, top: top.y, bottom: editor.screenToPage({ x: line.x, y: line.bottom }).y }
      },
      contains: (at) => holds(shown, at),
      nodesAt: (at) => nodesAt(host, toClient(at))
    }
  }

  /**
   * A page of the app in its frame (`PageFrame` in ContainerView.tsx): the app's own document in an iframe, scaled, in a
   * box that clips it to the page's height. Its nodes are in another document, so it has none to measure.
   */
  const pageFrameOf = (tile: HTMLElement, page: HTMLIFrameElement): MeasuredFrame => {
    const shown = page.parentElement ?? page

    return {
      mode: tile.dataset.mode,
      state: undefined,
      primary: tile.dataset.primary === "true",
      asleep: page.closest("[data-asleep]") !== null,
      measure: () =>
        drawnAt(shown.getBoundingClientRect(), page.getBoundingClientRect().width / page.offsetWidth || 1, shown),
      node: () => undefined,
      contains: (at) => holds(shown, at),
      nodesAt: () => []
    }
  }

  /** The app's pages a design's board draws, which aren't in the frames' index. */
  const pageFrames = (design: string): MeasuredFrame[] =>
    [...(boardElement(design)?.querySelectorAll<HTMLElement>(".mode-tile") ?? [])].flatMap((tile) => {
      const page = tile.querySelector("iframe")

      return page && !tile.querySelector("[data-frame]") ? [pageFrameOf(tile, page)] : []
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
    frames: (design) => [...findFrames(area(), design).map(frameOf), ...pageFrames(design)],
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
