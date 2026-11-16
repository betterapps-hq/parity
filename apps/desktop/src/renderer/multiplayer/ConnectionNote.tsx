import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { RefreshCw, WifiOff } from "lucide-react"
import { CanvasBanner } from "./CanvasBanner.tsx"
import { Face } from "./Face.tsx"
import { type Member, shortName } from "./member.ts"

/** Names in a sentence: "Mia", "Mia and Claude Code", "Mia, Jonas and Claude Code". */
function listed(names: string[]): string | undefined {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]
}

interface ConnectionNoteProps {
  state: "offline" | "reconnecting"
  /** Whose changes are on their way in, while reconnecting. */
  catchingUp?: Member[]
  changes?: number
  onRetry?: () => void
}

/**
 * When the connection to the room drops, on the canvas's banner: work carries on and is kept on this computer, and
 * everyone else's pointers and selections are hidden until it's back. Offline, it tries again by itself, and Try now
 * doesn't wait. Reconnecting, it says how many changes it's catching up on, and whose.
 */
export function ConnectionNote({ state, catchingUp = [], changes = 0, onRetry }: ConnectionNoteProps) {
  if (state === "offline") {
    return (
      <CanvasBanner
        lead={<WifiOff className="size-4 text-amber-600 dark:text-amber-400" />}
        title="Offline"
        hint="Your changes are kept on this computer"
      >
        <Button size="xs" variant="secondary" onClick={onRetry}>
          Try now
        </Button>
      </CanvasBanner>
    )
  }

  return (
    <CanvasBanner
      lead={
        <RefreshCw className="size-4 animate-spin text-amber-600 [animation-duration:2s] motion-reduce:animate-none dark:text-amber-400" />
      }
      title="Reconnecting"
      hint={
        <span className="flex items-center gap-1.5">
          Catching up on {changes} changes
          <span className="sr-only"> from {listed(catchingUp.map(shortName))}</span>
          <span className="flex" aria-hidden>
            {catchingUp.map((member, index) => (
              <span key={member.name} className={index > 0 ? "-ml-1" : ""}>
                <Face member={member} size={16} />
              </span>
            ))}
          </span>
        </span>
      }
    />
  )
}
