import { boardLayoutAt } from "@parity-app/core"
import type { RefObject } from "react"
import { useZoomStyle } from "./zoom-style.ts"

/** Inline styles for one part of a board, by property, as an element's `style` takes them. */
export type GutterStyle = Record<string, string>

const px = (length: number) => `${length}px`

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
  /** The first row of frames, below the band their headers sit in. */
  firstRow: (zoom: number) => ({ marginTop: "", paddingTop: px(boardLayoutAt(zoom).caption) }),
  /** The first row, a header line taller for headers with a line under their names. */
  firstTallRow: (zoom: number) => ({ marginTop: "", paddingTop: px(2 * boardLayoutAt(zoom).caption) }),
  /** A later row of states, below the gap between rows, whose last part is the band its headers sit in. */
  nextRow: (zoom: number) => {
    const { before, line, after } = boardLayoutAt(zoom).rowDivider

    return { marginTop: px(before), paddingTop: px(line + after) }
  },
  /** A later row, a header line taller for headers with a line under their names. */
  nextTallRow: (zoom: number) => {
    const { caption, rowDivider } = boardLayoutAt(zoom)
    const { before, line, after } = rowDivider

    return { marginTop: px(before), paddingTop: px(line + after + caption) }
  },
  /** The first row, a line taller for its name over it, as a Storybook file's board names its stories. */
  firstNamedRow: (zoom: number) => ({ marginTop: "", paddingTop: px(2 * boardLayoutAt(zoom).caption) }),
  /** The first row with its name over it and its headers a line taller. */
  firstNamedTallRow: (zoom: number) => ({ marginTop: "", paddingTop: px(3 * boardLayoutAt(zoom).caption) }),
  /** A later row with its name over it. */
  nextNamedRow: (zoom: number) => {
    const { caption, rowDivider } = boardLayoutAt(zoom)
    const { before, line, after } = rowDivider

    return { marginTop: px(before), paddingTop: px(line + after + caption) }
  },
  /** A later row with its name over it and its headers a line taller. */
  nextNamedTallRow: (zoom: number) => {
    const { caption, rowDivider } = boardLayoutAt(zoom)
    const { before, line, after } = rowDivider

    return { marginTop: px(before), paddingTop: px(line + after + 2 * caption) }
  },
  /** The band at the top of the first row that its name sits in. */
  firstRowName: (zoom: number) => ({ top: "0px", height: px(boardLayoutAt(zoom).caption) }),
  /** The band at the top of a later row, below the gap, that its name sits in. */
  nextRowName: (zoom: number) => {
    const { caption, rowDivider } = boardLayoutAt(zoom)

    return { top: px(rowDivider.line), height: px(caption) }
  },
  /** A line of a row that wraps, a gap below the last; its previews' headers sit in their own bands. */
  nextLine: (zoom: number) => ({ marginTop: px(boardLayoutAt(zoom).between) }),
  /** A later line whose headers need a line under their names. */
  nextTallLine: (zoom: number) => {
    const { between, caption } = boardLayoutAt(zoom)

    return { marginTop: px(between + caption) }
  },
  /**
   * A row's frames, raised into the band above them with their headers, so the row is as tall as its frames alone.
   */
  rowFrames: (zoom: number) => ({ marginTop: px(-boardLayoutAt(zoom).caption) }),
  /** The main frame, at the board's side. */
  firstFrame: () => ({ marginLeft: "", paddingLeft: "" }),
  /** The first companion frame, a little further off than the rest. */
  dividedFrame: (zoom: number) => {
    const { before, line, after } = boardLayoutAt(zoom).divider

    return { marginLeft: px(before), paddingLeft: px(line + after) }
  },
  /** A later companion frame. */
  nextFrame: (zoom: number) => ({ marginLeft: px(boardLayoutAt(zoom).between), paddingLeft: "" }),
  /**
   * The handle that resizes a preview, in the gap after it: as wide as the board's side, so the last preview's stays
   * inside the board and each one's grip sits close to the preview it resizes.
   */
  resizeHandle: (zoom: number) => ({ width: px(boardLayoutAt(zoom).side) }),
  /** The band a preview's header sits in, above the preview. */
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
