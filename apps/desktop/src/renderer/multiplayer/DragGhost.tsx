import type { ReactNode } from "react"
import { DragLift } from "../canvas/DragLift.tsx"
import type { Member } from "./member.ts"
import { Outlined } from "./Outlined.tsx"

/**
 * What someone else is carrying, as everyone else sees it: lifted as the canvas lifts anything picked up (`DragLift`),
 * with the dragger's outline and name added. Out of a layout it's a picture following their pointer, while a
 * `LandingSpot` in their color shows where it would land.
 */
export function DragGhost({ member, radius, children }: { member: Member; radius?: number; children: ReactNode }) {
  return (
    <DragLift up className="pointer-events-none">
      <Outlined by={[member]} radius={radius}>
        {children}
      </Outlined>
    </DragLift>
  )
}
