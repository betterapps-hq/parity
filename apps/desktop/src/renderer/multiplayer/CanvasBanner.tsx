import type { ReactNode } from "react"
import { floatingBar } from "../chrome/toolbar-parts.tsx"

interface CanvasBannerProps {
  /** A 22px face, or an icon. */
  lead: ReactNode
  title: ReactNode
  hint?: ReactNode
  /** Its buttons, extra-small. */
  children?: ReactNode
}

/**
 * A bar at the top middle of the canvas saying what's going on, built as the review tools' bar is: what leads it (a
 * face, or an icon), a title, a hint in gray, then its buttons. Following, presenting, an invitation to follow and a
 * dropped connection all use it, so they read as one family with the canvas's own bars. It drops in as it appears, and
 * on a narrow canvas the hint goes first.
 */
export function CanvasBanner({ lead, title, hint, children }: CanvasBannerProps) {
  return (
    <output
      className={`${floatingBar} pointer-events-auto absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 pl-1.5 text-sm whitespace-nowrap transition-[translate,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)] [--face-cutout:var(--floating-bar)] starting:-translate-y-2 starting:opacity-0 motion-reduce:transition-none`}
    >
      <span className="flex size-6 shrink-0 items-center justify-center">{lead}</span>
      <span className="shrink-0 font-medium">{title}</span>
      {hint && <span className="min-w-0 truncate text-xs text-muted-foreground @max-[480px]:hidden">{hint}</span>}
      {children ? (
        <span className="ml-1 flex shrink-0 items-center gap-1">{children}</span>
      ) : (
        <span className="w-1.5" />
      )}
    </output>
  )
}
