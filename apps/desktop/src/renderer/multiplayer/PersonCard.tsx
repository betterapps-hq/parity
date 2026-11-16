import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { Eye, LocateFixed } from "lucide-react"
import { Face } from "./Face.tsx"
import type { Presence } from "./member.ts"

/**
 * Someone's card, from their face: who they are, where they are, and buttons to follow them or jump to where they
 * are. Someone away can't be followed, but you can still go to where they were.
 */
export function PersonCard({
  presence,
  following,
  onFollow
}: {
  presence: Presence
  following?: boolean
  onFollow?: () => void
}) {
  const { member, activity, away } = presence

  return (
    <div className="flex flex-col gap-3 text-popover-foreground">
      <div className="flex items-center gap-3">
        <Face member={member} size={40} away={Boolean(away)} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <span className="truncate">{member.name}</span>
            <span className="size-2 shrink-0 rounded-full" style={{ background: member.palette.color }} />
          </span>
          <span className="truncate text-xs text-muted-foreground">{away ? `Away for ${away}` : activity}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={following ? "secondary" : "default"}
          className="flex-1"
          disabled={Boolean(away)}
          onClick={onFollow}
        >
          <Eye /> {following ? "Stop following" : "Follow"}
        </Button>
        <Button size="sm" variant="outline" className="flex-1">
          <LocateFixed /> Go to
        </Button>
      </div>
    </div>
  )
}
