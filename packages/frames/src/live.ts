import type { PoolFrame } from "./pool.ts"

/*
 * The live frame's plan (docs/proposals/route-frames.md, "Input on a live board", "Going live" and "The pool"): which
 * frame goes live, where its window sits on its board, when live ends, and when the freezer waits for the live page.
 */

/** How long the pointer rests on a board with Interact before a spare is sent to its route, in milliseconds. */
export const warmAfter = 80

/** How long after a frame goes live the pool refills, once the new live frame has settled. */
export const refillAfter = 1500

/** How long after the view stops moving the spares park again in it. */
export const reparkAfter = 250

/** How long a live board's box stays out of the camera's view before live ends. */
export const liveOutOfView = 10_000

/** How long after someone last used the live page the freezer waits, since a project's pages share one process. */
export const usedPause = 2000

/** How small a parked spare is drawn, on screen: in view at its mode's full size, scaled to 1%. */
export const parkedScale = 0.01

/** How a frame went live, as `routeFrame.live` says it. */
export type LiveFrom = "warming" | "parked" | "sent" | "loading" | "new"

/** The frame that goes live, and how. */
export type LivePick = { from: Exclude<LiveFrom, "new">; frame: string } | { from: "new" }

/** What going live picks from. */
export interface LiveChoice {
  /** The route the board draws. */
  route: string
  /** The spare warming on this board, sent there when the pointer rested on it. */
  warming?: string
  /** The project's spares. */
  spares: readonly PoolFrame[]
  /** Whether the app has a page router, so a spare on another route can be sent there. */
  movable: boolean
}

/**
 * The quickest frame to go live on a board: the one warming on it; else a spare ready on its route, which only changes
 * mode; else any ready spare, sent by the app's router; else a spare still loading, on the board's route or, when it
 * can be moved, anywhere; else a new frame loaded at the route.
 */
export function pickLive(choice: LiveChoice): LivePick {
  if (choice.warming !== undefined && choice.spares.some((frame) => frame.id === choice.warming)) {
    return { from: "warming", frame: choice.warming }
  }

  const ready = choice.spares.filter((frame) => frame.state === "ready")
  const parked = ready.find((frame) => frame.route === choice.route)

  if (parked) {
    return { from: "parked", frame: parked.id }
  }

  const [sent] = choice.movable ? ready : []

  if (sent) {
    return { from: "sent", frame: sent.id }
  }

  const loading = choice.spares.find(
    (frame) => frame.state === "loading" && (choice.movable || frame.route === choice.route)
  )

  return loading ? { from: "loading", frame: loading.id } : { from: "new" }
}

/** Where a board and the view are on screen, for the live window. */
export interface LiveWindowView {
  /** The top of the view, in screen pixels. */
  viewTop: number
  /** The top of the board's frame, in screen pixels. */
  boardTop: number
  /** Screen pixels per CSS pixel of the page: the camera's zoom times the board's scale. */
  scale: number
  /** How tall the board draws its page, in the page's CSS pixels. */
  pageHeight: number
  /** The mode's window height, which the live frame is. */
  windowHeight: number
}

/**
 * Where the live window sits down its board, in the page's CSS pixels: over the part of the board in view, from the
 * view's top, kept within the board, so panning down a tall board shows the live page at that point.
 */
export function liveWindowTop(view: LiveWindowView): number {
  const bottom = Math.max(0, view.pageHeight - view.windowHeight)

  if (view.scale <= 0) {
    return 0
  }

  return Math.round(Math.min(bottom, Math.max(0, (view.viewTop - view.boardTop) / view.scale)))
}

/** Whether a live board's box has been out of view long enough that live ends, from when it left, or not. */
export function liveExpired(outSince: number | undefined, now: number): boolean {
  return outSince !== undefined && now - outSince >= liveOutOfView
}
