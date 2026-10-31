import type { ContainerSpec } from "./document.ts"
import type { ResolvedMode } from "./modes.ts"
import { frameSize, frameViewport } from "./render.ts"

/**
 * How the canvas lays a design's board out, in canvas pixels. The canvas draws its boards with these, and the agent
 * estimates the size of a board the canvas hasn't drawn yet from them, so the two can't drift apart.
 */
export const boardLayout = {
  /** The board's border, on every side. */
  border: 1,
  /** Space inside the border, around the frames. */
  padding: 32,
  /** Space between two frames in a row. */
  frameGap: 32,
  /** Before the first companion frame, a dashed line: space before it, the line, and space after it. */
  divider: { before: 16, line: 1, after: 48 },
  /** The mode caption above each frame of the first row, and the space below it. */
  caption: { height: 24, gap: 12 },
  /** Between rows of states, a dashed line: space above it, the line, and space below it. */
  rowDivider: { before: 48, line: 1, after: 48 }
} as const

/** Companion frames are drawn at most this wide, so the main frame stays the focus. */
export const companionWidth = 640

/** How much a companion frame of this width is shrunk. */
export function companionScale(width: number): number {
  return Math.min(1, companionWidth / width)
}

/**
 * The size of a design's board when the canvas hasn't drawn it: its frames for the modes it shows (`modes`, the main
 * frame's first), companions shrunk as the canvas shrinks them, in one row per state shown, with the board's padding,
 * captions and dividers. A frame with a fixed height is that tall; one that grows with its content is estimated as tall
 * as its window, since its content isn't known until it's drawn. The title, drawn above the board, isn't included.
 */
export function boardSize(
  design: ContainerSpec,
  modes: readonly Pick<ResolvedMode, "viewport" | "width" | "options">[]
): { width: number; height: number } {
  const frames = modes.map((mode, column) => {
    const size = frameSize(design, mode)
    const scale = column === 0 ? 1 : companionScale(size.width)
    return {
      width: Math.round(size.width * scale),
      height: Math.round((size.height ?? frameViewport(size, mode).height) * scale)
    }
  })
  const { border, padding, frameGap, divider, caption, rowDivider } = boardLayout
  const edges = 2 * (border + padding)
  const gaps = Math.max(0, frames.length - 1) * frameGap
  const dividers = frames.length > 1 ? divider.before + divider.line + divider.after : 0
  const width = frames.reduce((total, frame) => total + frame.width, 0) + gaps + dividers
  const rows = design.view?.allStates ? Math.max(1, design.states.length) : 1
  const row = Math.max(0, ...frames.map((frame) => frame.height))
  const between = rowDivider.before + rowDivider.line + rowDivider.after
  const height = caption.height + caption.gap + rows * row + (rows - 1) * between
  return { width: width + edges, height: height + edges }
}
