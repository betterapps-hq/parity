import type { LucideIcon } from "lucide-react"
import { Face } from "./Face.tsx"
import { keyOf, listed, type Member } from "./member.ts"

interface LayersPanelRowProps {
  name: string
  /** What kind of layer it is. */
  icon: LucideIcon
  depth?: number
  selectedBy?: Member[]
  /** Whether you have it selected yourself. */
  selected?: boolean
}

const nameOf = (member: Member) => member.name

/*
 * A row's fill, which its faces are cut out of so they can overlap closely: the panel's background, the muted step
 * under the pointer, and the layer blue mixed in while you have it selected. One set applies, never both, since two
 * classes setting the same variable would be decided by stylesheet order.
 */
const faces = "bg-(--row-fill) [--face-cutout:var(--row-fill)] [--face-cutout-width:1.5px]"

const plainFill = "[--row-fill:var(--background)] hover:[--row-fill:var(--muted)]"

const selectedFill =
  "[--row-fill:color-mix(in_oklab,var(--canvas-layer)_20%,var(--background))] hover:[--row-fill:color-mix(in_oklab,var(--canvas-layer)_26%,var(--background))]"

/**
 * A row in the Layers panel with who else has that layer selected: their faces at the row's end, small and stacked
 * closely so a crowd and the row's own icons still fit, each cut out of the row's fill. Past three, a count.
 */
export function LayersPanelRow({ name, icon: Icon, depth = 0, selectedBy = [], selected }: LayersPanelRowProps) {
  const shown = selectedBy.slice(0, 3)
  const more = selectedBy.length - shown.length

  return (
    <li
      className={`flex h-7 items-center gap-2 rounded-md pr-1.5 text-sm ${faces} ${selected ? selectedFill : plainFill}`}
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {selectedBy.length > 0 && (
        <span className="flex shrink-0 items-center" title={`Selected by ${listed(selectedBy.map(nameOf))}`}>
          <span className="sr-only">Selected by {listed(selectedBy.map(nameOf))}</span>
          {shown.map((member, index) => (
            <span key={keyOf(member)} aria-hidden className={`flex ${index > 0 ? "-ml-1.5" : ""}`}>
              <Face member={member} size={16} />
            </span>
          ))}
          {more > 0 && (
            <span aria-hidden className="ml-1 text-2xs text-muted-foreground tabular-nums">
              +{more}
            </span>
          )}
        </span>
      )}
    </li>
  )
}
