import type { ReactNode } from "react"

/** Where the banner was, once following ends: why it ended, briefly, in the canvas's own colors. */
export function FollowEnded({ children }: { children: ReactNode }) {
  return (
    <output className="absolute top-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-popover px-2.5 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md">
      {children}
    </output>
  )
}
