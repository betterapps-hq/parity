import { useLayoutEffect, useRef, useState } from "react"
import { AgentBadge, AgentPointer, type AgentStepKind } from "./AgentPointer.tsx"
import { type Point, type PointerTrack, pointerFrame } from "./glide.ts"
import type { Member } from "./member.ts"
import { PersonPointer } from "./PersonPointer.tsx"
import { PointerTrail } from "./trail.ts"

interface RemotePointerProps {
  member: Member
  /**
   * Where their pointer is, or where it was when they left the canvas, when no `trail` is given: each new one is moved to
   * as if it had just arrived.
   */
  at?: Point
  /** The positions they sent, as they arrived, drawn from on every frame. */
  trail?: PointerTrail
  /** What positions are multiplied by to place it: the camera's zoom, for positions on the page drawn at screen size. */
  scale?: number
  /** A person's short note, as "Typing…", or what an agent says it's doing. */
  detail?: string
  kind?: AgentStepKind
  /** Whether they've left the canvas: the pointer stays where they left it, faded and with only their name. */
  offCanvas?: boolean
  pressed?: boolean
  /** Whether to show their badge: not while they drag, when what they move carries their name. */
  badge?: boolean
}

function prefersLessMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
}

/**
 * Someone else's pointer, placed on the canvas. Their positions arrive unevenly, so it's drawn a little behind them and
 * moved between them on every frame (`PointerTrail`), so it doesn't stop and jump when one is late. When they leave the
 * canvas it stays where they left it, faded and with only their name; when they come back, it glides from there to where
 * they are, instead of jumping (`pointerFrame`). With reduced motion it jumps back instead. It's drawn for the eye only:
 * the avatar stack says who's here.
 */
export function RemotePointer({
  member,
  at,
  trail: given,
  scale = 1,
  detail,
  kind,
  offCanvas = false,
  pressed,
  badge = true
}: RemotePointerProps) {
  const node = useRef<HTMLDivElement>(null)
  const track = useRef<PointerTrack>({})
  const [own] = useState(() => new PointerTrail())
  const trail = given ?? own
  const frame = useRef<number | undefined>(undefined)
  // What the next frame draws with, read when it comes rather than when it was asked for.
  const drawing = useRef({ trail, scale, offCanvas, at })
  const shown = offCanvas ? undefined : detail
  const x = at?.x
  const y = at?.y

  // A position given without a trail is taken as it arrives.
  useLayoutEffect(() => {
    if (!given && x !== undefined && y !== undefined) {
      own.push({ t: performance.now(), at: { x, y } }, performance.now())
    }
  }, [given, own, x, y])

  // Drawn on every frame while it's on its way somewhere, and once for whatever changed otherwise.
  useLayoutEffect(() => {
    drawing.current = { trail, scale, offCanvas, at }

    const draw = (now: number) => {
      frame.current = undefined
      const element = node.current
      const { trail: from, scale: times, offCanvas: off, at: fallback } = drawing.current
      const position = from.at(now) ?? fallback

      if (!element || !position) {
        return
      }

      const next = pointerFrame(track.current, { at: position, offCanvas: off, now, reduced: prefersLessMotion() })
      track.current = next.track
      element.style.transform = `translate(${next.at.x * times}px, ${next.at.y * times}px)`

      if (from.moving || next.gliding) {
        frame.current = requestAnimationFrame(draw)
      }
    }

    if (frame.current === undefined) {
      draw(performance.now())
    }
  })

  useLayoutEffect(
    () => () => {
      if (frame.current !== undefined) {
        cancelAnimationFrame(frame.current)
        // Mounted again, as StrictMode does, it starts drawing afresh.
        frame.current = undefined
      }
    },
    []
  )

  return (
    <div
      ref={node}
      aria-hidden
      data-idle="false"
      data-remote-pointer
      className={`group/cursor pointer-events-none absolute top-0 left-0 ${offCanvas ? "opacity-35" : ""}`}
      style={{ transition: `opacity ${offCanvas ? 400 : 200}ms ease-out` }}
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
