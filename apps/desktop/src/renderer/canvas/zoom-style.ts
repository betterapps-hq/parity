import { createContext, type RefObject, useContext, useLayoutEffect } from "react"
import { type Editor, react, type Signal, useMaybeEditor } from "tldraw"

/**
 * Whether the board an element is on is near the view (`data-away` off; see ContainerUtil). Outside a board, as for the
 * canvas's own controls and in stories, there's none and the element always follows the zoom.
 */
export const BoardNearContext = createContext<Signal<boolean> | undefined>(undefined)

/**
 * Calls `apply` with the camera's zoom as it changes, and again as anything `apply` reads changes, such as the boards a
 * title runs up to, until the returned function is called. While `near` says the board is away from the view, it waits
 * for the zoom to settle or the board to come near, then applies the zoom it's reached.
 */
export function followZoom(
  editor: Pick<Editor, "getZoomLevel" | "getEfficientZoomLevel">,
  near: Signal<boolean> | undefined,
  apply: (zoom: number) => void
): () => void {
  return react("zoom style", () => {
    const zoom = editor.getZoomLevel()
    const settled = zoom === editor.getEfficientZoomLevel()

    if ((near?.get() ?? true) || settled) {
      apply(zoom)
    }
  })
}

/**
 * Keeps one element's inline style in step with the canvas zoom, for things drawn at screen size such as design titles.
 * tldraw's `--tl-zoom` only changes once the camera stops (see CanvasEditor): set on the canvas, a custom property
 * restyles every element of every frame below it, while a style set here restyles this element alone. `apply` should
 * keep its identity between renders, as a function defined outside the component or memoized does, since a new one is
 * applied afresh. Outside a canvas, as in stories, the zoom is 1.
 *
 * On a board out of view, the style waits while the zoom moves and catches up as the board comes near or the zoom
 * settles: restyling every board's labels and gutters each frame made zooming a canvas of many boards slow (PAR-1314).
 */
export function useZoomStyle(
  ref: RefObject<HTMLElement | null>,
  apply: (style: CSSStyleDeclaration, zoom: number) => void
): void {
  const editor = useMaybeEditor()
  const near = useContext(BoardNearContext)
  useLayoutEffect(() => {
    const style = ref.current?.style

    if (!style) {
      return undefined
    }

    if (!editor) {
      apply(style, 1)

      return undefined
    }

    return followZoom(editor, near, (zoom) => apply(style, zoom))
  }, [editor, ref, apply, near])
}
