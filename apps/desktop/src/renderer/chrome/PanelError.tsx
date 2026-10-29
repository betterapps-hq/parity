import { TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Something a panel couldn't do, as a callout: what failed, the reason as it was given, and a way on when there is one.
 * The reason can be selected, to search for it or paste it into a report.
 */
export function PanelError({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <p className="text-sm font-medium">{title}</p>
        {children && <p className="text-xs break-words text-muted-foreground select-text">{children}</p>}
        {action && <div className="mt-1.5">{action}</div>}
      </div>
    </div>
  )
}
