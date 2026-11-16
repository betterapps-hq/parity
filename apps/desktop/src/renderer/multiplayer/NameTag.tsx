import { Sparkles } from "lucide-react"
import { type Member, shortName } from "./member.ts"

interface NameTagProps {
  member: Member
}

/**
 * A name tag on an outline's corner, a canvas chip in its color: a person's first name, or an agent's name after a
 * sparkle. Its bottom-left corner is square where it meets the outline.
 */
export function NameTag({ member }: NameTagProps) {
  return (
    <span
      className="flex h-4.5 items-center gap-1 rounded-sm rounded-bl-none px-1.5 text-2xs leading-none font-medium whitespace-nowrap"
      style={{ background: member.palette.color, color: member.palette.ink }}
    >
      {member.agent && <Sparkles className="size-3" strokeWidth={2.25} />}
      {shortName(member)}
    </span>
  )
}
