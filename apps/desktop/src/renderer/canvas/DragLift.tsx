import type { ReactNode } from "react"

/*
 * The classes are literal so Tailwind sees them. Lifting takes 120 ms; settling takes `dropMs` (180 ms), with the
 * `settle` easing, as `drag-motion.ts` describes. `starting:` lifts something that appears already picked up, such as
 * a drag's picture, from rest.
 */
const lifted =
  "scale-[1.03] duration-[120ms] [filter:drop-shadow(0_12px_16px_rgb(0_0_0/0.18))_drop-shadow(0_2px_4px_rgb(0_0_0/0.12))] starting:scale-100 starting:[filter:drop-shadow(0_0_0_rgb(0_0_0/0))_drop-shadow(0_0_0_rgb(0_0_0/0))]"

const resting = "scale-100 duration-[180ms] [filter:drop-shadow(0_0_0_rgb(0_0_0/0))_drop-shadow(0_0_0_rgb(0_0_0/0))]"

interface DragLiftProps {
  up: boolean
  children: ReactNode
  className?: string
}

/**
 * Picked up or not: picked up, what it holds grows a little and lifts onto a shadow that follows its shape; put down,
 * it settles back. The same for a layer's picture, an absolutely placed layer and a board.
 */
export function DragLift({ up, children, className = "" }: DragLiftProps) {
  return (
    <div className={`transition-[scale,filter] ease-[cubic-bezier(0.2,0,0,1)] ${up ? lifted : resting} ${className}`}>
      {children}
    </div>
  )
}
