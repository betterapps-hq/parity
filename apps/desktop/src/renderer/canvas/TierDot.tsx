import { useEffect, useState } from "react"
import { poolFor, routeOf } from "./live-frames.ts"

/** How often the dot reads its project's pool. */
const every = 200

const colors = { frozen: "#9ca3af", warming: "#f97316", warmed: "#22c55e" }

/**
 * Temporary, to watch route frames' tiers work (PAR-1301): a dot in a route board's corner, grey while it shows its
 * frozen copy or picture, orange while a spare warms on its route, green once one waits there or the board is live.
 * Remove this file, `Pool.spareRoutes` and its use in `RouteBoard`.
 */
export function TierDot({ project, url, warmed }: { project: string; url: string; warmed: boolean }) {
  const [spare, setSpare] = useState<"warming" | "ready">()

  useEffect(() => {
    const route = routeOf(url)
    const read = () => setSpare(poolFor(project).spareRoutes().get(route))
    read()
    const timer = window.setInterval(read, every)

    return () => window.clearInterval(timer)
  }, [project, url])

  const tier = tierOf(warmed || spare === "ready", spare === "warming")

  return (
    <span
      data-tier-dot={tier}
      aria-hidden
      style={{
        position: "absolute",
        // The same size on screen at any zoom, once the zoom settles.
        top: "calc(6px * var(--tl-scale, 1))",
        right: "calc(6px * var(--tl-scale, 1))",
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

function tierOf(warmed: boolean, warming: boolean): keyof typeof colors {
  if (warmed) {
    return "warmed"
  }

  return warming ? "warming" : "frozen"
}
