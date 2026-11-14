import { boardLayoutAt, shrinkBelow } from "@parity-app/core"

/**
 * How the labels on a board follow the canvas zoom: its design's title, the labels beside its states and the captions
 * above its frames. The canvas applies these to each label's style as the zoom changes.
 */

/**
 * What a label on the canvas is, which decides how it follows the zoom. A name, such as a design's title or a state's
 * label, is how a board or a row is found, so it shows at any zoom while there's room for it. Detail, such as a frame's
 * caption, only helps up close, so it fades out at a distance instead of crowding the boards around it.
 */
export type LabelKind = "name" | "detail"

/** How a label draws at a zoom. */
export interface LabelLook {
  /** How large it draws, as a share of its screen size. */
  scale: number
  /** How opaque it is. At 0 it's hidden, and no longer takes the pointer. */
  opacity: number
}

/**
 * How much room what a label names has on the canvas, in page pixels: how wide it is, and for a label beside it rather
 * than above, how tall (see `stateLabelSpace`).
 */
export interface LabelRoom {
  width?: number
  height?: number
}

/** The smallest a name gets, as a share of its screen size. */
const smallestName = 0.6

/** Detail has faded out by this zoom, from `shrinkBelow`. */
const detailGone = 0.25

/**
 * Below this many screen pixels across, what a label names is too small to read anything beside it, so the label hides
 * rather than reading as a stray mark above or beside it, or piling onto the label next to it.
 */
export const smallestLabelled = 24

/**
 * How large a label draws, as a share of its screen size, and how opaque, at a zoom. Up close, every label keeps its
 * screen size, so it reads the same at any zoom. Past 40% it shrinks with the canvas, so it stays beside what it
 * labels instead of growing over the boards around it: a name down to 60%, while detail fades as it shrinks and is gone
 * at 25%.
 *
 * `room` is how much room what it labels has on the canvas: the board's width for its title, the board's width and
 * the space beside its row for a state's label, the frame's width for a caption. Once either side is under `smallestLabelled`
 * on screen, the label hides. A board's state labels and captions are measured by the board or a frame inside it, so
 * they never show once the board's name has gone, and a state's label shows only while there's that much space below
 * it before the next row's label, so the labels of a board's rows don't pile onto each other.
 */
export function labelLook(kind: LabelKind, zoom: number, room: LabelRoom = {}): LabelLook {
  const shrunk = Math.min(1, zoom / shrinkBelow)
  const roomy = [room.width, room.height].every((side) => side === undefined || side * zoom >= smallestLabelled)

  if (kind === "name") {
    return { scale: Math.max(smallestName, shrunk), opacity: roomy ? 1 : 0 }
  }

  const faded = Math.min(1, Math.max(0, (zoom - detailGone) / (shrinkBelow - detailGone)))

  return { scale: shrunk, opacity: roomy ? faded : 0 }
}

/**
 * How much height a state's label has beside its row of the every-state grid, in page pixels: from its top to where the
 * next row's label starts, past the dashed line between rows. A row's label starts at the top of its frames, `height`
 * tall, but the first row's at the top of the caption band above them. The last row gets the same, so a board's rows are
 * measured alike. A label with its count of changes is 36 pixels tall at screen size and about 22 shrunk to 60%, so one
 * shown with at least `smallestLabelled` of this on screen never reaches the next.
 *
 * The board's gutter is taken at 40%, the size it keeps on the canvas from there out (see `boardLayoutAt`). That's
 * exact where a label can be short of space; closer in, the line between rows alone is 73 pixels on screen.
 */
export function stateLabelSpace(height: number, captioned: boolean): number {
  const { caption, rowDivider } = boardLayoutAt(shrinkBelow)

  return (captioned ? caption : 0) + height + rowDivider.before + rowDivider.line + rowDivider.after
}

/** Where a board sits on the canvas, in page pixels. */
export interface BoardBox {
  x: number
  y: number
  w: number
  h: number
}

/** How tall a board's title is at screen size, with the gap below it. */
const titleHeight = 42

/**
 * Where the top of a board's title is on the canvas at a zoom, in page pixels: `titleHeight` on screen above the board,
 * at the size `labelLook` draws a name. Zoomed out, that's more of the canvas.
 */
export function titleTop(board: Pick<BoardBox, "y">, zoom: number): number {
  return board.y - (titleHeight * labelLook("name", zoom).scale) / zoom
}

/** The screen pixels a title that reaches past its board keeps clear of the next board. */
const titleClearance = 8

/**
 * How wide a board's title may be on the canvas, in page pixels, at a zoom, once it draws at `scale` of its screen
 * size (see `labelLook`): to the next board to its right, short of `titleClearance` on screen, where that board or its
 * own title is level with this title. So zoomed out, a narrow board's name runs into the free canvas beside it rather
 * than truncating at the board's edge, and stops before it would cross another board or that board's name. It's never
 * narrower than the board, and `undefined` with nothing level to its right, where the name can run its full length.
 *
 * Titles sit above their boards, `titleHeight` tall on screen, which is more of the canvas the further out it's zoomed,
 * so what's level depends on the zoom.
 */
export function titleReach(
  board: BoardBox,
  others: readonly BoardBox[],
  zoom: number,
  scale: number
): number | undefined {
  const band = (titleHeight * scale) / zoom
  const top = board.y - band

  const next = others
    .filter((other) => other.x > board.x && other.y - band < board.y && other.y + other.h > top)
    .reduce((nearest, other) => Math.min(nearest, other.x), Infinity)

  if (next === Infinity) {
    return undefined
  }

  return Math.max(board.w, next - board.x - titleClearance / zoom)
}
