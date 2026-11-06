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
  { name: "chart-5", hex: "#fe9a00" }
]

export const hexOf = (name: string | undefined): string | undefined =>
  colorTokens.find((token) => token.name === name)?.hex

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

const contentTracks = {
  auto: { label: "Hug", css: "auto" },
  min: { label: "Min", css: "min-content" },
  max: { label: "Max", css: "max-content" }
} as const

export const trackLabel = (track: Track): string => {
  if (track.kind === "fr") return `${track.value}fr`
  if (track.kind === "px") return `${track.value}px`
  return contentTracks[track.kind].label
}

export const trackCss = (track: Track): string => {
  if (track.kind === "fr") return `${track.value}fr`
  if (track.kind === "px") return `${track.value}px`
  return contentTracks[track.kind].css
}

/** A grid's columns: a list of tracks, or as many as fit, each at least `fit` pixels wide (CSS's auto-fit). */
export type Columns = Track[] | { fit: number }

/** How many tracks a grid child spans, or all of them (`1 / -1`). */
export type Span = number | "all"

/** A grid child's place on one axis, as CSS writes it: `start / span n`, or across every track. */
export function placementCss(start: number | undefined, span: Span | undefined): string {
  if (span === "all") return "1 / -1"
  return `${start ?? "auto"} / span ${span ?? 1}`
}

/** What the exploration's layer has: the proposed style fields, each beside the one it extends. */
export interface Draft {
  background?: string
  backgroundAlpha?: number
  /** One radius, or each corner from the top left, clockwise. */
  radius?: string | [string?, string?, string?, string?]
  border?: string
  borderAlpha?: number
  /** One width, or each side from the top, clockwise. */
  borderWidth?: number | [number, number, number, number]
  blur?: string
  backdropBlur?: string
  aspect?: string
  tag?: string
  direction?: "row" | "column"
  reverse?: boolean
  align?: "start" | "center" | "end" | "stretch" | "baseline"
  columns?: Columns
  rows?: Track[]
  /** The selected child's place in the grid: the line it starts at, from 1, or from the end when negative. */
  colStart?: number
  colSpan?: Span
  rowStart?: number
  rowSpan?: Span
}

export const radiusPx = (name: string | undefined): number => radiusTokens.find((token) => token.name === name)?.px ?? 0

export const blurPx = (name: string | undefined): number => blurTokens.find((token) => token.name === name)?.px ?? 0
