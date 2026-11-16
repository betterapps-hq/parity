import { useEffect, useState } from "react"

/**
 * Where following someone stands: on, ended by you, ended because they left, or over once the note saying so has gone.
 */
export type FollowState = "following" | "stopped" | "left" | "done"

/** How long the note that following ended stays: longer when they left, since you didn't do it. */
const followNoteMs = { stopped: 2000, left: 4000 }

/**
 * Following someone, from start to end. Escape stops it while it's on. The canvas calls `stop` when you pan or zoom it
 * yourself, and the room calls `leaderLeft` when they go. Either way a note shows for a while, then following is over.
 */
export function useFollow(initial: FollowState = "following") {
  const [state, setState] = useState(initial)

  useEffect(() => {
    if (state !== "following") {
      return undefined
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setState("stopped")
      }
    }

    window.addEventListener("keydown", onKey)

    return () => window.removeEventListener("keydown", onKey)
  }, [state])

  useEffect(() => {
    if (state !== "stopped" && state !== "left") {
      return undefined
    }

    const timer = setTimeout(() => setState("done"), followNoteMs[state])

    return () => clearTimeout(timer)
  }, [state])

  return {
    state,
    follow: () => setState("following"),
    stop: () => setState((before) => (before === "following" ? "stopped" : before)),
    leaderLeft: () => setState((before) => (before === "following" ? "left" : before))
  }
}
