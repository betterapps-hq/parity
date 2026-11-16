import { Sparkles } from "lucide-react"
import { type Member, shortName } from "./member.ts"

/** A name tag on an outline's corner, in its color: a person's first name, or an agent's name with a sparkle. */
export function NameTag({ member }: { member: Member }) {
  return (
    <span
      className="flex h-4 items-center gap-0.5 rounded-t-[3px] rounded-br-[3px] px-1 text-[10px] leading-none font-semibold whitespace-nowrap"
      style={{ background: member.palette.color, color: member.palette.ink }}
    >
      {member.agent && <Sparkles className="size-2.5" strokeWidth={2.5} />}
      {shortName(member)}
    </span>
  )
}
