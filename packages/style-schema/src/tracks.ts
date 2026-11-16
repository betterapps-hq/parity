import { type ReadFailure, readFailure } from "./read.ts"
import { remPx } from "./value.ts"

/*
 * A grid track's size as CSS sizes one, and its CSS both ways: a share of what's left (`fr`), pixels, a percentage of
 * the grid, sized by its content, or a range from a least length to a share.
 */

/** A grid track's size. */
export type TrackSize =
  | { kind: "fr"; value: number }
  | { kind: "px"; value: number }
  /** A share of the grid's own size. */
  | { kind: "percent"; value: number }
  | { kind: "auto" }
  /** `min-content` */
  | { kind: "min" }
  /** `max-content` */
  | { kind: "max" }
  /** At least `min` pixels, and at most `max` shares of what's left: CSS's `minmax(12rem, 1fr)`. */
  | { kind: "range"; min: number; max: number }

const contentCss = { auto: "auto", min: "min-content", max: "max-content" } as const

/** A content-sized track by the keyword CSS writes it with. */
const contentKinds = new Map<string, keyof typeof contentCss>([
  ["auto", "auto"],
  ["min-content", "min"],
  ["max-content", "max"]
])

/** A track as CSS. A share is `minmax(0, 1fr)`, as `grid-cols-N` writes it, so long content can't widen its column. */
export function trackSizeCss(track: TrackSize): string {
  if (track.kind === "fr") {
    return `minmax(0, ${track.value}fr)`
  }

  if (track.kind === "px") {
    return `${track.value}px`
  }

  if (track.kind === "percent") {
    return `${track.value}%`
  }

  if (track.kind === "range") {
    return `minmax(${track.min}px, ${track.max}fr)`
  }

  return contentCss[track.kind]
}

/** The least share a track takes, so a typed `0fr` still shows. */
const leastShare = 0.25

const number = String.raw`(\d*\.?\d+)`

/**
 * A track written as CSS: `2fr`, `200px` or a bare `200`, `12.5rem`, `50%`, `auto`, `min-content`, `max-content`, and a
 * range as `minmax(120px, 1fr)`. A share below a quarter is read as a quarter.
 */
export function readTrackSize(text: string): TrackSize | ReadFailure {
  const typed = text.trim().toLowerCase()
  const content = contentKinds.get(typed)

  if (content) {
    return { kind: content }
  }

  const match = (pattern: string) => new RegExp(`^${pattern}$`).exec(typed)
  const share = match(`${number}\\s*fr`)

  if (share) {
    return { kind: "fr", value: Math.max(leastShare, Number(share[1])) }
  }

  const percent = match(`${number}\\s*%`)

  if (percent) {
    return { kind: "percent", value: Number(percent[1]) }
  }

  const rem = match(`${number}\\s*rem`)

  if (rem) {
    return { kind: "px", value: Number(rem[1]) * remPx }
  }

  const pixels = match(`${number}\\s*(?:px)?`)

  if (pixels) {
    return { kind: "px", value: Number(pixels[1]) }
  }

  const range = match(`minmax\\(\\s*${number}\\s*(?:px)?\\s*,\\s*${number}\\s*fr\\s*\\)`)

  if (range) {
    return { kind: "range", min: Number(range[1]), max: Number(range[2]) }
  }

  return readFailure("unreadable", "Enter 1fr, 200px, auto or minmax(120px, 1fr)")
}
