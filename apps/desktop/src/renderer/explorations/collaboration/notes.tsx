import { Check, Clock, MessageSquare } from "lucide-react"
import { Fragment, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { me, type Person } from "../explore-data.ts"
import { accent, Avatar } from "../parts.tsx"

export type StickyColor = "yellow" | "orange" | "pink" | "violet" | "blue" | "green" | "gray"

const stickies: Record<StickyColor, { bg: string; ink: string }> = {
  yellow: { bg: "oklch(0.93 0.12 98)", ink: "oklch(0.3 0.06 90)" },
  orange: { bg: "oklch(0.86 0.12 60)", ink: "oklch(0.3 0.07 50)" },
  pink: { bg: "oklch(0.86 0.1 350)", ink: "oklch(0.3 0.08 350)" },
  violet: { bg: "oklch(0.84 0.09 300)", ink: "oklch(0.28 0.08 300)" },
  blue: { bg: "oklch(0.86 0.08 235)", ink: "oklch(0.28 0.07 240)" },
  green: { bg: "oklch(0.88 0.11 150)", ink: "oklch(0.28 0.07 150)" },
  gray: { bg: "oklch(0.88 0 0)", ink: "oklch(0.27 0 0)" }
}

export const stickyColors = Object.keys(stickies) as StickyColor[]

/** A sticky note: for discussion, ideas and to-dos beside the designs. It has an author, and never ships. */
export function StickyNote({
  color = "yellow",
  author,
  size = 200,
  children
}: {
  color?: StickyColor
  author?: Person
  size?: number
  children: ReactNode
}) {
  const { bg, ink } = stickies[color]
  return (
    <div
      className="flex flex-col justify-between gap-3 rounded-[3px] p-4 shadow-[0_10px_24px_rgb(0_0_0/0.35)]"
      style={{ width: size, minHeight: size, background: bg, color: ink }}
    >
      <p className="text-[15px] leading-snug font-medium whitespace-pre-wrap">{children}</p>
      {author && (
        <span className="flex items-center gap-1.5 text-[11px] font-medium opacity-75">
          <Avatar person={author} size={16} />
          {author === me ? "You" : author.name}
        </span>
      )}
    </div>
  )
}

/** Free text on the canvas, as the canvas note draws it today: titles, labels, a flow's explanation. */
export function TextNote({ children }: { children: ReactNode }) {
  return <p className="w-max max-w-[36rem] text-2xl leading-snug text-foreground">{children}</p>
}

export type CalloutCategory = "Behavior" | "Content" | "Layout" | "Data" | "Accessibility"

const categoryHue: Record<CalloutCategory, number> = {
  Behavior: 250,
  Content: 150,
  Layout: 60,
  Data: 200,
  Accessibility: 300
}

/** A callout's number, on the layer it's about, at the end of its leader line. */
export function CalloutNumber({ n }: { n: number }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-neutral-900 text-[10px] font-semibold text-white tabular-nums shadow-md ring-2 ring-white">
      {n}
    </span>
  )
}

/**
 * A callout: a note attached to a layer, that moves with it. What it's about, the note, and properties pinned from
 * the layer that stay current as the design changes. Builders and agents read them as part of the spec.
 */
export function Callout({
  n,
  category,
  layer,
  properties,
  author,
  children
}: {
  n: number
  category: CalloutCategory
  layer: string
  /** Pinned from the layer, so they update when it does. */
  properties?: [string, string][]
  author?: Person
  children: ReactNode
}) {
  const hue = categoryHue[category]
  return (
    <div className="flex w-64 flex-col gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl">
      <div className="flex items-center gap-2">
        <CalloutNumber n={n} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{layer}</span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            background: `color-mix(in oklch, ${accent(hue, 0.7, 0.14)} 20%, transparent)`,
            color: accent(hue, 0.84, 0.1)
          }}
        >
          {category}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-foreground/90">{children}</p>
      {properties && (
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-muted/50 px-2.5 py-2 font-mono text-[11px]">
          {properties.map(([name, value]) => (
            <Fragment key={name}>
              <span className="text-muted-foreground">{name}</span>
              <span>{value}</span>
            </Fragment>
          ))}
        </div>
      )}
      {author && (
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Avatar person={author} size={14} />
          {author === me ? "You" : author.name}
        </span>
      )}
    </div>
  )
}

/**
 * The line from a callout to its layer, in the coordinates of the box both sit in. Mid-gray, so it reads on the dark
 * canvas and on a light design alike.
 */
export function Leader({ from, to }: { from: [number, number]; to: [number, number] }) {
  return (
    <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="oklch(0.62 0 0)" strokeWidth={1.5} />
    </svg>
  )
}

export type ReviewStatus = "draft" | "review" | "changes" | "approved"

const reviewStatuses: Record<ReviewStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: "oklch(0.7 0 0)" },
  review: { label: "In review", color: "oklch(0.8 0.14 85)" },
  changes: { label: "Changes requested", color: "oklch(0.72 0.17 30)" },
  approved: { label: "Approved", color: "oklch(0.75 0.15 155)" }
}

export const reviewStatusOrder = Object.keys(reviewStatuses) as ReviewStatus[]

/** Where a section's designs are in review. */
export function StatusPill({ status }: { status: ReviewStatus }) {
  const { label, color } = reviewStatuses[status]
  return (
    <span
      className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `color-mix(in oklch, ${color} 16%, transparent)`, color }}
    >
      {status === "approved" ? (
        <Check className="size-3" strokeWidth={2.5} />
      ) : (
        <span className="size-1.5 rounded-full" style={{ background: color }} />
      )}
      {label}
    </span>
  )
}

/** A reviewer, with whether they've approved. */
export function Reviewer({ person, approved }: { person: Person; approved?: boolean }) {
  return (
    <span className="relative" title={`${person === me ? "You" : person.name}${approved ? ", approved" : ", waiting"}`}>
      <Avatar person={person} size={22} className={approved ? "" : "opacity-60"} />
      <span
        className={`absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full ring-2 ring-[#0c0c0f] ${approved ? "bg-emerald-500 text-white" : "bg-neutral-600 text-white"}`}
      >
        {approved ? <Check className="size-2.5" strokeWidth={3} /> : <Clock className="size-2.5" strokeWidth={2.5} />}
      </span>
    </span>
  )
}

/**
 * A section: a titled region of the canvas that groups boards, notes and callouts. It carries a review status and its
 * reviewers, so a section is also what gets reviewed and approved.
 */
export function Section({
  title,
  status,
  reviewers,
  comments,
  hue = 250,
  children,
  className = ""
}: {
  title: string
  status?: ReviewStatus
  reviewers?: { person: Person; approved?: boolean }[]
  /** Open comments inside it. */
  comments?: number
  hue?: number
  children?: ReactNode
  className?: string
}) {
  return (
    <section
      className={`relative rounded-2xl border p-6 pt-16 ${className}`}
      style={{
        borderColor: `color-mix(in oklch, ${accent(hue, 0.7, 0.12)} 35%, transparent)`,
        background: `color-mix(in oklch, ${accent(hue, 0.6, 0.1)} 7%, transparent)`
      }}
    >
      <div className="absolute inset-x-4 top-4 flex items-center gap-2.5">
        <span
          className="rounded-md px-2 py-0.5 text-sm font-semibold text-white"
          style={{ background: accent(hue, 0.5, 0.12) }}
        >
          {title}
        </span>
        {status && <StatusPill status={status} />}
        <span className="ml-auto flex items-center gap-3">
          {!!comments && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="size-3.5" /> {comments}
            </span>
          )}
          {reviewers && (
            <span className="flex items-center gap-2">
              {reviewers.map((reviewer) => (
                <Reviewer key={reviewer.person.name} person={reviewer.person} approved={reviewer.approved} />
              ))}
            </span>
          )}
        </span>
      </div>
      {children}
    </section>
  )
}

/** Asked to review a section, as it arrives in the inbox: who asked, their note, and the decision. */
export function ReviewRequest({
  from,
  section,
  designs,
  comments,
  children
}: {
  from: Person
  section: string
  designs: number
  comments: number
  children: ReactNode
}) {
  return (
    <div className="flex w-[22rem] flex-col gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-2xl">
      <div className="flex items-start gap-2.5">
        <Avatar person={from} size={28} />
        <span className="text-[13px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">{from.name}</span> asked you to review{" "}
          <span className="font-medium text-foreground">{section}</span>
          <span className="block text-xs">
            {designs} designs, {comments} open comments
          </span>
        </span>
      </div>
      <p className="border-l-2 pl-2.5 text-[13px] text-foreground/85">{children}</p>
      <div className="flex gap-2">
        <Button size="sm" className="gap-1">
          <Check /> Approve
        </Button>
        <Button size="sm" variant="outline">
          Request changes
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto">
          Open
        </Button>
      </div>
    </div>
  )
}
