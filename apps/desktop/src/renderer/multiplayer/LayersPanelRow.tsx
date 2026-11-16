import type { LucideIcon } from "lucide-react"
import { Face } from "./Face.tsx"
import type { Member } from "./member.ts"

interface LayersPanelRowProps {
  name: string
  /** What kind of layer it is. */
  icon: LucideIcon
  depth?: number
  selectedBy?: Member[]
  /** Whether you have it selected yourself. */
  selected?: boolean
}

/**
 * A row in the Layers panel with who else has that layer selected: their faces at the row's end, small and just apart
 * rather than overlapping, since the row's own fill changes under them. Past three, a count.
 */
export function LayersPanelRow({ name, icon: Icon, depth = 0, selectedBy = [], selected }: LayersPanelRowProps) {
  const shown = selectedBy.slice(0, 3)
  const more = selectedBy.length - shown.length

  return (
    <li
      className={`flex h-7 items-center gap-2 rounded-md pr-1.5 text-sm ${selected ? "bg-[var(--canvas-layer)]/20" : ""}`}
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {selectedBy.length > 0 && (
        <span
          className="flex items-center gap-0.5 [--face-cutout:transparent]"
          title={`Selected by ${selectedBy.map((member) => member.name).join(", ")}`}
        >
          {shown.map((member) => (
            <Face key={member.name} member={member} size={16} />
          ))}
          {more > 0 && <span className="ml-1 text-2xs text-muted-foreground tabular-nums">+{more}</span>}
        </span>
      )}
    </li>
  )
}
