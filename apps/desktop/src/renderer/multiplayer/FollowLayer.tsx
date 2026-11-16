import { Eye, LogOut } from "lucide-react"
import { useEffect, useState } from "react"
import { FollowEnded } from "./FollowEnded.tsx"
import { FollowFrame } from "./FollowFrame.tsx"
import { type Member, shortName } from "./member.ts"
import type { FollowState } from "./useFollow.ts"

/** How long the frame and banner take to fade once following ends. */
const fadeMs = 300

/**
 * What following draws over the canvas: the frame and banner while it's on, then the note saying why it ended. As it
 * ends the frame fades, inert so its Stop button can't be reached while it goes, and then it's removed.
 */
export function FollowLayer({ leader, state, onStop }: { leader: Member; state: FollowState; onStop?: () => void }) {
  const following = state === "following"
  const [wasFollowing, setWasFollowing] = useState(following)
  const [fading, setFading] = useState(false)

  if (wasFollowing !== following) {
    setWasFollowing(following)
    setFading(!following)
  }

  useEffect(() => {
    if (!fading) {
      return undefined
    }

    const timer = setTimeout(() => setFading(false), fadeMs)

    return () => clearTimeout(timer)
  }, [fading])

  return (
    <>
      <div
        inert={!following}
        className={`pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity ${following ? "opacity-100" : "opacity-0"}`}
        style={{ transitionDuration: `${fadeMs}ms` }}
      >
        {(following || fading) && <FollowFrame leader={leader} onStop={onStop} />}
      </div>
      {state === "stopped" && (
        <FollowEnded>
          <Eye className="size-3.5 text-muted-foreground" />
          Stopped following {shortName(leader)}
        </FollowEnded>
      )}
      {state === "left" && (
        <FollowEnded>
          <LogOut className="size-3.5 text-muted-foreground" />
          {shortName(leader)} left, so following stopped.
        </FollowEnded>
      )}
    </>
  )
}
