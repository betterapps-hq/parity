/** How a board draws: its kept bitmap, its frozen copy, or the app's page over its copy. */
export type BoardTier = "picture" | "frozen" | "live"

/** A board grows to a copy once it's wider than this on screen, in CSS pixels. */
export const frozenFrom = 440

/** A board shrinks to a picture once it's narrower than this on screen; the gap keeps zooming from flipping it. */
export const pictureBelow = 360

/** What a board's tier is decided from. */
export interface BoardView {
  /** The board's width on screen, in CSS pixels. */
  width: number
  /** Whether it's in or near the view, within `useFrameView`'s margin; undefined while the window isn't drawn. */
  near: boolean | undefined
  /** Its tier last time. */
  last: BoardTier
  /** Whether it has a frozen copy to show. */
  copy: boolean
  /** Whether it holds the live frame. */
  live: boolean
  /** Whether the pointer is on it with Interact, which brings a picture up to its copy first. */
  pointed: boolean
}

/** A board's tier, from its size on screen, whether it's near, its last tier and what it has. */
export function boardTier(board: BoardView): BoardTier {
  if (board.live) {
    return "live"
  }

  const kept = board.last === "live" ? "frozen" : board.last

  if (!board.copy) {
    return "picture"
  }

  if (board.near === undefined) {
    return kept
  }

  if (board.pointed) {
    return "frozen"
  }

  if (!board.near) {
    return "picture"
  }

  if (kept === "picture") {
    return board.width > frozenFrom ? "frozen" : "picture"
  }

  return board.width < pictureBelow ? "picture" : "frozen"
}
