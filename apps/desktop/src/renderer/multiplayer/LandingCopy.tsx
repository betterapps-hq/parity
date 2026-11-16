import type { ReactNode } from "react"
import type { Member } from "./member.ts"

/** Where a dragged layer would land: a dimmed copy, outlined in the dragger's color, dashed. */
export function LandingCopy({ member, children }: { member: Member; children: ReactNode }) {
  return (
    <div className="pointer-events-none relative h-full opacity-55">
      {children}
      <span
        className="absolute -inset-[2px] rounded-[8px]"
        style={{ border: `1.5px dashed ${member.palette.color}` }}
      />
    </div>
  )
}
