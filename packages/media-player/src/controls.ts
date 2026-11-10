/** What a key does to a player: play or pause, move through it, turn it up or down, mute it, or fill the screen. */
export type PlayerAction =
  | "toggle"
  | "back"
  | "forward"
  | "start"
  | "end"
  | "louder"
  | "quieter"
  | "mute"
  | "fullscreen"

/** How far the left and right arrows move a video, in seconds. */
const skipSeconds = 5

/** How far the up and down arrows turn its volume, out of 1. */
const volumeStep = 0.1

const actions = new Map<string, PlayerAction>([
  [" ", "toggle"],
  ["k", "toggle"],
  ["ArrowLeft", "back"],
  ["ArrowRight", "forward"],
  ["Home", "start"],
  ["End", "end"],
  ["ArrowUp", "louder"],
  ["ArrowDown", "quieter"],
  ["m", "mute"],
  ["f", "fullscreen"]
])

/**
 * What a key pressed in a player does, or nothing for a key it leaves alone. A key held with Ctrl, Alt or the Command
 * key is the app's, so Ctrl+F still finds.
 */
export function playerAction(key: { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean }) {
  if (key.ctrlKey || key.altKey || key.metaKey) {
    return undefined
  }

  return actions.get(key.key.length === 1 ? key.key.toLowerCase() : key.key)
}

/** Where a video lands after an action that moves it, kept within its length. */
export function seekTo(action: PlayerAction, time: number, duration: number): number | undefined {
  const within = (to: number) => Math.min(Math.max(to, 0), duration)

  switch (action) {
    case "back":
      return within(time - skipSeconds)
    case "forward":
      return within(time + skipSeconds)
    case "start":
      return 0
    case "end":
      return duration
    default:
      return undefined
  }
}

/**
 * Its volume after an action that turns it up or down, from 0 to 1, as a muted one is heard: turning a muted video up
 * starts from silence.
 */
export function volumeTo(action: PlayerAction, volume: number, muted: boolean): number | undefined {
  const heard = muted ? 0 : volume
  const within = (to: number) => Math.round(Math.min(Math.max(to, 0), 1) * 100) / 100

  if (action === "louder") {
    return within(heard + volumeStep)
  }

  return action === "quieter" ? within(heard - volumeStep) : undefined
}

/** A place in a video, or its length, as a clock reads it: "0:05", "1:05", "1:00:05". */
export function clockOf(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, "0")

  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`
}
