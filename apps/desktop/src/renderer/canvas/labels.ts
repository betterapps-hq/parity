import type { RefObject } from "react"
import { useZoomStyle } from "./zoom-style.ts"

/**
 * What a label on the canvas is, which decides how it follows the zoom. A name, such as a design's title, is how a
 * board is found, so it always shows. Detail, such as a state's label or a frame's caption, only helps up close, so it
 * fades out at a distance instead of crowding the boards around it.
 */
export type LabelKind = "name" | "detail"

/** Past this zoom, labels shrink with the canvas instead of keeping their screen size. */
const shrinkBelow = 0.4
/** The smallest a name gets, as a share of its screen size. */
const smallestName = 0.6
/** Detail has faded out by this zoom, from `shrinkBelow`. */
const detailGone = 0.25

/**
 * How large a label draws, as a share of its screen size, and how opaque, at a zoom. Up close, every label keeps its
 * screen size, so it reads the same at any zoom. Past 40% it shrinks with the canvas, so it stays beside what it
 * labels instead of growing over the boards around it: a name down to 60%, while detail fades as it shrinks and is gone
 * at 25%.
 */
export function labelLook(kind: LabelKind, zoom: number): { scale: number; opacity: number } {
  const shrunk = Math.min(1, zoom / shrinkBelow)
  if (kind === "name") return { scale: Math.max(smallestName, shrunk), opacity: 1 }
  return { scale: shrunk, opacity: Math.min(1, Math.max(0, (zoom - detailGone) / (shrinkBelow - detailGone))) }
}

function follow(kind: LabelKind, fit: boolean) {
  return (style: CSSStyleDeclaration, zoom: number) => {
    const { scale, opacity } = labelLook(kind, zoom)
    style.transform = `scale(${scale / zoom})`
    if (fit) style.width = `${(100 * zoom) / scale}%`
    style.opacity = opacity < 1 ? `${opacity}` : ""
    // Hidden, a faded label no longer takes the pointer.
    style.visibility = opacity > 0 ? "" : "hidden"
  }
}

const followers = {
  name: { free: follow("name", false), fit: follow("name", true) },
  detail: { free: follow("detail", false), fit: follow("detail", true) }
}

/**
 * Keeps a label on the canvas sized and faded for the zoom, as `labelLook` says, from the corner its transform origin
 * names. Every label on a board goes through here, so they all agree. With `fit`, it's also as wide on screen as the
 * element it's placed in, so a long label truncates instead of running past what it labels; place it at that element's
 * left edge.
 */
export function useCanvasLabel(ref: RefObject<HTMLElement | null>, kind: LabelKind, { fit = false } = {}): void {
  useZoomStyle(ref, followers[kind][fit ? "fit" : "free"])
}
