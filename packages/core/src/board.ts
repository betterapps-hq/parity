import type { ContainerSpec } from "./document.ts"
import type { ResolvedMode } from "./modes.ts"
import { frameSize, frameViewport } from "./render.ts"
import { shownStates } from "./rows.ts"

/** The space on either side of a dashed line on a board, and the line. */
export interface BoardDivider {
  before: number
  line: number
  after: number
}

/** The space a board leaves around and between its frames: its gutter. */
export interface BoardGutter {
  /** At the board's sides and bottom. */
  side: number
  /** The band above the first row of frames, which their mode captions sit in. */
  caption: number
  /** Between two frames in a row. */
  between: number
  /** Before the first companion frame, in place of `between`: space before a dashed line, the line, and space after. */
  divider: BoardDivider
  /** Between rows of states, a dashed line: space above it, the line, and space below it. */
  rowDivider: BoardDivider
  /** The board's corner radius, which stays inside the gutter so a frame's corner never pokes out of it. */
  radius: number
}

/**
 * A board's gutter, in screen pixels: up close it's the same on screen at every zoom (PAR-602). The divider before
 * companions halves the gap between frames around its line, as the Frames exploration draws it, and the line between
 * rows of states leaves a caption band's height on either side, three quarters of what it had in canvas pixels before,
 * as the gap between frames went from 32 to 24.
 */
export const boardLayout: BoardGutter = {
  side: 12,
  caption: 36,
  between: 24,
  divider: { before: 12, line: 1, after: 12 },
  rowDivider: { before: 36, line: 1, after: 36 },
  radius: 10
}

/**
 * Past this zoom, what the canvas draws at screen size around a board, its gutter and its labels, shrinks with the
 * canvas instead, so boards zoomed far out don't run into each other.
 */
export const shrinkBelow = 0.4

/**
 * How many canvas pixels a screen pixel of a board's gutter takes at a zoom: one over the zoom up close, so it keeps its
 * screen size, and no more than at 40%, so it shrinks with the canvas past that.
 */
export function gutterScale(zoom: number): number {
  return 1 / Math.max(zoom, shrinkBelow)
}

/**
 * How the canvas lays a board out at a zoom, in canvas pixels. The canvas draws its boards with this, and the agent
 * estimates the size of a board the canvas hasn't drawn yet from it, so the two can't drift apart.
 */
export function boardLayoutAt(zoom: number): BoardGutter {
  const scale = gutterScale(zoom)

  const divider = ({ before, line, after }: BoardDivider) => ({
    before: before * scale,
    line: line * scale,
    after: after * scale
  })

  const { side, caption, between, radius } = boardLayout

  return {
    side: side * scale,
    caption: caption * scale,
    between: between * scale,
    divider: divider(boardLayout.divider),
    rowDivider: divider(boardLayout.rowDivider),
    radius: radius * scale
  }
}

/** Companion frames are drawn at most this wide, so the main frame stays the focus. */
export const companionWidth = 640

/** How much a companion frame of this width is shrunk. */
export function companionScale(width: number): number {
  return Math.min(1, companionWidth / width)
}

/** The scales a frame beside the main one can be set to, as its caption offers them. */
export const besideScales = [0.25, 0.5, 0.75, 1] as const

/**
 * How large a design draws its frame for a mode beside its main one: the scale its view sets for that mode, or else
 * shrunk to fit beside the main frame (`companionScale`).
 */
export function besideScale(
  design: ContainerSpec,
  mode: Pick<ResolvedMode, "id" | "viewport" | "width" | "options">
): number {
  return design.view?.scales?.[mode.id] ?? companionScale(frameSize(design, mode).width)
}

/**
 * How far a board's row runs before it wraps onto another line: two and a half times its widest preview, or 1600
 * pixels where that's more, so a design showing many modes doesn't run on across the canvas.
 */
export function rowWrapWidth(widths: readonly number[]): number {
  return Math.max(1600, 2.5 * Math.max(0, ...widths))
}

/**
 * A row's previews, by index, on lines no wider than `most`: each one beside the last unless it would run past it. The
 * gaps are taken up close, where they're narrowest on the canvas, so zooming never moves a preview onto another line.
 */
export function wrapRow(widths: readonly number[], most: number): number[][] {
  const lines: number[][] = []
  let used = 0

  for (const [index, width] of widths.entries()) {
    const line = lines.at(-1)

    if (line && used + boardLayout.between + width <= most) {
      line.push(index)
      used += boardLayout.between + width
    } else {
      lines.push([index])
      used = width
    }
  }

  return lines
}

/**
 * The size of a design's board when the canvas hasn't drawn it: its frames for the modes it shows (`modes`, the main
 * frame's first), companions shrunk as the canvas shrinks them, each preview at its own width and scale, in one row per
 * state shown, with the board's gutter,
 * captions and dividers. A frame with a fixed height is that tall; one that grows with its content is estimated as tall
 * as its window, since its content isn't known until it's drawn. The title, drawn above the board, isn't included.
 *
 * The gutter is taken at 40% or further out, where it's widest on the canvas, so the estimate is never smaller than the
 * board will be drawn at any zoom.
 */
export function boardSize(
  design: ContainerSpec,
  modes: readonly Pick<ResolvedMode, "id" | "viewport" | "width" | "options">[]
) {
  // Each preview at its own width and scale where it sets them (see `PreviewSettings`).
  const rows = shownStates(design).map((state) =>
    modes.map((mode, column) => {
      const own = design.view?.previews?.[`${state.id}/${mode.id}`]
      const size = frameSize(design, mode)
      const sized = own?.width === undefined ? size : { ...size, width: own.width }
      const scale = own?.scale ?? (column === 0 ? 1 : besideScale(design, mode))

      return {
        width: Math.round(sized.width * scale),
        height: Math.round((sized.height ?? frameViewport(sized, mode).height) * scale)
      }
    })
  )

  const { side, caption, between, divider, rowDivider } = boardLayoutAt(shrinkBelow)
  const most = rowWrapWidth(rows.flat().map((frame) => frame.width))

  // Each row on its lines, as wide as its previews and the gaps between them, and as tall as its tallest.
  const lines = rows.map((row) =>
    wrapRow(
      row.map((frame) => frame.width),
      most
    ).map((line) => ({
      width:
        line.reduce((total, index) => total + row[index]!.width, 0) +
        line
          .slice(1)
          .reduce((total, index) => total + (index === 1 ? divider.before + divider.line + divider.after : between), 0),
      height: Math.max(0, ...line.map((index) => row[index]!.height))
    }))
  )

  const width = Math.max(0, ...lines.flat().map((line) => line.width)) + 2 * side
  const rowGap = rowDivider.before + rowDivider.line + rowDivider.after
  const lineGap = between + caption

  const tall = lines.map((row) => row.reduce((total, line) => total + line.height, 0) + (row.length - 1) * lineGap)

  const height = caption + tall.reduce((total, row) => total + row, 0) + (rows.length - 1) * rowGap + side

  return { width: Math.ceil(width), height: Math.ceil(height) }
}
