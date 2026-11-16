import type { ReactNode } from "react"
import type { Member } from "./member.ts"
import { Outlined } from "./Outlined.tsx"

/**
 * A layer someone is dragging out of a layout, as everyone else sees it. Its picture follows their pointer, lifted
 * and outlined in their color; a dimmed copy sits where it would land (`LandingCopy`), and the original is hidden.
 */
export function DragGhost({ member, children }: { member: Member; children: ReactNode }) {
  return (
    <div className="pointer-events-none rotate-[1.5deg] opacity-90 drop-shadow-xl">
      <Outlined by={[member]}>{children}</Outlined>
    </div>
  )
}
