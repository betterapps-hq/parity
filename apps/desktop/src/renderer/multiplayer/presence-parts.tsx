import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Kbd,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { Eye, LocateFixed, Sparkles } from "lucide-react"
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef } from "react"
import type { PresenceEvent } from "../../shared/protocol.ts"
import { AgentBadge, AgentPointer } from "../agent/AgentPointer.tsx"
import { shortcutOf } from "../chrome/keymap.ts"
import type { Palette } from "./palettes.ts"

/*
 * Multiplayer presence, drawn: who's here, where their pointers are, what they've selected and what they're moving.
 * Design only, for Storybook; nothing here is wired to a room. People and agents wear the same palettes and the same
 * pointer and badge, so they read as one system: an agent's badge adds an icon for what it's doing.
 */

/** Someone in the room: a person, or an agent one of them is running. */
export interface Member {
  name: string
  palette: Palette
  agent?: boolean
  /** A picture of them, from their account. Without one, their initials. */
  photo?: string
}

/** Where someone is and what they're doing, for their face and card. */
export interface Presence {
  member: Member
  /** What they're doing, as "Viewing Dashboard · Dark mode". */
  activity: string
  /** How long they've been away, when they've stepped away. */
  away?: string
}

/** What a badge or tag calls someone: a person by their first name, an agent by its whole name. */
export function shortName(member: Member): string {
  return member.agent ? member.name : (member.name.split(" ")[0] ?? member.name)
}

function initials(member: Member): string {
  return member.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
}

/** A palette's gradient, as its pointer and badge wear it. */
export function gradient(palette: Palette, angle = 90): string {
  return `linear-gradient(${angle}deg, ${palette.stops.join(", ")})`
}

/**
 * Someone's face: their picture, or their initials on their palette's gradient, so a face without a picture already
 * matches their pointer. An agent shows a sparkle. Faded while they're away; ringed in their color, with an eye, while
 * you follow them.
 */
export function Face({
  member,
  size = 28,
  away,
  following
}: {
  member: Member
  size?: number
  away?: boolean
  following?: boolean
}) {
  const { palette } = member
  const ring = following ? `0 0 0 2px var(--background), 0 0 0 4px ${palette.color}` : "0 0 0 2px var(--background)"

  return (
    <span className="relative inline-flex shrink-0 rounded-full" style={{ boxShadow: ring }}>
      <Avatar
        className={`transition-[opacity,filter] duration-300 ${away ? "opacity-40 grayscale-[0.6]" : ""}`}
        style={{ width: size, height: size }}
      >
        {member.photo && <AvatarImage src={member.photo} alt="" />}
        <AvatarFallback
          className="font-semibold"
          style={{ background: gradient(palette, 135), color: palette.ink, fontSize: Math.round(size * 0.38) }}
        >
          {member.agent ? <Sparkles style={{ width: size * 0.5, height: size * 0.5 }} /> : initials(member)}
        </AvatarFallback>
      </Avatar>
      {following && (
        <span
          className="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full ring-2 ring-background"
          style={{ background: palette.color, color: palette.ink }}
        >
          <Eye className="size-2.5" strokeWidth={2.5} />
        </span>
      )}
    </span>
  )
}

/**
 * Who's here, at the canvas's top-right edge: up to `max` faces, then how many more. The person you're following comes
 * first and anyone away comes last. Each face opens its person's card; the count opens everyone else.
 */
export function FaceStack({
  here,
  following,
  max = 4,
  size = 28,
  defaultOpen
}: {
  here: Presence[]
  following?: Member
  max?: number
  size?: number
  /** The face whose card starts open, for a story. */
  defaultOpen?: Member
}) {
  const rank = (presence: Presence) => {
    if (presence.member === following) {
      return 0
    }

    return presence.away ? 2 : 1
  }

  const ordered = here.toSorted((a, b) => rank(a) - rank(b))
  const shown = ordered.slice(0, max)
  const rest = ordered.slice(max)

  return (
    <ul
      aria-label="People here"
      className="flex items-center rounded-full border bg-background/85 p-1 shadow-sm backdrop-blur-md"
    >
      {shown.map((presence, index) => (
        <li key={presence.member.name} className="flex">
          <Popover defaultOpen={presence.member === defaultOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={`${presence.member.name}, ${presence.away ? `away for ${presence.away}` : presence.activity}`}
                  className={`rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring ${index > 0 ? "-ml-1.5" : ""}`}
                >
                  <Face
                    member={presence.member}
                    size={size}
                    away={Boolean(presence.away)}
                    following={presence.member === following}
                  />
                </button>
              }
            />
            <PopoverContent align="end" className="w-72 p-3">
              <PersonCard presence={presence} following={presence.member === following} />
            </PopoverContent>
          </Popover>
        </li>
      ))}
      {rest.length > 0 && (
        <li className="flex">
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={`${rest.length} more here`}
                  className="-ml-1.5 grid place-items-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums ring-2 ring-background outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                  style={{ height: size, minWidth: size }}
                >
                  +{rest.length}
                </button>
              }
            />
            <PopoverContent align="end" className="w-64 p-1.5">
              <ul className="flex flex-col">
                {rest.map((presence) => (
                  <li key={presence.member.name} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
                    <Face member={presence.member} size={24} away={Boolean(presence.away)} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">{presence.member.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {presence.away ? `Away for ${presence.away}` : presence.activity}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </li>
      )}
    </ul>
  )
}

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

/**
 * The badge under someone's pointer: a person's first name and, when there's something to say, what they're doing.
 * An agent's badge is the agents' own, with the icon for its call.
 */
export function MemberBadge({
  member,
  detail,
  kind
}: {
  member: Member
  detail?: string
  kind?: PresenceEvent["kind"]
}) {
  if (member.agent) {
    return <AgentBadge palette={member.palette} agent={member.name} kind={kind} label={detail} />
  }

  return (
    <div
      className="mt-0.5 ml-4 flex w-max max-w-72 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap shadow-md"
      style={{ background: gradient(member.palette), color: member.palette.ink }}
    >
      <span className="max-w-40 shrink-0 truncate font-semibold">{shortName(member)}</span>
      {detail && <span className="truncate opacity-75">{detail}</span>}
    </div>
  )
}

/** How long a pointer takes to glide back after being off the canvas: longer for further, within limits. */
function glideFor(distance: number): number {
  return Math.round(Math.min(Math.max(distance * 1.8, 280), 720))
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
}: {
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
}) {
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
      <AgentPointer palette={member.palette} pressed={pressed} />
      {badge && <MemberBadge member={member} detail={offCanvas ? undefined : detail} kind={kind} />}
    </div>
  )
}

/** A hairline of a palette's ink just outside a line in its color, so light colors keep an edge on white. */
export function hairline(ink: string): string {
  return `0 0 0 1px color-mix(in oklch, ${ink} 35%, transparent)`
}

/** A name tag on an outline's top-left corner: a person's first name, or an agent's name with a sparkle. */
export function NameTag({ member }: { member: Member }) {
  return (
    <span
      className="flex h-4 items-center gap-0.5 rounded-t-[3px] rounded-br-[3px] px-1 text-[10px] leading-none font-semibold whitespace-nowrap"
      style={{ background: member.palette.color, color: member.palette.ink }}
    >
      {member.agent && <Sparkles className="size-2.5" strokeWidth={2.5} />}
      {shortName(member)}
    </span>
  )
}

/**
 * An outline in someone's color: what they've selected, or what they're moving. Several people on one layer get a
 * ring each, the first nearest, and their tags line up along the top. A hairline of each palette's ink runs outside its
 * ring, so light colors still hold an edge on white.
 */
export function Outlined({
  by,
  children,
  className = "",
  dashed,
  radius = 6,
  tagAt = "start"
}: {
  by: Member[]
  children: ReactNode
  className?: string
  /** Dashed, for where something would land rather than where it is. */
  dashed?: boolean
  radius?: number
  /** Which top corner the tags sit on: the end, for a board, whose name is at the start. */
  tagAt?: "start" | "end"
}) {
  const spread = -2 - (by.length - 1) * 3

  return (
    <div className={`relative ${className}`}>
      {children}
      {by.map((member, index) => {
        const inset = -2 - index * 3

        const style: CSSProperties = {
          inset,
          borderRadius: radius - inset,
          border: `2px ${dashed ? "dashed" : "solid"} ${member.palette.color}`,
          boxShadow: hairline(member.palette.ink)
        }

        return <span key={member.name} className="pointer-events-none absolute" style={style} />
      })}
      <span
        className="pointer-events-none absolute flex gap-px"
        style={{ top: spread - 16, ...(tagAt === "start" ? { left: spread } : { right: spread }) }}
      >
        {by.map((member) => (
          <NameTag key={member.name} member={member} />
        ))}
      </span>
    </div>
  )
}

/**
 * Following someone: the canvas framed in their color, and a banner at the top saying whose view this is and how to
 * stop. The banner's way out is a button too, for a mouse.
 */
export function FollowFrame({ leader, onStop }: { leader: Member; onStop?: () => void }) {
  const { palette } = leader

  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit]"
        style={{ boxShadow: `inset 0 0 0 2px ${palette.color}` }}
      />
      <output
        className="pointer-events-auto absolute top-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full p-0.5 text-xs font-medium whitespace-nowrap shadow-md"
        style={{ background: gradient(palette), color: palette.ink }}
      >
        <Face member={leader} size={18} />
        <span className="pl-0.5">Following {shortName(leader)}</span>
        <span aria-hidden className="opacity-60">
          ·
        </span>
        <button
          type="button"
          onClick={onStop}
          aria-label={`Stop following ${shortName(leader)}`}
          className="flex items-center gap-1 rounded-full px-1.5 py-0.5 hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-current"
        >
          <Kbd className="h-4 min-w-0 bg-black/10 px-1 text-[10px] text-current">{shortcutOf("close")}</Kbd>
          to stop
        </button>
      </output>
    </>
  )
}

/** Where the banner was, once following ends: why it ended, briefly, in the canvas's own colors. */
export function FollowEnded({ children }: { children: ReactNode }) {
  return (
    <output className="absolute top-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-popover px-2.5 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md">
      {children}
    </output>
  )
}

/**
 * Someone's marquee: the area they're dragging out, tinted in their color, with the layers it touches outlined
 * faintly so you can see what they're about to select.
 */
export function Marquee({ member, rect }: { member: Member; rect: { x: number; y: number; w: number; h: number } }) {
  const { color, ink } = member.palette

  return (
    <span
      className="pointer-events-none absolute rounded-[1px]"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        border: `1px solid ${color}`,
        boxShadow: hairline(ink),
        background: `color-mix(in oklch, ${color} 12%, transparent)`
      }}
    />
  )
}

/**
 * A layer someone is dragging out of a layout, as everyone else sees it. Its picture follows their pointer, lifted
 * and outlined in their color; a dimmed copy sits where it would land (`LandingCopy`), and the original is hidden.
 */
export function DragGhost({ member, children }: { member: Member; children: ReactNode }) {
  return (
    <div className="pointer-events-none rotate-[1.5deg] opacity-90 drop-shadow-xl">
      <Outlined by={[member]}>{children}</Outlined>
    </div>
  )
}

/** Where a dragged layer would land: a dimmed copy, outlined in the dragger's color, dashed. */
export function LandingCopy({ member, children }: { member: Member; children: ReactNode }) {
  return (
    <div className="pointer-events-none relative h-full opacity-55">
      {children}
      <span
        className="absolute -inset-[2px] rounded-[8px]"
        style={{ border: `1.5px dashed ${member.palette.color}` }}
      />
    </div>
  )
}
