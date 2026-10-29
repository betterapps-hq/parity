import { Check, Component, Eye, ListFilter, MessageSquarePlus, Plus } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { agentPalettes } from "../../agent/agent-colors.ts"
import { me, type Person } from "../explore-data.ts"
import { Avatar, AvatarStack } from "../parts.tsx"
import type { ThreadData } from "./collab-data.ts"
import { CommentText, commentBlue } from "./comments.tsx"

export type PinState = "default" | "unread" | "selected" | "resolved" | "working" | "draft" | "detached" | "elsewhere"

/** The pin's corner that marks the spot: the rest of it is round. */
const teardrop = "rounded-[18px] rounded-bl-[3px]"

/**
 * Where a thread is: the avatars of who's in it, in a teardrop whose sharp corner marks the spot. Unread pins have a
 * blue ring, the open one fills blue, an agent at work glows in its color, and resolved pins fade to a check. A pin
 * whose layer was deleted is dashed in amber, one left on another frame is faded, and one on a component wears the
 * component's mark on every use.
 */
export function CommentPin({
  people,
  state = "default",
  replies,
  component,
  className = ""
}: {
  people: Person[]
  state?: PinState
  /** Shown after the avatars once a thread has replies. */
  replies?: number
  /** The thread is on a component, and this is one of its uses. */
  component?: boolean
  className?: string
}) {
  const palette = agentPalettes[7]!
  const ring = {
    default: "ring-1 ring-white/15",
    unread: "ring-2 ring-[oklch(0.65_0.18_250)]",
    selected: "ring-2 ring-white",
    resolved: "ring-1 ring-white/10 opacity-70",
    working: "ring-2",
    draft: "outline-2 outline-dashed outline-white/60 outline-offset-0",
    detached: "outline-2 outline-dashed outline-[oklch(0.82_0.14_75)] outline-offset-0",
    elsewhere: "ring-1 ring-white/10 opacity-55"
  }[state]
  return (
    <span
      className={`relative inline-flex items-center p-[3px] shadow-[0_4px_14px_rgb(0_0_0/0.45)] transition-[scale,background-color,box-shadow,opacity] duration-200 ease-out ${teardrop} ${ring} ${
        state === "selected" ? "scale-110 bg-[oklch(0.6_0.19_255)] text-white" : "bg-popover"
      } origin-bottom-left ${className}`}
      style={
        state === "working"
          ? ({
              "--tw-ring-color": palette.color,
              boxShadow: `0 0 0 5px color-mix(in oklch, ${palette.color} 22%, transparent), 0 4px 14px rgb(0 0 0 / 0.45)`
            } as CSSProperties)
          : undefined
      }
    >
      {state === "resolved" ? (
        <span className="grid size-[22px] place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
          <Check className="size-3.5" />
        </span>
      ) : state === "draft" ? (
        <>
          <Avatar person={me} size={22} />
          <Plus className="mx-1 size-3.5" />
        </>
      ) : (
        people
          .slice(0, 3)
          .map((person, index) => (
            <Avatar
              key={person.name}
              person={person}
              size={22}
              className={
                index > 0 ? `-ml-2 ring-2 ${state === "selected" ? "ring-[oklch(0.6_0.19_255)]" : "ring-popover"}` : ""
              }
            />
          ))
      )}
      {replies !== undefined && state !== "resolved" && state !== "draft" && (
        <span
          className={`px-1.5 text-[11px] font-semibold tabular-nums ${state === "selected" ? "" : "text-muted-foreground"}`}
        >
          {replies}
        </span>
      )}
      {state === "unread" && (
        <span
          className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-[#0c0c0f] duration-300 motion-safe:animate-in motion-safe:zoom-in-0"
          style={{ background: commentBlue }}
        />
      )}
      {component && (
        <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-[oklch(0.62_0.2_300)] text-white ring-2 ring-[#0c0c0f]">
          <Component className="size-2.5" strokeWidth={2.5} />
        </span>
      )}
    </span>
  )
}

/** Places a pin on a board, its sharp corner at the point. */
export function PlacedPin({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="absolute z-10 -translate-y-full" style={{ left: x, top: y }}>
      {children}
    </div>
  )
}

/** What hovering a pin shows: the first comment, how many replies, who's in it. Clicking opens the thread. */
export function PinPreview({ thread }: { thread: ThreadData }) {
  const first = thread.comments[0]!
  const people = [...new Set(thread.comments.map((comment) => comment.author))]
  const replies = thread.comments.length - 1
  return (
    <div className="flex w-72 flex-col gap-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-2xl">
      <div className="flex items-baseline gap-1.5 text-xs">
        <span className="text-[13px] font-medium">{first.author === me ? "You" : first.author.name}</span>
        <span className="text-muted-foreground">{first.when}</span>
      </div>
      <div className="line-clamp-3">
        <CommentText text={first.text} />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <AvatarStack people={people} size={18} max={4} />
        {replies > 0 && <span>{replies === 1 ? "1 reply" : `${replies} replies`}</span>}
        <span className="ml-auto">Click to open</span>
      </div>
    </div>
  )
}

/** A comment on an area rather than a point: the area dashed, its pin at the top right. */
export function AreaComment({
  x,
  y,
  width,
  height,
  children
}: {
  x: number
  y: number
  width: number
  height: number
  /** The pin. */
  children: ReactNode
}) {
  return (
    <>
      <div
        className="pointer-events-none absolute rounded-md border-[1.5px] border-dashed"
        style={{
          left: x,
          top: y,
          width,
          height,
          borderColor: commentBlue,
          background: `color-mix(in oklch, ${commentBlue} 8%, transparent)`
        }}
      />
      <PlacedPin x={x + width - 4} y={y + 4}>
        {children}
      </PlacedPin>
    </>
  )
}

/** Outlines the layer a thread is pinned to, while its pin is hovered or open. The pin follows the layer as it moves. */
export function LayerOutline({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span
        className="pointer-events-none absolute -inset-1 rounded-md border-[1.5px]"
        style={{ borderColor: commentBlue }}
      />
      <span
        className="pointer-events-none absolute -top-6 -left-1 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white"
        style={{ background: commentBlue }}
      >
        {name}
      </span>
    </div>
  )
}

/** Zoomed out, pins near each other merge: who's in them, how many threads, and whether any are unread. */
export function PinCluster({ count, people, unread }: { count: number; people: Person[]; unread?: boolean }) {
  return (
    <span
      className={`relative inline-flex items-center gap-1.5 bg-popover py-[3px] pr-2.5 pl-[3px] shadow-[0_4px_14px_rgb(0_0_0/0.45)] ${teardrop} ${unread ? "ring-2 ring-[oklch(0.65_0.18_250)]" : "ring-1 ring-white/15"}`}
    >
      <AvatarStack people={people} size={20} max={2} />
      <span className="text-xs font-semibold tabular-nums">{count}</span>
    </span>
  )
}

/** The cursor in comment mode: a pin-shaped bubble with a plus, its sharp corner where the comment goes. */
export function CommentCursor({ hint }: { hint?: string }) {
  return (
    <div className="pointer-events-none relative">
      <svg width="26" height="26" viewBox="0 0 26 26" className="drop-shadow-[0_2px_4px_rgb(0_0_0/0.5)]">
        <path d="M2 24V13a11 11 0 1 1 11 11Z" fill="white" stroke="#111" strokeWidth="1.5" />
        <path d="M13 8.5v9M8.5 13h9" stroke="#111" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {hint && (
        <span className="absolute top-7 left-5 w-max rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg ring-1 ring-border">
          {hint}
        </span>
      )}
    </div>
  )
}

/** Along the top of the canvas while commenting: how it works, the filters, and the way out. */
export function CommentModeBar({ showResolved = false }: { showResolved?: boolean }) {
  return (
    <div className="flex w-fit items-center gap-1 rounded-xl border bg-popover p-1 pl-3 text-sm text-popover-foreground shadow-xl">
      <MessageSquarePlus className="size-4" style={{ color: commentBlue }} />
      <span className="ml-1 font-medium">Commenting</span>
      <span className="mr-2 ml-2 text-xs text-muted-foreground">Click to comment, drag for an area</span>
      <span className="mx-1 h-5 w-px bg-border" />
      <Button size="xs" variant="ghost" aria-pressed={showResolved} className={showResolved ? "bg-muted" : ""}>
        <Eye /> Resolved
      </Button>
      <Button size="xs" variant="ghost">
        <ListFilter /> Everyone
      </Button>
      <Button size="xs" variant="secondary" className="ml-1">
        Done <Kbd className="ml-1">Esc</Kbd>
      </Button>
    </div>
  )
}
