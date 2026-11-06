/*
 * Stand-in tokens and a stand-in layer for the styling controls exploration: shadcn's neutral theme's colors, as hex,
 * and Tailwind's radius and blur scales.
 */

export interface ColorToken {
  name: string
  hex: string
}

export const colorTokens: ColorToken[] = [
  { name: "background", hex: "#ffffff" },
  { name: "foreground", hex: "#0a0a0a" },
  { name: "card", hex: "#ffffff" },
  { name: "primary", hex: "#171717" },
  { name: "primary-foreground", hex: "#fafafa" },
  { name: "secondary", hex: "#f5f5f5" },
  { name: "muted", hex: "#f5f5f5" },
  { name: "muted-foreground", hex: "#737373" },
  { name: "accent", hex: "#f5f5f5" },
  { name: "destructive", hex: "#e7000b" },
  { name: "border", hex: "#e5e5e5" },
  { name: "ring", hex: "#a1a1a1" },
  { name: "chart-1", hex: "#f54900" },
  { name: "chart-2", hex: "#009689" },
  { name: "chart-3", hex: "#104e64" },
  { name: "chart-4", hex: "#ffb900" },
  { name: "chart-5", hex: "#fe9a00" },
  // A few of the palette's shades, as a project with Tailwind's colors lists them after its semantic tokens.
  { name: "blue-500", hex: "#3b82f6" },
  { name: "blue-600", hex: "#2563eb" },
  { name: "teal-600", hex: "#0d9488" },
  { name: "orange-600", hex: "#ea580c" },
  { name: "amber-400", hex: "#fbbf24" }
]

/** A style's color as CSS: a token's color by its name, or a plain color (`#2563eb`, `oklch(…)`) as it's written. */
export const hexOf = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  if (/^#|^oklch\(/i.test(value)) return value
  return colorTokens.find((token) => token.name === value)?.hex
}

/** Colors the stand-in design already uses: the shapes behind Plans, and a plain blue a layer was given. */
export const usedColors = ["#f54900", "#009689", "#ffb900", "#2f6fed"]

export const radiusTokens = [
  { name: "radius-xs", px: 2 },
  { name: "radius-sm", px: 6 },
  { name: "radius-md", px: 8 },
  { name: "radius-lg", px: 10 },
  { name: "radius-xl", px: 14 },
  { name: "radius-2xl", px: 18 },
  { name: "radius-full", px: 9999 }
]

export const blurTokens = [
  { name: "blur-xs", px: 4 },
  { name: "blur-sm", px: 8 },
  { name: "blur-md", px: 12 },
  { name: "blur-lg", px: 16 },
  { name: "blur-xl", px: 24 },
  { name: "blur-2xl", px: 40 },
  { name: "blur-3xl", px: 64 }
]

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
  radius?: string | [string?, string?, string?, string?]
  border?: string
  borderAlpha?: number
  borderAllowed?: string
  /** One width, or each side from the top, clockwise. */
  borderWidth?: number | [number, number, number, number]
  blur?: string
  backdropBlur?: string
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

export const radiusPx = (name: string | undefined): number => radiusTokens.find((token) => token.name === name)?.px ?? 0

export const blurPx = (name: string | undefined): number => blurTokens.find((token) => token.name === name)?.px ?? 0
