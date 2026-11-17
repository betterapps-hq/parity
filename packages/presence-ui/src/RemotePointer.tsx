import { useLayoutEffect, useRef } from "react"
import { AgentBadge, AgentPointer, type AgentStepKind } from "./AgentPointer.tsx"
import { type Point, type PointerTrack, pointerMove } from "./glide.ts"
import type { Member } from "./member.ts"
import { PersonPointer } from "./PersonPointer.tsx"

interface RemotePointerProps {
  member: Member
  /** Where their pointer is, in the layer's own coordinates, or where it was when they left the canvas. */
  at: Point
  /** A person's short note, as "Typing…", or what an agent says it's doing. */
  detail?: string
  kind?: AgentStepKind
  /** Whether they've left the canvas: the pointer stays at `at`, faded and with only their name. */
  offCanvas?: boolean
  pressed?: boolean
  /** Whether to show their badge: not while they drag, when what they move carries their name. */
  badge?: boolean
  /** How far apart positions arrive, which is how long each step takes. */
  stepMs?: number
}

function prefersLessMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
}

/**
 * Someone else's pointer, placed on the canvas. Positions arrive a few dozen milliseconds apart, so it moves to each in
 * a straight line in that time. When they leave the canvas it stays where they left it, faded and with only their
 * name; when they come back, it glides from there to where they are, instead of jumping (`pointerMove`). With reduced
 * motion it jumps back instead. It's drawn for the eye only: the avatar stack says who's here.
 */
export function RemotePointer({
  member,
  at,
  detail,
  kind,
  offCanvas = false,
  pressed,
  badge = true,
  stepMs = 80
}: RemotePointerProps) {
  const node = useRef<HTMLDivElement>(null)
  const track = useRef<PointerTrack>({ glideEnds: 0 })
  const shown = offCanvas ? undefined : detail

  useLayoutEffect(() => {
    const element = node.current

    if (!element) {
      return
    }

    const next = pointerMove(track.current, {
      at,
      offCanvas,
      now: performance.now(),
      stepMs,
      reduced: prefersLessMotion()
    })

    element.style.transition = next.transition
    element.style.transform = `translate(${at.x}px, ${at.y}px)`
    track.current = next.track
  }, [at, offCanvas, stepMs])

  return (
    <div
      ref={node}
      aria-hidden
      data-idle="false"
      className={`group/cursor pointer-events-none absolute top-0 left-0 ${offCanvas ? "opacity-35" : ""}`}
    >
      {member.agent ? (
        <>
          <AgentPointer palette={member.palette} pressed={pressed} />
          {badge && <AgentBadge palette={member.palette} agent={member.name} kind={kind} label={shown} />}
        </>
      ) : (
        <PersonPointer palette={member.palette} name={member.name} detail={shown} pressed={pressed} badge={badge} />
      )}
    </div>
  )
}
