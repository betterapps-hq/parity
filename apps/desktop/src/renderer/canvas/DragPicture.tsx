import type { ReactNode } from "react"
import { cancelMs, type DragPhase, dropMs, settle } from "./drag-motion.ts"
import { DragLift } from "./DragLift.tsx"

interface DragPictureProps {
  at: { x: number; y: number }
  phase: DragPhase
  grab?: { x: number; y: number }
  children: ReactNode
}

/**
 * A picture of what's carried out of a layout, placed from its container's top-left. While it's carried it follows the
 * pointer exactly, lifted, growing from where it was grabbed (`grab`, from its top-left); dropped, it flies to where it
 * lands and settles; cancelled, it flies back to where it was. With reduced motion it doesn't fly. The canvas's own
 * layer drag draws it through `CarriedPicture`; Multiplayer's drag previews draw it too.
 */
export function DragPicture({ at, phase, grab, children }: DragPictureProps) {
  const ms = phase === "cancelling" ? cancelMs : dropMs
  const flying = phase === "carrying" ? undefined : `transform ${ms}ms ${settle}`

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 motion-reduce:transition-none!"
      style={{ transform: `translate(${at.x}px, ${at.y}px)`, transition: flying ?? "none" }}
    >
      <DragLift up={phase === "carrying"} settleMs={ms} origin={grab}>
        {children}
      </DragLift>
    </div>
  )
}
