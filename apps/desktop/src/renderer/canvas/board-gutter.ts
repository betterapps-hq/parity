import { boardLayoutAt, gutterScale } from "@parity-app/core"
import type { RefObject } from "react"
import { useZoomStyle } from "./zoom-style.ts"

/** Inline styles for one part of a board, by property, as an element's `style` takes them. */
export type GutterStyle = Record<string, string>

const px = (length: number) => `${length}px`

/**
 * A dashed line on a board, drawn a screen pixel wide up close and thinner past 40%, as its gutter is (`gutterScale`).
 * It's laid out that many times longer than what it spans and scaled down to fit, from its top left: a border is
 * rounded up to a whole device pixel before the canvas's zoom, so one drawn at a fraction of a canvas pixel thickened
 * zoomed in.
 */
function line(zoom: number, along: "width" | "height") {
  const scale = gutterScale(zoom)

  return { [along]: `${100 / scale}%`, transform: `scale(${scale})` }
}

/**
 * How each part of a board follows the zoom, from its gutter at that zoom (`boardLayoutAt`). The canvas applies these to
 * the parts' styles as the zoom changes (see `useGutterStyle`). Each sets every property it owns, so a part switched to
 * another variant loses the last one's.
 */
export const boardParts = {
  /** The board: its sides and bottom, and its corners. The first row's band sits above its frames. */
  board: (zoom: number) => {
    const { side, radius } = boardLayoutAt(zoom)

    return { padding: `0 ${px(side)} ${px(side)}`, borderRadius: px(radius) }
  },
  /** The board's edge, a screen pixel wide at any zoom, as the Frames exploration draws it. It takes no room. */
  edge: (zoom: number) => ({
    width: `${100 * zoom}%`,
    height: `${100 * zoom}%`,
    transform: `scale(${1 / zoom})`,
    borderRadius: px(boardLayoutAt(zoom).radius * zoom)
  }),
  /** The first row of frames, below the band their captions sit in. */
  firstRow: (zoom: number) => ({ marginTop: "", paddingTop: px(boardLayoutAt(zoom).caption) }),
  /** A later row of states, below a dashed line. */
  nextRow: (zoom: number) => {
    const { before, line, after } = boardLayoutAt(zoom).rowDivider

    return { marginTop: px(before), paddingTop: px(line + after) }
  },
  /**
   * The first row's frames, raised into the band above them with their captions, so the row is as tall as its frames
   * alone and the dashed line before the companions runs past the captions too.
   */
  firstRowFrames: (zoom: number) => ({ marginTop: px(-boardLayoutAt(zoom).caption) }),
  /** A later row's frames, which have no captions. */
  nextRowFrames: () => ({ marginTop: "" }),
  /** The dashed line above a later row of states. */
  rowLine: (zoom: number) => line(zoom, "width"),
  /** The dashed line before the first companion frame. */
  frameLine: (zoom: number) => line(zoom, "height"),
  /** The main frame, at the board's side. */
  firstFrame: () => ({ marginLeft: "", paddingLeft: "" }),
  /** The first companion frame, after the dashed line. */
  dividedFrame: (zoom: number) => {
    const { before, line, after } = boardLayoutAt(zoom).divider

    return { marginLeft: px(before), paddingLeft: px(line + after) }
  },
  /** A later companion frame. */
  nextFrame: (zoom: number) => ({ marginLeft: px(boardLayoutAt(zoom).between), paddingLeft: "" }),
  /** The band a frame's caption sits in, above the frame. */
  caption: (zoom: number) => ({ height: px(boardLayoutAt(zoom).caption) }),
  /** The first row's state label, at the top of the caption band, just outside the board. */
  firstStateLabel: (zoom: number) => ({ top: "0px", marginRight: px(boardLayoutAt(zoom).side) }),
  /** A later row's state label, beside the top of its frames, just outside the board. */
  nextStateLabel: (zoom: number) => {
    const { side, rowDivider } = boardLayoutAt(zoom)

    return { top: px(rowDivider.line + rowDivider.after), marginRight: px(side) }
  }
} satisfies Record<string, (zoom: number) => GutterStyle>

/** One of a board's parts that follow the zoom. */
export type BoardPart = keyof typeof boardParts

/** Each part's style applied to an element, kept so `useZoomStyle` is given the same function each render. */
const appliers = new Map<BoardPart, (style: CSSStyleDeclaration, zoom: number) => void>()

/** Keeps a part of a board laid out for the zoom, as `boardParts` says, live as the camera moves, as labels are. */
export function useGutterStyle(ref: RefObject<HTMLElement | null>, part: BoardPart): void {
  let apply = appliers.get(part)

  if (!apply) {
    apply = (style, zoom) => void Object.assign(style, boardParts[part](zoom))
    appliers.set(part, apply)
  }

  useZoomStyle(ref, apply)
}
