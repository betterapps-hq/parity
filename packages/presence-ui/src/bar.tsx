import { Separator } from "@buildkitgg/shadcn"
import type { ReactNode } from "react"

/*
 * The canvas's floating bars, as the app's toolbar and zoom are drawn (`chrome/toolbar-parts.tsx`), so the avatar stack
 * and banners read as one family with them. The colors are the app's `--floating-bar` variables, which every canvas has.
 */

/** A bar floating over the canvas. */
export const floatingBar =
  "rounded-xl border bg-(--floating-bar) p-1 text-popover-foreground shadow-lg [--muted:var(--floating-bar-muted)] [--secondary:var(--floating-bar-secondary)]"

/** An etched line between a bar's groups. */
export function BarDivider() {
  return (
    <Separator
      orientation="vertical"
      className="-my-1 mx-1.5 border-x border-l-(--floating-bar-groove) border-r-(--floating-bar-highlight) bg-transparent data-vertical:w-0"
    />
  )
}

/** A group's label in a list, in gray, as the app's panels label theirs. */
export function GroupLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`text-xs font-medium text-muted-foreground ${className}`}>{children}</span>
}

/** The key that stops following or presenting, as the button beside it names it. */
export const stopKey = "Esc"
