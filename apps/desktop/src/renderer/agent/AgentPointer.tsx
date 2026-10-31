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
  TriangleAlert
} from "lucide-react"
import { useId } from "react"
import type { PresenceEvent } from "../../shared/protocol.ts"
import type { AgentPalette } from "./agent-colors.ts"

/** Before an agent has a palette of its own. */
const fallbackColor = "var(--canvas-agent)"

/** An arrowhead with a rounded tip and corners, pointing up and left from its tip at (3, 3). */
const pointerPath =
  "M4.2 3.1C3.5 2.8 2.8 3.5 3.1 4.2L9.4 19.6C9.7 20.4 10.8 20.3 11 19.5L12.6 13.4C12.7 13 13 12.7 13.4 12.6L19.5 11C20.3 10.8 20.4 9.7 19.6 9.4Z"

/**
 * An agent's arrow: filled with its palette, rimmed in white so it reads on any design, and glowing faintly in its
 * own color. It breathes with a soft pulse around it while idle, when an ancestor with the `group/cursor` class has
 * `data-idle="true"`, and presses in while it drags.
 */
export function AgentPointer({ palette, pressed }: { palette?: AgentPalette; pressed?: boolean }) {
  const gradient = `agent-pointer-${useId().replaceAll(/[^\w-]/g, "")}`
  const color = palette?.color ?? fallbackColor
  const [from, through, to] = palette?.stops ?? [color, color, color]
  return (
    <>
      <span
        className="absolute -top-2 -left-2 size-8 rounded-full opacity-0 group-data-[idle=true]/cursor:animate-[agent-halo_2.8s_ease-out_infinite]"
        style={{ background: `radial-gradient(circle, ${color} 0%, transparent 65%)` }}
      />
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        aria-hidden
        className="relative -mt-0.5 -ml-0.5 origin-top-left transition-transform duration-150 group-data-[idle=true]/cursor:animate-[agent-breathe_2.8s_ease-in-out_infinite]"
        style={{
          filter: `drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.35)) drop-shadow(0 0 5px color-mix(in oklch, ${color} 55%, transparent))`,
          ...(pressed ? { transform: "scale(0.82)" } : {})
        }}
      >
        <defs>
          <linearGradient id={gradient} x1="4" y1="4" x2="15" y2="18" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={from} />
            <stop offset="0.55" stopColor={through} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        </defs>
        <path
          d={pointerPath}
          fill={`url(#${gradient})`}
          stroke="white"
          strokeWidth="2.2"
          strokeLinejoin="round"
          paintOrder="stroke"
        />
      </svg>
    </>
  )
}

/**
 * The badge under an agent's arrow: what kind of thing it's doing, who the agent is and, while a call runs, the call's
 * label. Between calls, and before its first step, the icon is a sparkle.
 */
export function AgentBadge({
  palette,
  agent,
  kind,
  label
}: {
  palette?: AgentPalette
  agent: string
  kind?: PresenceEvent["kind"]
  label?: string
}) {
  return (
    <div
      className="mt-0.5 ml-4 flex w-max max-w-72 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap shadow-md"
      style={{
        background: palette ? `linear-gradient(90deg, ${palette.stops.join(", ")})` : fallbackColor,
        color: palette?.ink ?? "black"
      }}
    >
      <ActionIcon kind={kind} className="size-3 shrink-0" />
      <span className="max-w-40 shrink-0 truncate font-semibold" title={agent}>
        {agent}
      </span>
      {label && <span className="truncate opacity-75">{label}</span>}
    </div>
  )
}

/** The icon for a kind of action an agent takes. */
export function ActionIcon({ kind, className }: { kind?: PresenceEvent["kind"]; className?: string }) {
  if (kind === "read") return <Eye className={className} />
  if (kind === "write") return <PenLine className={className} />
  if (kind === "move") return <Move className={className} />
  if (kind === "screenshot") return <Camera className={className} />
  if (kind === "measure") return <Ruler className={className} />
  if (kind === "accessibility") return <Accessibility className={className} />
  if (kind === "problems") return <TriangleAlert className={className} />
  if (kind === "console") return <SquareTerminal className={className} />
  if (kind === "board") return <LayoutGrid className={className} />
  return <Sparkles className={className} />
}
