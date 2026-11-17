import { Button } from "@buildkitgg/shadcn"
import { Eye, EyeOff, LocateFixed, Sparkles } from "lucide-react"
import { CardHeader } from "./CardHeader.tsx"
import { type Presence, whoseAgent } from "./member.ts"

interface PersonCardProps {
  presence: Presence
  following?: boolean
  /** Follow them, or stop following them while you are. */
  onFollow?: () => void
  /** Show where they are, or where they were. */
  onGoTo?: () => void
}

/**
 * Someone's card, from their face: who they are, over a wash of their color, then buttons to follow them or go to where
 * they are. It never guesses where a person is or what they're doing; it says only what the room knows, such as how
 * long they've been away. An agent's says whose it is, and what it says it's doing in a line of its own. Someone away
 * can't be followed, but you can still go to where they were.
 */
export function PersonCard({ presence, following, onFollow, onGoTo }: PersonCardProps) {
  const { member, doing, away } = presence
  const owner = whoseAgent(member)
  const line = away ? `Away for ${away}` : owner

  return (
    <div className="flex flex-col text-popover-foreground [--face-cutout:var(--popover)]">
      <CardHeader member={member} away={Boolean(away)} line={line} />
      {doing && !away && (
        <p className="mx-3 mb-2.5 flex items-start gap-1.5 rounded-md bg-muted px-2 py-1.5 type-description">
          <Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0" style={{ color: member.palette.stops[1] }} />
          {doing}
        </p>
      )}
      <div className="flex gap-2 px-3 pb-3">
        <Button
          size="sm"
          variant={following ? "secondary" : "default"}
          className="flex-1"
          disabled={Boolean(away)}
          aria-pressed={following}
          onClick={onFollow}
        >
          {following ? <EyeOff /> : <Eye />}
          {following ? "Stop following" : "Follow"}
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={onGoTo}>
          <LocateFixed /> Go to
        </Button>
      </div>
    </div>
  )
}
