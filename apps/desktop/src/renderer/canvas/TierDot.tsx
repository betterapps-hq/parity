import { useEffect, useState } from "react"
import { poolFor, routeOf } from "./live-frames.ts"
import { dotTier } from "./tier-dot.ts"

/** How often the dot reads its project's pool. */
const every = 200

const colors = { frozen: "#9ca3af", warming: "#f97316", warmed: "#22c55e" }

/**
 * A dot beside a route board's top-right corner for watching route frames' tiers work, with the Route frame tiers
 * setting (PAR-1301): grey while it shows its frozen copy or picture, orange while a spare warms on its route, green
 * once one waits there or the board is live.
 */
export function TierDot({
  project,
  url,
  live,
  ready
}: {
  project: string
  url: string
  live: boolean
  ready: boolean
}) {
  const [spare, setSpare] = useState<"warming" | "ready">()

  useEffect(() => {
    const route = routeOf(url)
    const read = () => setSpare(poolFor(project).spareRoutes().get(route))
    read()
    const timer = window.setInterval(read, every)

    return () => window.clearInterval(timer)
  }, [project, url])

  const tier = dotTier({ live, ready }, spare)

  return (
    <span
      data-tier-dot={tier}
      aria-hidden
      style={{
        position: "absolute",
        // The same size on screen at any zoom, once the zoom settles.
        top: 0,
        left: "calc(100% + 6px * var(--tl-scale, 1))",
        width: "calc(12px * var(--tl-scale, 1))",
        height: "calc(12px * var(--tl-scale, 1))",
        borderRadius: "50%",
        background: colors[tier],
        boxShadow: "0 0 0 calc(2px * var(--tl-scale, 1)) white",
        pointerEvents: "none",
        zIndex: 1
      }}
    />
  )
}
