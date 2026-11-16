import { Button, Slider } from "@buildkitgg/shadcn"
import { Pause, Play } from "lucide-react"
import { useId } from "react"

interface PlaybackProps {
  running: boolean
  onRunning: (running: boolean) => void
  time: number
  loopMs: number
  onTime: (time: number) => void
}

/**
 * Play, pause and a scrubber for a story that moves, outside the design. Scrubbing pauses, so a moment can be held and
 * looked at.
 */
export function Playback({ running, onRunning, time, loopMs, onTime }: PlaybackProps) {
  const label = useId()

  return (
    <div className="flex items-center gap-3">
      <Button size="sm" variant="outline" onClick={() => onRunning(!running)}>
        {running ? <Pause /> : <Play />}
        {running ? "Pause" : "Play"}
      </Button>
      <span id={label} className="text-xs text-muted-foreground">
        Moment
      </span>
      <div className="w-56">
        <Slider
          aria-labelledby={label}
          min={0}
          max={loopMs}
          step={10}
          value={time % loopMs}
          onValueChange={(value) => {
            onRunning(false)
            onTime(Array.isArray(value) ? (value[0] ?? 0) : value)
          }}
        />
      </div>
    </div>
  )
}
