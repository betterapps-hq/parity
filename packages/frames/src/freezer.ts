/*
 * The freezer's plan (docs/proposals/route-frames.md, "The pool" and "When the page process fails"): which route it
 * freezes next, how long it waits for a page to go quiet, and when it starts its frame again after the page process
 * fails, or stops trying.
 */

/** How long a page waits to go quiet before the freezer's snapshot: 150 ms without a change, at most 3 s. */
export const freezeQuiet = { ms: 150, max: 3000 } as const

/** How long the freezer waits for a freshly loaded page to hydrate, in milliseconds: a route's first visit compiles. */
export const freezeLoadDeadline = 60_000

/** A route that needs a copy: the URL its page draws at, and how far its nearest board is from the middle of the view. */
export interface FreezeRequest {
  url: string
  /** Distance from the middle of the view; a board out of view is further than every board in it. */
  distance: number
}

/** The URLs to freeze, nearest the view first, each once at its nearest board's distance. */
export function freezeOrder(requests: readonly FreezeRequest[]): string[] {
  const nearest = new Map<string, number>()

  for (const { url, distance } of requests) {
    const known = nearest.get(url)

    if (known === undefined || distance < known) {
      nearest.set(url, distance)
    }
  }

  return [...nearest].toSorted(([, a], [, b]) => (a === b ? 0 : Math.sign(a - b))).map(([url]) => url)
}

/** How long Parity waits before opening new frames after the page process fails: 1 s, then 5 s, then 30 s. */
export const restartDelays = [1000, 5000, 30_000] as const

/** How far back failures count toward giving up, in milliseconds. */
export const failureWindow = 120_000

/** After this many failures within `failureWindow`, Parity stops opening frames for the project. */
export const failureLimit = 3

/** What to do after the page process failed: open frames again after `delay` ms, or stop trying. */
export type Restart = { delay: number } | "stop"

/**
 * What to do after a failure of the page process, from the times of every failure so far, the latest included, and
 * now: start again after the next pause, or stop once `failureLimit` failures fall within `failureWindow`.
 */
export function restartAfter(failures: readonly number[], now: number): Restart {
  const recent = failures.filter((at) => now - at < failureWindow).length

  if (recent >= failureLimit) {
    return "stop"
  }

  return { delay: restartDelays[Math.max(0, recent - 1)] ?? restartDelays[restartDelays.length - 1] }
}
