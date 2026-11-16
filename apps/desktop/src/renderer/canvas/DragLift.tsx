import type { ReactNode } from "react"
import { dropMs, lift } from "./drag-motion.ts"

interface DragLiftProps {
  up: boolean
  settleMs?: number
  origin?: { x: number; y: number }
  children: ReactNode
  className?: string
}

/**
 * Picked up or not: picked up, what it holds grows a little and lifts onto a shadow that follows its shape; put down,
 * it settles back, in `settleMs`. The same for a layer's picture, an absolutely placed layer and a board, and for
 * someone else's drag in Multiplayer. The values are `drag-motion.ts`'s; the canvas's own elements, which aren't
 * React's to wrap, are lifted the same way by `element-lift.ts`.
 *
 * It grows from its middle, or from `origin` (where it was grabbed, so that point stays under the pointer). Something
 * that appears already picked up, such as a drag's picture, lifts from rest as it appears (`starting:`, which has to be
 * important to beat the inline style). With reduced motion it doesn't grow and gets its shadow at once.
 */
export function DragLift({ up, settleMs = dropMs, origin, children, className = "" }: DragLiftProps) {
  return (
    <div
      className={`starting:scale-100! starting:[filter:none]! motion-reduce:scale-100! motion-reduce:transition-none! ${className}`}
      style={{
        ...lift(up, { reduced: false, ms: settleMs }),
        transformOrigin: origin && `${origin.x}px ${origin.y}px`
      }}
    >
      {children}
    </div>
  )
}
