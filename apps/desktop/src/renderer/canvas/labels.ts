import { type LabelKind, labelLook } from "@parity-app/editor"
import { type RefObject, useMemo } from "react"
import { useZoomStyle } from "./zoom-style.ts"

/**
 * How wide a fitted label may be on the canvas at a zoom, in page pixels, once it draws at `scale` of its screen size:
 * the width of what it's placed in to fit that exactly, or more to run past it.
 */
export type LabelReach = (zoom: number, scale: number) => number

function follow(
  ref: RefObject<HTMLElement | null>,
  kind: LabelKind,
  fit: boolean,
  width: number | undefined,
  height: number | undefined,
  reach: LabelReach | undefined
) {
  return (style: CSSStyleDeclaration, zoom: number) => {
    const { scale } = labelLook(kind, zoom)
    // A label that runs past what it labels shows while that room is enough, not only the room under it.
    const room = fit && reach && width !== undefined ? reach(zoom, scale) : width
    const { opacity } = labelLook(kind, zoom, { width: room, height })
    style.transform = `scale(${scale / zoom})`

    if (fit) {
      const past = room !== width
      const share = width !== undefined && room !== undefined ? room / width : 1
      style.width = `${((100 * zoom) / scale) * share}%`

      // What should stay within what it labels, such as a title's controls, hides by this while the label runs past.
      ref.current?.toggleAttribute("data-past-edge", past)
    }

    style.opacity = opacity < 1 ? `${opacity}` : ""
    // Hidden, a faded label no longer takes the pointer.
    style.visibility = opacity > 0 ? "" : "hidden"
  }
}

/**
 * Keeps a label on the canvas sized and faded for the zoom, as `labelLook` says, from the corner its transform origin
 * names. Every label on a board goes through here, so they all agree. With `fit`, it's also as wide on screen as the
 * element it's placed in, so a long label truncates instead of running past what it labels; place it at that element's
 * left edge. `width` and `height` are how much room what it labels has on the canvas, so it hides once that's too
 * small on screen. `reach` lets a fitted label run past what it's placed in, as wide as it says; while it does, the
 * label has `data-past-edge`, for whatever in it should stay within what it labels to hide by.
 */
export function useCanvasLabel(
  ref: RefObject<HTMLElement | null>,
  kind: LabelKind,
  { fit = false, width, height, reach }: { fit?: boolean; width?: number; height?: number; reach?: LabelReach } = {}
): void {
  // Made again only when what it follows changes, since the zoom style applies it afresh each time it's new.
  const apply = useMemo(() => follow(ref, kind, fit, width, height, reach), [ref, kind, fit, width, height, reach])
  useZoomStyle(ref, apply)
}
