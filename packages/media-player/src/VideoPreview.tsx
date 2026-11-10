import { cn } from "@buildkitgg/shadcn-baseui-kit"
import { useState } from "react"

interface VideoPreviewProps {
  src: string
  /** Called as it plays with where it is, in seconds, for the time left to count down beside it. */
  onTime?: (seconds: number) => void
  className?: string
}

/**
 * A video playing without sound or controls, going round at the end, as a list shows one while it's pointed at. It
 * fades in once it's playing, so the picture under it shows until then rather than a blank frame.
 */
export function VideoPreview({ src, onTime, className }: VideoPreviewProps) {
  const [started, setStarted] = useState(false)

  return (
    <video
      src={src}
      muted
      autoPlay
      loop
      playsInline
      aria-hidden
      onPlaying={() => setStarted(true)}
      onTimeUpdate={(event) => onTime?.(event.currentTarget.currentTime)}
      className={cn("transition-opacity duration-150", started ? "opacity-100" : "opacity-0", className)}
    />
  )
}
