import type { ReactNode } from "react"
import { DragLift } from "../canvas/DragLift.tsx"

interface CanvasBoardProps {
  name: string
  x: number
  y: number
  lifted?: boolean
  children: ReactNode
}

/** A board on the canvas: its name above it, then its design. Lifted while it's dragged, as everything is. */
export function CanvasBoard({ name, x, y, lifted, children }: CanvasBoardProps) {
  return (
    <div className="absolute flex flex-col gap-1.5" style={{ left: x, top: y }}>
      <span className="text-2xs font-medium text-muted-foreground">{name}</span>
      <DragLift up={Boolean(lifted)}>
        <div className="rounded-sm shadow-[0_4px_16px_rgb(0_0_0/0.12)]">{children}</div>
      </DragLift>
    </div>
  )
}
