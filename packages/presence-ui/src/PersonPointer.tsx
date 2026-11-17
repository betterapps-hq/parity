import { Arrow } from "./Arrow.tsx"
import { firstName, gradient, type PaletteLook } from "./member.ts"

interface PersonBadgeProps {
  palette: PaletteLook
  name: string
  /** A short note after their name, from something the room knows for certain, as "Typing…". */
  detail?: string
}

/**
 * The badge under a person's pointer, a canvas chip on their gradient: their first name, and a short note after it
 * when there's something certain to say, such as that they're typing. What they're doing is never guessed at.
 */
export function PersonBadge({ palette, name, detail }: PersonBadgeProps) {
  return (
    <div
      className="mt-0.5 ml-4 flex w-max max-w-72 items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium whitespace-nowrap shadow-md"
      style={{ background: gradient(palette), color: palette.ink }}
    >
      <span className="max-w-40 truncate font-semibold">{firstName(name)}</span>
      {detail && <span className="truncate">{detail}</span>}
    </div>
  )
}

interface PersonPointerProps {
  palette: PaletteLook
  /** Their whole name; the badge shows the first word. */
  name: string
  /** A short note after their name, as "Typing…". Left out while they're away. */
  detail?: string
  /** Whether they've left the canvas: the pointer stays where they left it, faded, with only their name. */
  away?: boolean
  /** Whether they're dragging, which presses the arrow in. */
  pressed?: boolean
  /** Whether to show their badge: not while they drag, when what they move carries their name. */
  badge?: boolean
}

/**
 * A person's pointer: the agents' arrowhead and gradient, rimmed in white, with an ordinary shadow, and their first
 * name under it. It doesn't glow or breathe; only an agent's does. Off the canvas it fades and keeps only their name.
 * Place it with `RemotePointer`, which also glides it back when they return.
 */
export function PersonPointer({ palette, name, detail, away, pressed, badge = true }: PersonPointerProps) {
  return (
    <div
      className={`transition-opacity duration-300 motion-reduce:transition-none ${away ? "opacity-35" : ""}`}
      aria-hidden
    >
      <Arrow stops={palette.stops} pressed={pressed} />
      {badge && <PersonBadge palette={palette} name={name} detail={away ? undefined : detail} />}
    </div>
  )
}
