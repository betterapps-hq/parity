import { EyeOff, LogOut } from "lucide-react"
import { useEffect, useState } from "react"
import { FollowEnded } from "./FollowEnded.tsx"
import { FollowFrame } from "./FollowFrame.tsx"
import { type Member, shortName } from "./member.ts"

/**
 * Where following someone stands: on, ended by you, ended because they left, or over once the note saying so has gone.
 */
export type FollowState = "following" | "stopped" | "left" | "done"

/** How long the frame and banner take to fade once following ends. */
const fadeMs = 300

interface FollowLayerProps {
  leader: Member
  state: FollowState
  onStop?: () => void
}

/**
 * What following draws over the canvas: the frame and banner while it's on, then the note saying why it ended. As it
 * ends the frame fades, inert so its Stop button can't be reached while it goes, and then it's removed.
 */
export function FollowLayer({ leader, state, onStop }: FollowLayerProps) {
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
        className={`pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity motion-reduce:transition-none ${following ? "opacity-100" : "opacity-0"}`}
        style={{ transitionDuration: `${fadeMs}ms` }}
      >
        {(following || fading) && <FollowFrame leader={leader} onStop={onStop} />}
      </div>
      {state === "stopped" && <FollowEnded icon={EyeOff} title={`Stopped following ${shortName(leader)}`} />}
      {state === "left" && <FollowEnded icon={LogOut} title={`${shortName(leader)} left, so following stopped`} />}
    </>
  )
}
