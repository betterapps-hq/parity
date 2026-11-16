import { useLayoutEffect, useRef } from "react"
import type { PresenceEvent } from "../../shared/protocol.ts"
import { AgentPointer } from "../agent/AgentPointer.tsx"
import type { Member } from "./member.ts"
import { MemberBadge } from "./MemberBadge.tsx"
import { PersonPointer } from "./PersonPointer.tsx"

/** How long a pointer takes to glide back after being off the canvas: longer for further, within limits. */
function glideFor(distance: number): number {
  return Math.round(Math.min(Math.max(distance * 1.8, 280), 720))
}

interface RemotePointerProps {
  member: Member
  at: { x: number; y: number }
  detail?: string
  kind?: PresenceEvent["kind"]
  offCanvas?: boolean
  pressed?: boolean
  /** Whether to show their badge; not while they drag, when what they move carries their name. */
  badge?: boolean
  /** How far apart positions arrive, which is how long each step takes. */
  stepMs?: number
}

/**
 * Someone else's pointer, placed on the canvas. Positions arrive a few dozen milliseconds apart, so it moves to each in
 * a straight line in that time. When they leave the canvas it stays where they left it, faded and with only their
 * name; when they come back, it glides from there to where they are, instead of jumping.
 */
export function RemotePointer({
  member,
  at,
  detail,
  kind,
  offCanvas,
  pressed,
  badge = true,
  stepMs = 80
}: RemotePointerProps) {
  const node = useRef<HTMLDivElement>(null)
  const last = useRef<{ x: number; y: number } | undefined>(undefined)
  const wasOff = useRef(offCanvas)
  const glideEnds = useRef(0)

  useLayoutEffect(() => {
    const element = node.current

    if (!element) {
      return
    }

    const now = performance.now()
    const from = last.current

    if (from && wasOff.current && !offCanvas) {
      glideEnds.current = now + glideFor(Math.hypot(at.x - from.x, at.y - from.y))
    }

    const gliding = glideEnds.current - now

    if (!from) {
      element.style.transition = "none"
    } else if (gliding > 0) {
      element.style.transition = `transform ${Math.round(gliding)}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out`
    } else {
      element.style.transition = `transform ${stepMs}ms linear, opacity 400ms ease-out`
    }

    element.style.transform = `translate(${at.x}px, ${at.y}px)`
    last.current = at
    wasOff.current = offCanvas
  }, [at, offCanvas, stepMs])

  return (
    <div
      ref={node}
      data-idle="false"
      className={`group/cursor pointer-events-none absolute top-0 left-0 ${offCanvas ? "opacity-35" : ""}`}
    >
      {member.agent ? (
        <AgentPointer palette={member.palette} pressed={pressed} />
      ) : (
        <PersonPointer palette={member.palette} pressed={pressed} />
      )}
      {badge && <MemberBadge member={member} detail={offCanvas ? undefined : detail} kind={kind} />}
    </div>
  )
}
