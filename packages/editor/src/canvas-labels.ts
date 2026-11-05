/**
 * How the labels on a board follow the canvas zoom: its design's title, the labels beside its states and the captions
 * above its frames. The canvas applies these to each label's style as the zoom changes.
 */

/**
 * What a label on the canvas is, which decides how it follows the zoom. A name, such as a design's title, is how a
 * board is found, so it shows at any zoom while there's room for it. Detail, such as a state's label or a frame's
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

/** Past this zoom, labels shrink with the canvas instead of keeping their screen size. */
const shrinkBelow = 0.4
/** The smallest a name gets, as a share of its screen size. */
const smallestName = 0.6
/** Detail has faded out by this zoom, from `shrinkBelow`. */
const detailGone = 0.25

/**
 * Below this many screen pixels wide, what a label names is too narrow to read anything beside it, so the label hides
 * rather than reading as a stray mark above or beside it.
 */
export const narrowestLabelled = 24

/**
 * How large a label draws, as a share of its screen size, and how opaque, at a zoom. Up close, every label keeps its
 * screen size, so it reads the same at any zoom. Past 40% it shrinks with the canvas, so it stays beside what it
 * labels instead of growing over the boards around it: a name down to 60%, while detail fades as it shrinks and is gone
 * at 25%.
 *
 * `width` is how wide what it labels is on the canvas, in page pixels: the board for its title and state labels, the
 * frame for a caption. Once that's narrower than `narrowestLabelled` on screen, the label hides. A board's detail is
 * measured by the board or a frame inside it, so it never shows once the board's name has gone.
 */
export function labelLook(kind: LabelKind, zoom: number, width?: number): LabelLook {
  const shrunk = Math.min(1, zoom / shrinkBelow)
  const roomy = width === undefined || width * zoom >= narrowestLabelled
  if (kind === "name") return { scale: Math.max(smallestName, shrunk), opacity: roomy ? 1 : 0 }
  const faded = Math.min(1, Math.max(0, (zoom - detailGone) / (shrinkBelow - detailGone)))
  return { scale: shrunk, opacity: roomy ? faded : 0 }
}
