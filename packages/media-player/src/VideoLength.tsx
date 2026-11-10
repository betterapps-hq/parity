import { cn } from "@buildkitgg/shadcn-baseui-kit"
import { Play } from "lucide-react"
import { clockOf } from "./controls.ts"

interface VideoLengthProps {
  /** How long it runs, in seconds. */
  seconds: number
  /** How far it has played, in seconds, while its preview plays: the time left counts down from its length. */
  elapsed?: number
  className?: string
}

/**
 * How long a video runs, over the corner of its picture, with the mark that says it's one, so a preview of five seconds
 * and one of five minutes look different. While its preview plays it counts down the time left, whole second by whole
 * second from the length it showed, to 0:00. It sits in the bottom right of the nearest positioned box.
 */
export function VideoLength({ seconds, elapsed = 0, className }: VideoLengthProps) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-2xs font-medium text-white tabular-nums",
        className
      )}
    >
      <Play aria-hidden className="size-2.5 fill-current" />{" "}
      {clockOf(Math.max(0, Math.floor(seconds) - Math.floor(elapsed)))}
    </span>
  )
}
