import { Tooltip, TooltipContent, TooltipTrigger } from "@buildkitgg/shadcn-baseui-kit"
import type { ComponentProps, ReactElement, ReactNode } from "react"

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
  /**
   * Lets the pointer through it to what's below, for an element so small that the hint, sliding in with its arrow,
   * would land under a still pointer and take it from the element. It closes as the pointer leaves the element, since
   * the pointer can't move onto it.
   */
  passThrough?: boolean
  children: ReactElement
}

/**
 * A tooltip, where a native `title` would draw the browser's own instead of Parity's. Anything a trigger rendering it
 * passes it reaches the element, so it can be a popover or context menu trigger's `render`.
 *
 * The tooltip marks the element `data-popup-open` while it shows, as popover and menu triggers do while theirs are
 * open, so what it wraps styles its open popover by `aria-expanded`.
 */
export function Hint({
  label,
  detail,
  side,
  wait,
  hidden,
  open,
  onOpenChange,
  passThrough,
  children,
  ...trigger
}: HintProps) {
  const says = label !== undefined && label !== null && label !== false && label !== ""

  return (
    // A popup that can't be hovered is inert, which takes it out of hit testing.
    <Tooltip open={open} onOpenChange={onOpenChange} disableHoverablePopup={passThrough}>
      <TooltipTrigger delay={wait ? 500 : undefined} {...trigger} render={children} />
      {says && !hidden && (
        <TooltipContent side={side} className={`wrap-anywhere ${detail ? "flex-col items-start gap-0.5" : ""}`}>
          {label}
          {detail && <span className="whitespace-pre-line text-background/70">{detail}</span>}
        </TooltipContent>
      )}
    </Tooltip>
  )
}
