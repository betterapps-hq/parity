import { ChevronRight } from "lucide-react"
import type { ElementType, ReactNode } from "react"

interface PanelSectionProps {
  title: string
  /** How many things the section holds, shown beside the title. */
  count?: number
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}

/** The right padding of the inspector's sections and headers, so inputs, bars, buttons and section actions end at one edge. */
export const panelEnd = "pr-3"

export function PanelSection({ title, count, description, action, children }: PanelSectionProps) {
  return (
    <section className={`border-b py-4 pl-3 last:border-b-0 ${panelEnd}`}>
      <PanelSectionTitle title={title} count={count} action={action} />
      {description && <p className="mb-3 px-1 type-description text-muted-foreground">{description}</p>}
      {children}
    </section>
  )
}

/**
 * How a 12px title stands against what it heads (docs/typography.md). `lead`, semibold in the text color, is the
 * inspector's: its sections lead their fields. `quiet`, medium and gray, is a list's: its groups recede so its rows lead.
 */
export type TitleTone = "lead" | "quiet"

const tones: Record<TitleTone, string> = {
  lead: "font-semibold text-foreground",
  quiet: "font-medium text-muted-foreground"
}

/**
 * A section's title on its own, for a list that draws its sections' rows itself, as a virtualized one does. Given
 * `onToggle`, the title is a button that folds the section, with a chevron that points down while it's open, and shows
 * hover with a fill, as rows do.
 */
export function PanelSectionTitle({
  title,
  count,
  action,
  open,
  onToggle,
  tone = "lead",
  as: Heading = "h3",
  id,
  spacing
}: Pick<PanelSectionProps, "title" | "count" | "action"> & {
  open?: boolean
  onToggle?: () => void
  tone?: TitleTone
  /** The heading's level, `h3` in a panel; the console, the error screen and the start page use `h2`. */
  as?: ElementType
  /** The heading's id, for a section labelled by its title. */
  id?: string
  /**
   * Its spacing, in place of the indent and margin a title keeps over a panel's fields: `""` for a title in a header's
   * row (the console, the error screen), `-ml-1` for one at its rows' edge (the start page).
   */
  spacing?: string
}) {
  const label = (
    <>
      {title}
      {count !== undefined && (
        <span className="rounded bg-muted px-1.5 py-px font-normal text-muted-foreground tabular-nums">{count}</span>
      )}
    </>
  )
  return (
    <div className={`flex items-center justify-between gap-2 ${spacing ?? (onToggle ? "" : "mb-3 pl-1")}`}>
      <Heading id={id} className={`flex min-w-0 flex-1 items-center gap-1.5 text-xs ${tones[tone]}`}>
        {onToggle ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="-ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pr-1 pl-1 text-left hover:bg-accent/50"
          >
            <ChevronRight className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
            {label}
          </button>
        ) : (
          label
        )}
      </Heading>
      {action}
    </div>
  )
}

/**
 * A group's label in a list that lays out its own rows (Layers, Processes, Assets, a state's changes, the actions
 * search): a section title's quiet tone, medium and gray, so the list's rows lead.
 */
export function GroupLabel({
  children,
  className = "",
  as: Tag = "span"
}: {
  children: ReactNode
  className?: string
  as?: ElementType
}) {
  return <Tag className={`text-xs font-medium text-muted-foreground ${className}`}>{children}</Tag>
}

/**
 * A group's title in a dialog (Settings, Shortcuts): semibold and gray, so the weight sets it apart from the gray
 * descriptions and the color from the 13px rows it heads.
 */
export function DialogGroupTitle({ children }: { children: ReactNode }) {
  return <h3 className="pb-1 text-xs font-semibold text-muted-foreground">{children}</h3>
}
