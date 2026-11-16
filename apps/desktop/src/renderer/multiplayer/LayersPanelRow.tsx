import type { LucideIcon } from "lucide-react"
import { Face } from "./Face.tsx"
import type { Member } from "./member.ts"

/**
 * A row in the Layers panel with who else has that layer selected: their faces at the row's end, small, so a person
 * and an agent read as they do in the stack. Past three, a count.
 */
export function LayersPanelRow({
  name,
  icon: Icon,
  depth = 0,
  selectedBy = [],
  selected
}: {
  name: string
  /** What kind of layer it is. */
  icon: LucideIcon
  depth?: number
  selectedBy?: Member[]
  /** Whether you have it selected yourself. */
  selected?: boolean
}) {
  const shown = selectedBy.slice(0, 3)
  const more = selectedBy.length - shown.length

  return (
    <li
      className={`flex h-7 items-center gap-2 rounded-md pr-1.5 text-[13px] ${selected ? "bg-[var(--canvas-layer)]/20" : ""}`}
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {selectedBy.length > 0 && (
        <span className="flex items-center" title={`Selected by ${selectedBy.map((member) => member.name).join(", ")}`}>
          {shown.map((member, index) => (
            <span key={member.name} className={index > 0 ? "-ml-1" : ""}>
              <Face member={member} size={16} />
            </span>
          ))}
          {more > 0 && <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">+{more}</span>}
        </span>
      )}
    </li>
  )
}
