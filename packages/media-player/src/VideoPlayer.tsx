/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/media-has-caption -- a player is a group of controls named by its video, which a fieldset, being for a form's fields, isn't; it takes keys for the controls inside it, as a video's own controls do; and neither stock nor project videos come with captions to give it */
import { Button, cn, Kbd, Slider, Tooltip, TooltipContent, TooltipTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { Maximize, Minimize, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react"
import { type KeyboardEvent, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react"
import { clockOf, playerAction, seekTo, volumeTo } from "./controls.ts"

interface VideoPlayerProps {
  src: string
  /** What shows until the video's first picture has loaded. */
  poster?: string
  /** What the video is, which names the player for a screen reader. */
  label: string
  /** `sm` for a card: smaller controls, under a video as wide as the card. */
  size?: "default" | "sm"
  className?: string
}

/**
 * A video with its controls under it: play or pause, a scrubber to move through it, where it is in its length, its
 * volume and full screen. It plays, without sound, as it opens, and goes round at the end. Inside it Space or K plays
 * and pauses, left and right move five seconds, Home and End go to either end, up and down turn it up or down, M mutes
 * and F fills the screen. Clicking the video plays or pauses it, and double-clicking fills the screen.
 */
export function VideoPlayer({ src, poster, label, size = "default", className }: VideoPlayerProps) {
  const root = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [volume, setVolume] = useState(1)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const fullscreen = useFullscreen(root)
  const position = useId()
  const small = size === "sm"

  usePlayingTime(video, playing, setTime)

  // It starts without sound, as a browser lets a video play by itself only when it's muted.
  useEffect(() => {
    const element = video.current

    if (element) {
      element.muted = true
      void element.play().catch(() => undefined)
    }
  }, [src])

  const toggle = () => {
    const element = video.current

    if (element?.paused) {
      void element.play().catch(() => undefined)
    } else {
      element?.pause()
    }
  }

  const seek = (to: number) => {
    if (video.current) {
      video.current.currentTime = to
      setTime(to)
    }
  }

  // Unmuting a video turned all the way down brings it back to half, so it's heard.
  const toggleMuted = () => {
    const element = video.current

    if (element) {
      element.muted = !element.muted

      if (!element.muted && element.volume === 0) {
        element.volume = 0.5
      }
    }
  }

  const turnTo = (to: number) => {
    if (video.current) {
      video.current.volume = to
      video.current.muted = to === 0
    }
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void root.current?.requestFullscreen()
    }
  }

  // Caught on the way in, so the scrubber's own arrows move as far as the player's, and a key the player takes goes no
  // further: the arrows don't also step through what's around it. The volume's slider keeps its own arrows, Home and
  // End, which turn it rather than move the video.
  const onKeyDownCapture = (event: KeyboardEvent) => {
    const action = playerAction(event)

    if (!action || (inVolume(event) && action !== "toggle" && action !== "mute" && action !== "fullscreen")) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const to = seekTo(action, video.current?.currentTime ?? time, duration)
    const turned = volumeTo(action, volume, muted)

    if (to !== undefined) {
      seek(to)
    } else if (turned !== undefined) {
      turnTo(turned)
    } else if (action === "toggle") {
      toggle()
    } else if (action === "mute") {
      toggleMuted()
    } else if (action === "fullscreen") {
      toggleFullscreen()
    }
  }

  return (
    <div
      ref={root}
      role="group"
      aria-label={label}
      // Clicking the video puts the keys on the player.
      tabIndex={-1}
      onKeyDownCapture={onKeyDownCapture}
      // What the volume's slider took goes no further either.
      onKeyDown={(event) => playerAction(event) && event.stopPropagation()}
      className={cn(
        "flex min-h-0 min-w-0 flex-col items-center outline-none",
        small ? "gap-1" : "gap-3",
        fullscreen && "dark bg-background p-4 text-foreground",
        className
      )}
    >
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <video
          ref={video}
          src={src}
          poster={poster}
          loop
          playsInline
          onClick={toggle}
          onDoubleClick={toggleFullscreen}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          onVolumeChange={(event) => {
            setMuted(event.currentTarget.muted)
            setVolume(event.currentTarget.volume)
          }}
          className={cn("min-h-0 cursor-pointer", videoSize(fullscreen, small))}
        />
      </div>
      <div className={cn("flex w-full shrink-0 items-center", small ? "gap-1.5" : "gap-3")}>
        <PlayerButton label={playing ? "Pause" : "Play"} shortcut="Space" small={small} onClick={toggle}>
          {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
        </PlayerButton>
        <span id={position} hidden>
          Position in the video
        </span>
        <Slider
          aria-labelledby={position}
          min={0}
          max={duration || 1}
          step={0.1}
          value={[time]}
          disabled={!duration}
          // A screen reader says where it is in seconds: "7 seconds".
          format={{ style: "unit", unit: "second", unitDisplay: "long", maximumFractionDigits: 0 }}
          onValueChange={(next) => seek(Array.isArray(next) ? (next[0] ?? 0) : next)}
          className="mx-1 flex-1"
        />
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {clockOf(time)} / {clockOf(duration)}
        </span>
        <Volume volume={muted ? 0 : volume} small={small} onMute={toggleMuted} onChange={turnTo} />
        <PlayerButton
          label={fullscreen ? "Exit full screen" : "Full screen"}
          shortcut="F"
          small={small}
          onClick={toggleFullscreen}
        >
          {fullscreen ? <Minimize /> : <Maximize />}
        </PlayerButton>
      </div>
    </div>
  )
}

/** Whether a key was pressed in the volume's controls. */
function inVolume(event: KeyboardEvent): boolean {
  return event.target instanceof Element && !!event.target.closest("[data-volume]")
}

/** The video's size and frame: the whole screen, as wide as a card, or as large as the space allows. */
function videoSize(fullscreen: boolean, small: boolean): string {
  if (fullscreen) {
    return "size-full object-contain"
  }

  return small
    ? "max-h-57 w-full rounded-md bg-muted object-contain"
    : "max-h-full max-w-full rounded-lg border shadow-md"
}

interface VolumeProps {
  /** How loud it's heard, from 0 to 1: 0 when it's muted. */
  volume: number
  small: boolean
  onMute: () => void
  onChange: (volume: number) => void
}

/**
 * Mute, with the volume's slider standing over it while it's pointed at or the keyboard has brought focus into the
 * slider, so the scrubber keeps the row. A click in the slider doesn't hold it open once the pointer leaves, and Escape
 * puts it away, back to Mute, without moving the pointer. It opens inside the player rather than over the page, so it
 * shows in full screen too.
 */
function Volume({ volume, small, onMute, onChange }: VolumeProps) {
  const label = useId()
  const mute = useRef<HTMLButtonElement>(null)
  const group = useRef<HTMLDivElement>(null)
  const stand = useRef<HTMLDivElement>(null)
  // Whether the keyboard brought focus into the slider, or is using it, rather than a click.
  const [keyboard, setKeyboard] = useState(false)
  // Whether the pointer was last to act in the slider, rather than a key.
  const pressing = useRef(false)
  // Put away with Escape while pointed at, until the pointer leaves.
  const [dismissed, setDismissed] = useState(false)

  // Focus that follows a key, such as Tab, came from the keyboard, until the next press in the slider. Leaving takes
  // back an Escape. Both are the browser's own events: the slider holds the pointer while it's pressed, and React's
  // stand-ins for entering and leaving can miss the leaving that follows.
  useEffect(() => {
    const element = group.current

    const onKey = () => {
      pressing.current = false
    }

    const onLeave = () => setDismissed(false)

    document.addEventListener("keydown", onKey, true)
    element?.addEventListener("mouseleave", onLeave)

    return () => {
      document.removeEventListener("keydown", onKey, true)
      element?.removeEventListener("mouseleave", onLeave)
    }
  }, [])

  const onKeyDown = (event: KeyboardEvent) => {
    const focused = !!stand.current?.contains(document.activeElement)

    if (event.key === "Escape" && (focused || (!dismissed && !!group.current?.matches(":hover")))) {
      // Only the slider is put away, not what the player is in.
      event.stopPropagation()
      setDismissed(!!group.current?.matches(":hover"))
      setKeyboard(false)

      if (focused) {
        mute.current?.focus()
      }
    } else if (focused) {
      setKeyboard(true)
    }
  }

  return (
    <div
      data-volume
      ref={group}
      role="group"
      // Caught on the way in, as the slider keeps the keys it uses to itself.
      onKeyDownCapture={onKeyDown}
      className="group/volume relative shrink-0"
    >
      <Button
        ref={mute}
        variant="ghost"
        size={small ? "icon-sm" : "icon"}
        aria-label={volume === 0 ? "Unmute" : "Mute"}
        onClick={onMute}
      >
        <VolumeIcon volume={volume} />
      </Button>
      {/* Padded rather than spaced from the button, so the pointer stays over it on the way up. */}
      <div
        ref={stand}
        // Caught on the way in, before the slider moves focus to its thumb, which it does as the press ends.
        onPointerDownCapture={() => {
          pressing.current = true
        }}
        // Focus the window gives back as it comes to the front comes from nowhere in the page, and isn't the keyboard's.
        onFocus={(event) => setKeyboard(!pressing.current && !!event.relatedTarget)}
        onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setKeyboard(false)}
        className={cn(
          "absolute bottom-full left-1/2 z-10 -translate-x-1/2 pb-1 transition-opacity",
          keyboard ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          !dismissed && "group-hover/volume:pointer-events-auto group-hover/volume:opacity-100"
        )}
      >
        <div className="rounded-lg bg-popover px-2 py-3 text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <span id={label} hidden>
            Volume
          </span>
          <Slider
            orientation="vertical"
            aria-labelledby={label}
            min={0}
            max={1}
            step={0.05}
            value={[volume]}
            format={{ style: "percent" }}
            onValueChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? 0) : next)}
            className="data-vertical:h-24 [&_[data-base-ui-slider-control]]:min-h-0"
          />
        </div>
      </div>
    </div>
  )
}

/** Mute's icon, crossed out when it's silent and with fewer waves when it's quiet. */
function VolumeIcon({ volume }: { volume: number }) {
  if (volume === 0) {
    return <VolumeX />
  }

  return volume < 0.5 ? <Volume1 /> : <Volume2 />
}

interface PlayerButtonProps {
  label: string
  shortcut: string
  small: boolean
  onClick: () => void
  children: ReactNode
}

/** One of the player's buttons, its name and key in its tooltip. */
function PlayerButton({ label, shortcut, small, onClick, children }: PlayerButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size={small ? "icon-sm" : "icon"} aria-label={label} onClick={onClick}>
            {children}
          </Button>
        }
      />
      <TooltipContent>
        {label} <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

/** Whether the player fills the screen, which Escape can end without it. */
function useFullscreen(root: RefObject<HTMLElement | null>): boolean {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setFullscreen(!!root.current && document.fullscreenElement === root.current)
    document.addEventListener("fullscreenchange", onChange)

    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [root])

  return fullscreen
}

/**
 * Keeps up with where a playing video is every frame, so the scrubber moves smoothly rather than in the steps the
 * video's own updates come in.
 */
function usePlayingTime(
  video: RefObject<HTMLVideoElement | null>,
  playing: boolean,
  setTime: (time: number) => void
): void {
  useEffect(() => {
    if (!playing) {
      return undefined
    }

    let frame = 0

    const tick = () => {
      setTime(video.current?.currentTime ?? 0)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [video, playing, setTime])
}
