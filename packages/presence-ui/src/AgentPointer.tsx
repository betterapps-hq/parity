import {
  Accessibility,
  Camera,
  Eye,
  LayoutGrid,
  Move,
  PenLine,
  Ruler,
  Sparkles,
  SquareTerminal,
  TriangleAlert,
  type LucideIcon
} from "lucide-react"
import { Arrow } from "./Arrow.tsx"
import { gradient, type PaletteLook } from "./member.ts"

/** What kind of step an agent is taking, as its presence names it (`AgentEvent["kind"]` in `@parity-app/agent`). */
export type AgentStepKind =
  | "read"
  | "write"
  | "move"
  | "screenshot"
  | "measure"
  | "accessibility"
  | "problems"
  | "console"
  | "board"
  | "start"
  | "end"

/** Before an agent has a palette of its own. */
const fallbackColor = "var(--canvas-agent)"

/**
 * An agent's arrow: filled with its palette, rimmed in white so it reads on any design, and glowing faintly in its
 * own color. It breathes with a soft pulse around it while idle, when an ancestor with the `group/cursor` class has
 * `data-idle="true"`, and presses in while it drags. With reduced motion it neither breathes nor pulses.
 */
export function AgentPointer({ palette, pressed }: { palette?: PaletteLook; pressed?: boolean }) {
  const color = palette?.color ?? fallbackColor

  return (
    <>
      <span
        aria-hidden
        className="absolute -top-2 -left-2 size-8 rounded-full opacity-0 group-data-[idle=true]/cursor:animate-[agent-halo_2.8s_ease-out_infinite] motion-reduce:group-data-[idle=true]/cursor:animate-none"
        style={{ background: `radial-gradient(circle, ${color} 0%, transparent 65%)` }}
      />
      <Arrow
        stops={palette?.stops ?? [color, color, color]}
        pressed={pressed}
        glow={color}
        className="group-data-[idle=true]/cursor:animate-[agent-breathe_2.8s_ease-in-out_infinite] motion-reduce:group-data-[idle=true]/cursor:animate-none"
      />
    </>
  )
}

/**
 * The badge under an agent's arrow: what kind of thing it's doing, who the agent is and, while a call runs, the call's
 * label. Between calls, and before its first step, the icon is a sparkle. It's a canvas chip, never dimmed: its ink is
 * at least 4.5:1 on every stop of its palette, so the name stands out by weight alone.
 */
export function AgentBadge({
  palette,
  agent,
  kind,
  label
}: {
  palette?: PaletteLook
  agent: string
  kind?: AgentStepKind
  label?: string
}) {
  return (
    <div
      className="mt-0.5 ml-4 flex w-max max-w-72 items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium whitespace-nowrap tabular-nums shadow-md"
      style={{
        background: palette ? gradient(palette) : fallbackColor,
        color: palette?.ink ?? "var(--canvas-chip-ink)"
      }}
    >
      <ActionIcon kind={kind} className="size-3 shrink-0" />
      <span className="pointer-events-auto max-w-40 shrink-0 truncate font-semibold" title={agent}>
        {agent}
      </span>
      {label && <span className="truncate">{label}</span>}
    </div>
  )
}

const icons: Record<AgentStepKind, LucideIcon> = {
  read: Eye,
  write: PenLine,
  move: Move,
  screenshot: Camera,
  measure: Ruler,
  accessibility: Accessibility,
  problems: TriangleAlert,
  console: SquareTerminal,
  board: LayoutGrid,
  start: Sparkles,
  end: Sparkles
}

/** The icon for a kind of step an agent takes: a sparkle between steps, and for starting and ending. */
export function ActionIcon({ kind, className }: { kind?: AgentStepKind; className?: string }) {
  const Icon = kind ? icons[kind] : Sparkles

  return <Icon className={className} />
}
