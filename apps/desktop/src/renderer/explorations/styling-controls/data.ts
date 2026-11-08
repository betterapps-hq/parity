/*
 * The stand-in layer for the styling controls exploration: the proposed style fields it has, and the colors the
 * stand-in design already uses. Its tokens are in tokens.ts.
 */

/** Colors the stand-in design already uses: the shapes behind Plans, and a plain blue a layer was given. */
export const usedColors = ["#f54900", "#009689", "#ffb900", "#2f6fed"]

/** A grid track: a share of what's left (`fr`), a fixed length in pixels, or sized by its content. */
export type Track =
  | { kind: "fr"; value: number }
  | { kind: "px"; value: number }
  | { kind: "auto" }
  | { kind: "min" }
  | { kind: "max" }
  /** At least `min` pixels, and at most `max` shares of what's left: CSS's `minmax(12rem, 1fr)`. */
  | { kind: "range"; min: number; max: number }

const contentTracks = {
  auto: { label: "Hug", css: "auto" },
  min: { label: "Min", css: "min-content" },
  max: { label: "Max", css: "max-content" }
} as const

/** Fill, or Fill ×2 for a larger share, in words as Size's Fill is. */
const fillLabel = (share: number) => (share === 1 ? "Fill" : `Fill ×${share}`)

/** A track in words where a size mode fits: Fill, Fill ×2, Hug, 200 (pixels), 120–Fill for a range. */
export const trackLabel = (track: Track): string => {
  if (track.kind === "fr") return fillLabel(track.value)
  if (track.kind === "px") return String(track.value)
  if (track.kind === "range") return `${track.min}–${fillLabel(track.max)}`
  return contentTracks[track.kind].label
}

/** A Fill track is `minmax(0, 1fr)`, as `grid-cols-N` writes it, so long content can't widen its column. */
export const trackCss = (track: Track): string => {
  if (track.kind === "fr") return `minmax(0, ${track.value}fr)`
  if (track.kind === "px") return `${track.value}px`
  if (track.kind === "range") return `minmax(${track.min}px, ${track.max}fr)`
  return contentTracks[track.kind].css
}

/** A grid's columns: a list of tracks, or as many as fit, each at least `fit` pixels wide (CSS's auto-fit). */
export type Columns = Track[] | { fit: number }

/** How many tracks a grid child spans, or all of them (`1 / -1`). */
export type Span = number | "all"

/**
 * A grid child's place on one axis, as CSS writes it: `start / span n`, `start / end` once it's placed by its end line,
 * or across every track.
 */
export function placementCss(start: number | undefined, span: Span | undefined, end?: number): string {
  if (span === "all") return "1 / -1"
  if (end !== undefined) return `${start ?? "auto"} / ${end}`
  return `${start ?? "auto"} / span ${span ?? 1}`
}

/**
 * A width or height: pixels (Fixed), a percentage of the parent, or a size mode: Hug, Fill, or Min content and Max
 * content from More units.
 */
export type Size = number | { percent: number } | "hug" | "fill" | "min" | "max"

/** A size as CSS writes it outside a layout: Fill is `100%` and Hug `fit-content`. */
export function sizeCss(size: Size | undefined): string | undefined {
  if (size === undefined) return undefined
  if (typeof size === "number") return `${size}px`
  if (typeof size === "object") return `${size.percent}%`
  return { hug: "fit-content", fill: "100%", min: "min-content", max: "max-content" }[size]
}

/** Where a grid child sits in its cell on one axis; unset follows the grid's alignment. */
export type SelfAlign = "start" | "center" | "end" | "stretch"

/** What the exploration's layer has: the proposed style fields, each beside the one it extends. */
export interface Draft {
  /** A color token's name, or a plain color as typed (`#2f6fed`, `oklch(…)`). */
  background?: string
  backgroundAlpha?: number
  /** Why a plain fill is allowed here as an exception to the token system, kept with the value (`allow`). */
  backgroundAllowed?: string
  /** One radius, or each corner from the top left, clockwise. */
  radius?: Length | [Length?, Length?, Length?, Length?]
  border?: string
  borderAlpha?: number
  borderAllowed?: string
  /** One width, or each side from the top, clockwise. */
  borderWidth?: number | [number, number, number, number]
  /** Whether the stroke counts in layout, as a border (on for a new stroke, call 2), or is drawn as an outline. */
  strokeInLayout?: boolean
  /** Where an outline is drawn against the edge: inside, centered on it, or outside. */
  strokePosition?: "inside" | "center" | "outside"
  /** The corners' shape (`corner-shape`), which only Chromium draws; others draw round corners. */
  cornerShape?: string
  blur?: Length
  backdropBlur?: Length
  aspect?: string
  tag?: string
  direction?: "row" | "column"
  wrap?: boolean
  reverse?: boolean
  /** Where children sit along the layout's direction, physically: start is the top of a column, the left of a row. */
  justify?: "start" | "center" | "end"
  /** Where they sit across it; baseline lines up their text's first line, last baseline its last. */
  align?: "start" | "center" | "end" | "stretch" | "baseline" | "last baseline"
  /** The layer's own size; unset width is 520 pixels, and unset height hugs. */
  width?: Size
  height?: Size
  /** Limits on the size in pixels, each its own row once added from the field's menu. */
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  columns?: Columns
  rows?: Track[]
  /** The selected grid child's own size; unset, it fills its cell. */
  childWidth?: Size
  childHeight?: Size
  /** The selected child's place in the grid: the line it starts at, from 1, or from the end when negative. */
  colStart?: number
  colSpan?: Span
  rowStart?: number
  rowSpan?: Span
  /** Placed by its end lines rather than a span, from Size's More. */
  endLines?: boolean
  colEnd?: number
  rowEnd?: number
  /** Where the grid child sits in its cell, down (Align self) and across (Justify self). */
  alignSelf?: SelfAlign
  justifySelf?: SelfAlign
}

/**
 * A length a field holds: a token's name, or a value of its own in pixels, as every field takes one (call 1), with why
 * it's allowed here when it is (`{ value, allow }` in PAR-652's value forms).
 */
export type Length = string | { px: number; allow?: string }
