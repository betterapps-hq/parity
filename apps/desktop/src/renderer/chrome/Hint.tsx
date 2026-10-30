import type { ComponentProps, ReactElement, ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type HintProps = Omit<ComponentProps<typeof TooltipTrigger>, "children"> & {
  /** What it says. Nothing shows without it. */
  label: ReactNode
  /** More about it, dimmed on the lines below. */
  detail?: ReactNode
  side?: ComponentProps<typeof TooltipContent>["side"]
  /**
   * Waits a moment before showing, for text that spells out what's cut off or adds background, so moving across a list
   * doesn't open one per row. Controls name themselves at once.
   */
  wait?: boolean
  /** Keeps it closed, as while the popover it would cover is open. */
  hidden?: boolean
  /** Opens and closes it from outside, as hovering would, to close it when its element is pressed and dragged. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactElement
}

/**
 * A tooltip, where a native `title` would draw the browser's own instead of Parity's. Anything an `asChild` trigger
 * passes it reaches the element, so it can sit inside a popover or context menu trigger.
 *
 * The tooltip takes over the element's `data-state`, so what it wraps mustn't style by that: toggles style by
 * `aria-pressed` or `aria-checked`, and popover triggers by `aria-expanded`.
 */
export function Hint({ label, detail, side, wait, hidden, open, onOpenChange, children, ...trigger }: HintProps) {
  const says = label !== undefined && label !== null && label !== false && label !== ""
  return (
    <Tooltip delayDuration={wait ? 500 : undefined} open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild {...trigger}>
        {children}
      </TooltipTrigger>
      {says && !hidden && (
        <TooltipContent side={side} className={`wrap-anywhere ${detail ? "flex-col items-start gap-0.5" : ""}`}>
          {label}
          {detail && <span className="whitespace-pre-line text-background/70">{detail}</span>}
        </TooltipContent>
      )}
    </Tooltip>
  )
}
