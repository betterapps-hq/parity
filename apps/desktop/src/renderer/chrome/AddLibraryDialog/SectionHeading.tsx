import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

/** A section's heading: what it holds, with its icon and how many there are. */
export function SectionHeading({
  id,
  icon: Icon,
  title,
  count,
  children
}: {
  id: string
  icon: LucideIcon
  title: string
  count: number
  children?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 border-b pb-2">
      <span className="grid size-6 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <h3 id={id} className="text-sm font-semibold">
        {title}
      </h3>
      <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{count}</span>
      {children && <div className="ml-auto">{children}</div>}
    </div>
  )
}
