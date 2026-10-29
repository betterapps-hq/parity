import { type RefObject, useLayoutEffect } from "react"
import { react, useMaybeEditor } from "tldraw"

/**
 * Keeps one element's inline style in step with the canvas zoom, for things drawn at screen size such as design titles.
 * tldraw's `--tl-zoom` only changes once the camera stops (see CanvasEditor): set on the canvas, a custom property
 * restyles every element of every frame below it, while a style set here restyles this element alone. `apply` should
 * be a function defined once, outside the component. Outside a canvas, as in stories, the zoom is 1.
 */
export function useZoomStyle(
  ref: RefObject<HTMLElement | null>,
  apply: (style: CSSStyleDeclaration, zoom: number) => void
): void {
  const editor = useMaybeEditor()
  useLayoutEffect(() => {
    const style = ref.current?.style
    if (!style) return undefined
    if (!editor) {
      apply(style, 1)
      return undefined
    }
    return react("zoom style", () => apply(style, editor.getZoomLevel()))
  }, [editor, ref, apply])
}
