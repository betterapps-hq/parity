import { type LabelKind, labelLook } from "@parity-app/editor"
import { type RefObject, useMemo } from "react"
import { useZoomStyle } from "./zoom-style.ts"

function follow(kind: LabelKind, fit: boolean, width: number | undefined) {
  return (style: CSSStyleDeclaration, zoom: number) => {
    const { scale, opacity } = labelLook(kind, zoom, width)
    style.transform = `scale(${scale / zoom})`
    if (fit) style.width = `${(100 * zoom) / scale}%`
    style.opacity = opacity < 1 ? `${opacity}` : ""
    // Hidden, a faded label no longer takes the pointer.
    style.visibility = opacity > 0 ? "" : "hidden"
  }
}

/**
 * Keeps a label on the canvas sized and faded for the zoom, as `labelLook` says, from the corner its transform origin
 * names. Every label on a board goes through here, so they all agree. With `fit`, it's also as wide on screen as the
 * element it's placed in, so a long label truncates instead of running past what it labels; place it at that element's
 * left edge. `width` is how wide what it labels is on the canvas, so it hides once that's too narrow on screen.
 */
export function useCanvasLabel(
  ref: RefObject<HTMLElement | null>,
  kind: LabelKind,
  { fit = false, width }: { fit?: boolean; width?: number } = {}
): void {
  // Made again only when what it follows changes, since the zoom style applies it afresh each time it's new.
  const apply = useMemo(() => follow(kind, fit, width), [kind, fit, width])
  useZoomStyle(ref, apply)
}
