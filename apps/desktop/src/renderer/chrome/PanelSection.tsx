import { ChevronRight } from "lucide-react"
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
      <PanelSectionTitle title={title} count={count} action={action} />
      {description && <p className="mb-3 px-1 text-xs text-muted-foreground">{description}</p>}
      {children}
    </section>
  )
}

/**
 * A section's title on its own, for a list that draws its sections' rows itself, as a virtualized one does. Given
 * `onToggle`, the title is a button that folds the section, with a chevron that points down while it's open.
 */
export function PanelSectionTitle({
  title,
  count,
  action,
  open,
  onToggle
}: Pick<PanelSectionProps, "title" | "count" | "action"> & { open?: boolean; onToggle?: () => void }) {
  const label = (
    <>
      {title}
      {count !== undefined && (
        <span className="rounded bg-muted px-1.5 py-px font-normal tracking-normal tabular-nums normal-case">
          {count}
        </span>
      )}
    </>
  )
  return (
    <div className={`flex items-center justify-between gap-2 ${onToggle ? "" : "mb-3 px-1"}`}>
      <h3 className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {onToggle ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pr-1 text-left font-semibold tracking-wide uppercase hover:text-foreground"
          >
            <ChevronRight className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
            {label}
          </button>
        ) : (
          label
        )}
      </h3>
      {action}
    </div>
  )
}
