import type { ReactNode } from "react"

interface PanelSectionProps {
  title: string
  /** How many things the section holds, shown beside the title. */
  count?: number
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}

export function PanelSection({ title, count, description, action, children }: PanelSectionProps) {
  return (
    <section className="border-b px-3 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
          {count !== undefined && (
            <span className="rounded bg-muted px-1.5 py-px font-normal tracking-normal tabular-nums normal-case">
              {count}
            </span>
          )}
        </h3>
        {action}
      </div>
      {description && <p className="mb-3 px-1 text-xs text-muted-foreground">{description}</p>}
      {children}
    </section>
  )
}
