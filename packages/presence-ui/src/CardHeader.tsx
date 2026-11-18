import { Clock } from "lucide-react"
import { Face } from "./Face.tsx"
import type { Member } from "./member.ts"

interface CardHeaderProps {
  member: Member
  away?: boolean
  /** A line under their name, when there's something certain to say. */
  line?: string
}

/**
 * The top of a card: a wash of their color behind their face, so whose card it is reads before the name does. Your own
 * card washes in your account's color when your face wears it. It's
 * lighter on the dark theme, where a soft color mixed into the popover would turn muddy.
 */
export function CardHeader({ member, away, line }: CardHeaderProps) {
  return (
    <div
      className="flex items-center gap-3 px-3 pt-3 pb-2.5 [--wash:28%] dark:[--wash:16%]"
      style={{
        background: `linear-gradient(180deg, color-mix(in oklch, ${member.own?.color ?? member.palette.color} var(--wash), transparent), transparent)`
      }}
    >
      <Face member={member} size={40} away={away} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{member.name}</span>
        {line && (
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            {away && <Clock className="size-3 shrink-0" />}
            {line}
          </span>
        )}
      </div>
    </div>
  )
}
