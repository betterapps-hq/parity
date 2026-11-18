/** What a route board's tier dot shows (`TierDot`, PAR-1301). */
export type DotTier = "frozen" | "warming" | "warmed"

/**
 * A board's dot from what it knows of the pool: warmed when it holds the live frame or a spare waits on it, or a spare
 * on its route is ready; warming while one loads at or moves to its route; frozen otherwise.
 */
export function dotTier(board: { live: boolean; ready: boolean }, spare: "warming" | "ready" | undefined): DotTier {
  if (board.live || board.ready || spare === "ready") {
    return "warmed"
  }

  return spare === "warming" ? "warming" : "frozen"
}
