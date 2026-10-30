import {
  AudioLines,
  Check,
  CircleDashed,
  Heading,
  Image as ImageIcon,
  Keyboard,
  ListOrdered,
  type LucideIcon,
  Megaphone,
  NotebookPen,
  PanelsTopLeft,
  Sparkles,
  TriangleAlert
} from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

export type A11yKind = "focus" | "heading" | "landmark" | "name" | "alt" | "keyboard" | "announce" | "note"

/** Whether the render does what the annotation says: checked, different, or something only a person can check. */
export type A11yStatus = "matches" | "differs" | "unchecked"

interface KindInfo {
  title: string
  /** What it's for. */
  hint: string
  /** How Parity checks it against the render. */
  check: string
  icon: LucideIcon
  bg: string
  ink: string
}

const tone = (hue: number) => ({ bg: `oklch(0.8 0.13 ${hue})`, ink: `oklch(0.27 0.08 ${hue})` })

/**
 * The annotations designers add for what automated checks can't know: the intent. Focus order wears the orange Show tab
 * order already uses, so the two read as one thing.
 */
export const a11yKinds: Record<A11yKind, KindInfo> = {
  focus: {
    title: "Focus order",
    hint: "Where Tab goes, in order",
    check: "Compared with the order Tab visits in the render",
    icon: ListOrdered,
    bg: "#f97316",
    ink: "#ffffff"
  },
  heading: {
    title: "Heading",
    hint: "A heading, and its level in the outline",
    check: "Compared with the element's tag or aria-level",
    icon: Heading,
    ...tone(300)
  },
  landmark: {
    title: "Landmark",
    hint: "A region people jump between",
    check: "Compared with the element's tag or role",
    icon: PanelsTopLeft,
    ...tone(185)
  },
  name: {
    title: "Name and role",
    hint: "What a screen reader says for it",
    check: "Compared with the computed role, name and state",
    icon: AudioLines,
    ...tone(250)
  },
  alt: {
    title: "Alt text",
    hint: "What an image says, or that it's decorative",
    check: "Compared with the image's alt",
    icon: ImageIcon,
    ...tone(150)
  },
  keyboard: {
    title: "Keyboard",
    hint: "Keys beyond Tab and Enter, and where focus goes",
    check: "Tried by an agent pressing the keys in a render",
    icon: Keyboard,
    ...tone(88)
  },
  announce: {
    title: "Announcement",
    hint: "What's announced when it changes",
    check: "Compared with the live region around it",
    icon: Megaphone,
    ...tone(350)
  },
  note: {
    title: "Note",
    hint: "Anything else: motion, timing, errors",
    check: "Read by people and agents, not checked",
    icon: NotebookPen,
    bg: "oklch(0.86 0 0)",
    ink: "oklch(0.25 0 0)"
  }
}

export const a11yKindOrder = Object.keys(a11yKinds) as A11yKind[]

/** A key, inside an annotation's text. */
export function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[3px] bg-black/15 px-1 py-px font-sans text-[10px]">{children}</kbd>
}

function StatusMark({ status }: { status: A11yStatus }) {
  if (status === "matches")
    return (
      <span className="-mr-0.5 grid size-3.5 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
        <Check className="size-2.5" strokeWidth={3} />
      </span>
    )
  if (status === "differs")
    return (
      <span className="-mr-0.5 grid size-3.5 shrink-0 place-items-center rounded-full bg-[oklch(0.3_0.05_60)] text-amber-300">
        <TriangleAlert className="size-2.5" strokeWidth={2.5} />
      </span>
    )
  return null
}

/** An annotation's label: the kind's color and icon, what it says, and whether the render agrees. */
export function A11yTag({ kind, status, children }: { kind: A11yKind; status?: A11yStatus; children: ReactNode }) {
  const info = a11yKinds[kind]
  const Icon = info.icon
  return (
    <span
      className="inline-flex h-5 max-w-80 items-center gap-1 rounded-[5px] px-1.5 text-[11px] leading-none font-semibold whitespace-nowrap shadow-[0_2px_6px_rgb(0_0_0/0.25)]"
      style={{ background: info.bg, color: info.ink }}
    >
      <Icon className="size-3 shrink-0" />
      <span className="flex min-w-0 items-center gap-1 truncate">{children}</span>
      {status && <StatusMark status={status} />}
    </span>
  )
}

export interface Tag {
  kind: A11yKind
  label: ReactNode
  status?: A11yStatus
}

const corners = {
  "top-start": "bottom-full left-[-4px] mb-[6px] items-start",
  "top-end": "bottom-full right-[-4px] mb-[6px] items-end",
  "bottom-start": "top-full left-[-4px] mt-[6px] items-start",
  "bottom-end": "top-full right-[-4px] mt-[6px] items-end",
  end: "top-1/2 left-full ml-[10px] -translate-y-1/2 items-start",
  inside: "top-[-4px] left-[-4px] items-start"
}

/**
 * Annotates one of a design's elements: an outline in the first tag's color (dashed, or solid for a region) and its
 * tags at a corner. A tag that disagrees with the render turns its outline amber.
 */
export function Annotate({
  tags,
  at = "top-start",
  region = false,
  children,
  className = ""
}: {
  tags: Tag[]
  at?: keyof typeof corners
  /** A landmark or other region: a solid outline, and its tag inside the corner. */
  region?: boolean
  children: ReactNode
  className?: string
}) {
  const differs = tags.some((tag) => tag.status === "differs")
  return (
    <div className={`relative ${className}`}>
      {children}
      <span
        className={`pointer-events-none absolute -inset-1 rounded-md border-[1.5px] ${region ? "" : "border-dashed"}`}
        style={{ borderColor: differs ? "oklch(0.8 0.16 75)" : a11yKinds[tags[0]!.kind].bg }}
      />
      <span className={`absolute z-10 flex flex-col gap-1 ${corners[region ? "inside" : at]}`}>
        {tags.map((tag, index) => (
          <A11yTag key={index} kind={tag.kind} status={tag.status}>
            {tag.label}
          </A11yTag>
        ))}
      </span>
    </div>
  )
}

/** 1st, 2nd, 3rd, then 4th onward. */
function ordinal(n: number): string {
  if (n === 1) return "1st"
  if (n === 2) return "2nd"
  if (n === 3) return "3rd"
  return `${n}th`
}

/**
 * A stop in the intended focus order: the element outlined and numbered at its corner, like Show tab order. When the
 * render visits it at another place, that place shows beside the number, in amber.
 */
export function FocusStop({
  n,
  rendered,
  children,
  className = ""
}: {
  n: number
  /** Where Tab really visits it, when that's different. */
  rendered?: number
  children: ReactNode
  className?: string
}) {
  const color = a11yKinds.focus.bg
  return (
    <div className={`relative ${className}`}>
      {children}
      <span
        className="pointer-events-none absolute -inset-1 rounded-md border-[1.5px]"
        style={{ borderColor: rendered ? "oklch(0.8 0.16 75)" : color }}
      />
      <span className="absolute -top-1 -left-1 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1">
        <span
          className="grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] leading-none font-semibold text-white tabular-nums shadow-sm"
          style={{ background: color }}
        >
          {n}
        </span>
        {rendered && (
          <span
            title={`Tab visits it ${ordinal(rendered)} in the render`}
            className="flex h-[18px] items-center gap-0.5 rounded-full bg-[oklch(0.3_0.05_60)] pr-1.5 pl-1 text-[10px] font-semibold text-amber-300 tabular-nums shadow-sm"
          >
            <TriangleAlert className="size-2.5" strokeWidth={2.5} />
            {rendered}
          </span>
        )}
      </span>
    </div>
  )
}

/** Picks the kind of annotation to place, like a stamp; Suggest has an agent draft them from the render to confirm. */
export function A11yToolbar({ active }: { active?: A11yKind }) {
  return (
    <div className="flex w-fit items-center gap-0.5 rounded-xl border bg-popover p-1 text-popover-foreground shadow-xl">
      {a11yKindOrder.map((kind) => {
        const info = a11yKinds[kind]
        const Icon = info.icon
        const selected = kind === active
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={selected}
            title={`${info.title}: ${info.hint}`}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-1.5 text-xs ${selected ? "bg-muted pr-2.5 font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
          >
            <span
              className="grid size-5 place-items-center rounded-[5px]"
              style={{ background: info.bg, color: info.ink }}
            >
              <Icon className="size-3" />
            </span>
            {selected && info.title}
          </button>
        )
      })}
      <span className="mx-1 h-5 w-px bg-border" />
      <Button size="sm" variant="ghost" className="gap-1.5">
        <Sparkles /> Suggest
      </Button>
    </div>
  )
}

export interface A11yNote {
  kind: A11yKind
  layer: string
  value: ReactNode
  status: A11yStatus
  /** What the render does instead, when it differs. */
  detail?: string
}

/** An annotation in the Accessibility tab's list: the layer, what it says, and how the render compares. */
export function A11yNoteRow({ note }: { note: A11yNote }) {
  const info = a11yKinds[note.kind]
  const Icon = info.icon
  let tone: string
  let mark: ReactNode
  let detail: ReactNode
  if (note.status === "matches") {
    tone = "text-emerald-400"
    mark = <Check className="size-3" />
    detail = "Matches the render"
  } else if (note.status === "differs") {
    tone = "text-amber-300"
    mark = <TriangleAlert className="size-3" />
    detail = note.detail
  } else {
    tone = "text-muted-foreground"
    mark = <CircleDashed className="size-3" />
    detail = note.detail ?? "Check by hand"
  }
  return (
    <button type="button" className="flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted/40">
      <span
        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-[5px]"
        style={{ background: info.bg, color: info.ink }}
      >
        <Icon className="size-3" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-medium">{note.layer}</span>
        <span className="text-xs text-foreground/80">{note.value}</span>
        <span className={`flex items-center gap-1 text-xs ${tone}`}>
          {mark}
          {detail}
        </span>
      </span>
    </button>
  )
}

/**
 * The Accessibility tab with annotations beside axe's issues: how many the render agrees with, the list grouped by
 * kind, and a way to hand the differences to an agent.
 */
export function A11yPanel({ notes }: { notes: A11yNote[] }) {
  const count = (status: A11yStatus) => notes.filter((note) => note.status === status).length
  return (
    <aside className="flex h-full w-80 flex-col border-l bg-background text-foreground">
      <div className="flex gap-1 border-b px-2 py-1.5 text-xs">
        <span className="rounded-md px-2.5 py-1 text-muted-foreground">Design</span>
        <span className="rounded-md px-2.5 py-1 text-muted-foreground">Modes</span>
        <span className="rounded-md bg-muted px-2.5 py-1 font-medium">Accessibility</span>
      </div>
      <div className="flex gap-1 px-2 pt-2 text-xs">
        <span className="rounded-md px-2.5 py-1 text-muted-foreground">
          Issues <span className="tabular-nums">2</span>
        </span>
        <span className="rounded-md bg-muted px-2.5 py-1 font-medium">
          Annotations <span className="text-muted-foreground tabular-nums">{notes.length}</span>
        </span>
      </div>
      <div className="flex items-center gap-3 px-4 py-3 text-xs">
        <span className="flex items-center gap-1 text-emerald-400">
          <Check className="size-3.5" /> {count("matches")}
        </span>
        <span className="flex items-center gap-1 text-amber-300">
          <TriangleAlert className="size-3.5" /> {count("differs")}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <CircleDashed className="size-3.5" /> {count("unchecked")}
        </span>
        <Button size="xs" variant="ghost" className="ml-auto">
          Check again
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1.5 pb-3">
        {a11yKindOrder
          .filter((kind) => notes.some((note) => note.kind === kind))
          .map((kind) => (
            <div key={kind} className="flex flex-col">
              <span className="px-2.5 pt-1 pb-0.5 text-[11px] font-medium text-muted-foreground">
                {a11yKinds[kind].title}
              </span>
              {notes
                .filter((note) => note.kind === kind)
                .map((note, index) => (
                  <A11yNoteRow key={index} note={note} />
                ))}
            </div>
          ))}
      </div>
      {count("differs") > 0 && (
        <div className="border-t p-3">
          <Button variant="outline" className="w-full gap-1.5">
            <Sparkles /> Ask Claude Code to fix {count("differs")} differences
          </Button>
        </div>
      )}
    </aside>
  )
}
