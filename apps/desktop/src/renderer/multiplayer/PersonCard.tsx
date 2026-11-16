import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { Clock, Eye, EyeOff, LocateFixed, Sparkles } from "lucide-react"
import { Face } from "./Face.tsx"
import { type Member, type Presence, whoseAgent } from "./member.ts"

interface CardHeaderProps {
  member: Member
  away?: boolean
  /** A line under their name, when there's something certain to say. */
  line?: string
}

/**
 * The top of a card: a wash of their color behind their face, so whose card it is reads before the name does. It's
 * lighter on the dark theme, where a soft color mixed into the popover would turn muddy.
 */
export function CardHeader({ member, away, line }: CardHeaderProps) {
  return (
    <div
      className="flex items-center gap-3 px-3 pt-3 pb-2.5 [--wash:28%] dark:[--wash:16%]"
      style={{
        background: `linear-gradient(180deg, color-mix(in oklch, ${member.palette.color} var(--wash), transparent), transparent)`
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

interface PersonCardProps {
  presence: Presence
  following?: boolean
  onFollow?: () => void
}

/**
 * Someone's card, from their face: who they are, over a wash of their color, then buttons to follow them or go to where
 * they are. It never guesses where a person is or what they're doing; it says only what the room knows, such as how
 * long they've been away. An agent's says whose it is, and what it says it's doing in a line of its own. Someone away
 * can't be followed, but you can still go to where they were.
 */
export function PersonCard({ presence, following, onFollow }: PersonCardProps) {
  const { member, doing, away } = presence
  const owner = whoseAgent(member)
  const line = away ? `Away for ${away}` : owner

  return (
    <div className="flex flex-col text-popover-foreground [--face-cutout:var(--popover)]">
      <CardHeader member={member} away={Boolean(away)} line={line} />
      {doing && !away && (
        <p className="mx-3 mb-2.5 flex items-start gap-1.5 rounded-md bg-muted px-2 py-1.5 type-description">
          <Sparkles className="mt-0.5 size-3.5 shrink-0" style={{ color: member.palette.stops[1] }} />
          {doing}
        </p>
      )}
      <div className="flex gap-2 px-3 pb-3">
        <Button
          size="sm"
          variant={following ? "secondary" : "default"}
          className="flex-1"
          disabled={Boolean(away)}
          onClick={onFollow}
        >
          {following ? <EyeOff /> : <Eye />}
          {following ? "Stop following" : "Follow"}
        </Button>
        <Button size="sm" variant="outline" className="flex-1">
          <LocateFixed /> Go to
        </Button>
      </div>
    </div>
  )
}
