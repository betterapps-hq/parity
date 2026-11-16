import { Button } from "@buildkitgg/shadcn"
import { Eye } from "lucide-react"
import { Face } from "./Face.tsx"
import { type Presence, statusOf, whoseAgent } from "./member.ts"

interface EveryoneRowProps {
  presence: Presence
  following: boolean
}

/** One of everyone, in the list the count opens: their face and name, whether they're away, and Follow on hover. */
export function EveryoneRow({ presence, following }: EveryoneRowProps) {
  const { member, away } = presence
  const owner = whoseAgent(member)

  return (
    <li className="group/row flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted">
      <Face member={member} size={28} away={Boolean(away)} following={following} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-sm">{member.name}</span>
          {owner && <span className="shrink-0 text-2xs text-muted-foreground">{owner}</span>}
        </span>
        {statusOf(presence) && <span className="truncate text-xs text-muted-foreground">{statusOf(presence)}</span>}
      </span>
      {!away && (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={following ? `Stop following ${member.name}` : `Follow ${member.name}`}
          aria-pressed={following}
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100"
        >
          <Eye />
        </Button>
      )}
    </li>
  )
}
