import type { ReactNode } from "react"
import { cancelMs, type DragPhase, dropMs, settle } from "./drag-motion.ts"
import { DragLift } from "./DragLift.tsx"

interface DragPictureProps {
  at: { x: number; y: number }
  phase: DragPhase
  children: ReactNode
}

/**
 * A picture of what's carried out of a layout, placed from its container's top-left. While it's carried it follows the
 * pointer exactly, lifted; dropped, it flies to where it lands and settles; cancelled, it flies back to where it was.
 */
export function DragPicture({ at, phase, children }: DragPictureProps) {
  const flying = phase === "carrying" ? undefined : `transform ${phase === "dropping" ? dropMs : cancelMs}ms ${settle}`

  return (
    <div
      className="pointer-events-none absolute top-0 left-0"
      style={{ transform: `translate(${at.x}px, ${at.y}px)`, transition: flying ?? "none" }}
    >
      <DragLift up={phase === "carrying"}>{children}</DragLift>
    </div>
  )
}
