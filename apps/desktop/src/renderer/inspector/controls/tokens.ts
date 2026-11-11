/*
 * The exploration's stand-in tokens, every kind in one place: shadcn's neutral theme's colors, as hex, and Tailwind
 * v4's radius, blur, shadow, text, leading, tracking and weight scales, with a few of the project's own (spacing,
 * stroke widths, layer order, durations, easings, gradients, opacities, cursors, containers, fonts). Each token is a
 * `FieldToken`, which a field's chip and list draw with `TokenMark`, plus what its kind's fields work with (`px`,
 * `hex`, `ms`, `layers`). Tokens made with Create token are added through React state (`useTokens` in
 * field-parts.tsx), never to these arrays, so one story's token doesn't leak into another.
 */
import type { PreviewKind } from "@parity-app/tokens"
import { formatNumber, gradientCss, isPlainColor, mixColor, shadowCss } from "./css-values.ts"
import { isLengthToken, type Length } from "./data.ts"
import type { GradientPaint, ShadowLayer } from "./lists-data.ts"
import { type Bezier, bezierCss, type Spring, springLinear } from "./motion-data.ts"

/** A token as a field offers it: drawn by its kind's preview from its value, with what it comes to in words. */
export interface FieldToken {
  /** Its name as CSS names it, without `--`: `radius-lg`, `primary`. */
  name: string
  /** Which of the Tokens panel's previews draws it. */
  kind: PreviewKind
  /** What the preview draws: a CSS value (`10px`, `#171717`, `0 1px 3px …`). */
  value: string
  /** What it comes to, as a field shows it faintly after the chip: `10px`, Full, `150ms`. */
  detail: string
  /** The token to use instead, when it's deprecated (DTCG's `$deprecated`). */
  deprecated?: string
}

/** A color token: its value is its hex. */
export interface ColorToken extends FieldToken {
  kind: "color"
  /** The same as `value`, which the color fields read their colors from. */
  hex: string
}

/**
 * A token a number field takes: what it comes to in the field's unit, pixels for lengths and widths, or a count for
 * layer order.
 */
export interface LengthToken extends FieldToken {
  px: number
}

/** A color token from its hex, as the stand-ins and Create token make them. */
export const colorToken = (name: string, hex: string, deprecated?: string): ColorToken => {
  const token: ColorToken = { name, kind: "color", value: hex, hex, detail: hex.slice(1).toUpperCase() }

  if (deprecated !== undefined) {
    token.deprecated = deprecated
  }

  return token
}

/** What a length comes to in words: `10px`, or Full for a radius that rounds the ends. */
export const lengthDetail = (px: number): string => (px === 9999 ? "Full" : `${formatNumber(px)}px`)

/** A length token of a kind (radius, blur, spacing), as the stand-ins and Create token make them. */
export const lengthToken = (kind: PreviewKind, name: string, px: number, deprecated?: string): LengthToken => {
  const token: LengthToken = { name, kind, value: `${px}px`, detail: lengthDetail(px), px }

  if (deprecated !== undefined) {
    token.deprecated = deprecated
  }

  return token
}

/** shadcn's neutral theme, a few of Tailwind's palette shades, black and white, and a color the project replaced. */
export const colorTokens: ColorToken[] = [
  colorToken("background", "#ffffff"),
  colorToken("foreground", "#0a0a0a"),
  colorToken("card", "#ffffff"),
  colorToken("primary", "#171717"),
  colorToken("primary-foreground", "#fafafa"),
  colorToken("secondary", "#f5f5f5"),
  colorToken("muted", "#f5f5f5"),
  colorToken("muted-foreground", "#737373"),
  colorToken("accent", "#f5f5f5"),
  colorToken("destructive", "#e7000b"),
  colorToken("border", "#e5e5e5"),
  colorToken("ring", "#a1a1a1"),
  colorToken("chart-1", "#f54900"),
  colorToken("chart-2", "#009689"),
  colorToken("chart-3", "#104e64"),
  colorToken("chart-4", "#ffb900"),
  colorToken("chart-5", "#fe9a00"),
  // A few of the palette's shades, as a project with Tailwind's colors lists them after its semantic tokens.
  colorToken("blue-500", "#3b82f6"),
  colorToken("blue-600", "#2563eb"),
  colorToken("teal-600", "#0d9488"),
  colorToken("orange-600", "#ea580c"),
  colorToken("amber-400", "#fbbf24"),
  // Tailwind's black and white, which its shadows are drawn in.
  colorToken("black", "#000000"),
  colorToken("white", "#ffffff"),
  // An old brand color the project has replaced, kept so layers still using it draw and say so.
  colorToken("brand-blue", "#1d4ed8", "blue-600")
]

/** A style's color as CSS draws it: a token's color by its name, or a plain color (`#2563eb`, `oklch(…)`) as written. */
export function hexOf(value: string | undefined, tokens: readonly ColorToken[] = colorTokens): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (isPlainColor(value)) {
    return value
  }

  return tokens.find((token) => token.name === value)?.hex
}

/** A color and its alpha from 0 to 100 as a preview draws them; transparent for a token the project doesn't have. */
export const drawnColor = (value: string, alpha?: number, tokens?: readonly ColorToken[]): string =>
  mixColor(hexOf(value, tokens) ?? "transparent", alpha)

export const radiusTokens: LengthToken[] = [
  lengthToken("radius", "radius-xs", 2),
  lengthToken("radius", "radius-sm", 6),
  lengthToken("radius", "radius-md", 8),
  lengthToken("radius", "radius-lg", 10),
  lengthToken("radius", "radius-xl", 14),
  lengthToken("radius", "radius-2xl", 18),
  lengthToken("radius", "radius-full", 9999),
  // An old card radius the project has replaced with radius-xl.
  lengthToken("radius", "radius-card", 12, "radius-xl")
]

/** Tailwind's blur scale, for Layer blur and Background blur alike. */
export const blurTokens: LengthToken[] = [
  lengthToken("blur", "blur-xs", 4),
  lengthToken("blur", "blur-sm", 8),
  lengthToken("blur", "blur-md", 12),
  lengthToken("blur", "blur-lg", 16),
  lengthToken("blur", "blur-xl", 24),
  lengthToken("blur", "blur-2xl", 40),
  lengthToken("blur", "blur-3xl", 64)
]

/** The project's spacing tokens, beside Tailwind's steps: `--spacing-gutter` writes `p-gutter`. */
export const spacingTokens: LengthToken[] = [
  lengthToken("spacing", "spacing-inset", 16),
  lengthToken("spacing", "spacing-gutter", 24),
  lengthToken("spacing", "spacing-section", 64),
  // An old card padding the project has replaced with spacing-gutter.
  lengthToken("spacing", "spacing-card", 20, "spacing-gutter")
]

export const borderWidthTokens: LengthToken[] = [
  lengthToken("border-width", "border-width-hairline", 1),
  lengthToken("border-width", "border-width-thick", 3)
]

const layer = (name: string, order: number): LengthToken => ({
  name,
  kind: "z-index",
  value: String(order),
  detail: String(order),
  px: order
})

/** Layer order's tokens, in the order they stack; `px` is the count. */
export const zIndexTokens: LengthToken[] = [
  layer("z-raised", 10),
  layer("z-dropdown", 20),
  layer("z-sticky", 30),
  layer("z-overlay", 40),
  layer("z-modal", 50),
  layer("z-toast", 60)
]

/** The project's container sizes, which a width's expression can name. */
export const containerTokens: LengthToken[] = [
  lengthToken("container", "container-sm", 384),
  lengthToken("container", "container-md", 448),
  lengthToken("container", "container-lg", 512)
]

/** Tailwind's breakpoints, the widths a design's frame is drawn at. */
export const breakpointTokens: LengthToken[] = [
  lengthToken("breakpoint", "breakpoint-sm", 640),
  lengthToken("breakpoint", "breakpoint-md", 768),
  lengthToken("breakpoint", "breakpoint-lg", 1024),
  lengthToken("breakpoint", "breakpoint-xl", 1280),
  lengthToken("breakpoint", "breakpoint-2xl", 1536)
]

/* Motion */

export interface DurationToken extends FieldToken {
  kind: "duration"
  ms: number
}

/** A duration token, as the stand-ins and Create token make them. */
export const durationToken = (name: string, ms: number): DurationToken => ({
  name,
  kind: "duration",
  value: `${ms}ms`,
  detail: `${ms}ms`,
  ms
})

/** A project's duration tokens; a project without them leaves every whole millisecond unmarked. */
export const durationTokens: DurationToken[] = [
  durationToken("duration-fast", 150),
  durationToken("duration-normal", 250),
  durationToken("duration-slow", 400)
]

export interface EasingToken extends FieldToken {
  kind: "easing"
  curve?: Bezier
  spring?: Spring
}

/**
 * An easing token from its curve, or a spring's settings, as the stand-ins and Create token make them. A spring's
 * value is the `linear()` it's written as, so its preview draws the spring's curve.
 */
export function easingToken(name: string, curve?: Bezier, spring?: Spring): EasingToken {
  let detail = ""
  let value = "linear"

  if (curve) {
    detail = curve.join(", ")
    value = bezierCss(curve)
  } else if (spring) {
    detail = "Spring"
    value = springLinear(spring)
  }

  const token: EasingToken = { name, kind: "easing", value, detail }

  if (curve) {
    token.curve = curve
  }

  if (spring) {
    token.spring = spring
  }

  return token
}

/** The project's easing tokens. */
export const easingTokens: EasingToken[] = [
  easingToken("ease-snappy", [0.2, 0.8, 0.2, 1]),
  easingToken("ease-gentle", [0.33, 0, 0.15, 1])
]

/* Shadows and gradients */

export interface ShadowToken extends FieldToken {
  layers: ShadowLayer[]
}

/** Tailwind's shadow color: black at the token's alpha. */
const part = (x: number, y: number, blur: number, spread: number, alpha: number): ShadowLayer => ({
  x,
  y,
  blur,
  spread,
  color: "black",
  alpha
})

/** A shadow token of a kind (shadow, inset, drop, text) from its layers, as the stand-ins and Create token make them. */
export const shadowToken = (kind: PreviewKind, name: string, layers: ShadowLayer[]): ShadowToken => {
  const spread = kind !== "text-shadow" && kind !== "drop-shadow"

  // Each number with its unit, as lists-data.ts's layerNumbers writes them; a drop or text shadow has no spread.
  const numbers = (one: ShadowLayer) =>
    [one.x, one.y, one.blur, ...(spread ? [one.spread] : [])]
      .map((value) => `${formatNumber(value).replace("-", "−")}px`)
      .join(" ")

  return {
    name,
    kind,
    value: shadowCss(layers, (one) => drawnColor(one.color, one.alpha), { spread }),
    detail: layers.length === 1 ? numbers(layers[0]!) : `${layers.length} layers`,
    layers
  }
}

export const shadowTokens: ShadowToken[] = [
  shadowToken("shadow", "shadow-2xs", [part(0, 1, 0, 0, 5)]),
  shadowToken("shadow", "shadow-xs", [part(0, 1, 2, 0, 5)]),
  shadowToken("shadow", "shadow-sm", [part(0, 1, 3, 0, 10), part(0, 1, 2, -1, 10)]),
  shadowToken("shadow", "shadow-md", [part(0, 4, 6, -1, 10), part(0, 2, 4, -2, 10)]),
  shadowToken("shadow", "shadow-lg", [part(0, 10, 15, -3, 10), part(0, 4, 6, -4, 10)]),
  shadowToken("shadow", "shadow-xl", [part(0, 20, 25, -5, 10), part(0, 8, 10, -6, 10)]),
  shadowToken("shadow", "shadow-2xl", [part(0, 25, 50, -12, 25)])
]

export const insetShadowTokens: ShadowToken[] = [
  shadowToken("inset-shadow", "inset-shadow-2xs", [part(0, 1, 0, 0, 5)]),
  shadowToken("inset-shadow", "inset-shadow-xs", [part(0, 1, 1, 0, 5)]),
  shadowToken("inset-shadow", "inset-shadow-sm", [part(0, 2, 4, 0, 5)])
]

export const dropShadowTokens: ShadowToken[] = [
  shadowToken("drop-shadow", "drop-shadow-xs", [part(0, 1, 1, 0, 5)]),
  shadowToken("drop-shadow", "drop-shadow-sm", [part(0, 1, 2, 0, 15)]),
  shadowToken("drop-shadow", "drop-shadow-md", [part(0, 3, 3, 0, 12)]),
  shadowToken("drop-shadow", "drop-shadow-lg", [part(0, 4, 4, 0, 15)]),
  shadowToken("drop-shadow", "drop-shadow-xl", [part(0, 9, 7, 0, 10)]),
  shadowToken("drop-shadow", "drop-shadow-2xl", [part(0, 25, 25, 0, 15)])
]

export const textShadowTokens: ShadowToken[] = [
  shadowToken("text-shadow", "text-shadow-2xs", [part(0, 1, 0, 0, 15)]),
  shadowToken("text-shadow", "text-shadow-xs", [part(0, 1, 1, 0, 20)]),
  shadowToken("text-shadow", "text-shadow-sm", [part(0, 1, 0, 0, 7.5), part(0, 1, 1, 0, 7.5), part(0, 2, 2, 0, 7.5)]),
  shadowToken("text-shadow", "text-shadow-md", [part(0, 1, 1, 0, 10), part(0, 1, 2, 0, 10), part(0, 2, 4, 0, 10)]),
  shadowToken("text-shadow", "text-shadow-lg", [part(0, 1, 2, 0, 10), part(0, 3, 2, 0, 10), part(0, 4, 8, 0, 10)])
]

export const allShadowTokens: ShadowToken[] = [
  ...shadowTokens,
  ...insetShadowTokens,
  ...dropShadowTokens,
  ...textShadowTokens
]

export interface GradientToken extends FieldToken {
  kind: "gradient"
  paint: Omit<GradientPaint, "token">
}

/** A gradient token from its paint, as the stand-ins and Create token make them. */
export const gradientToken = (name: string, paint: Omit<GradientPaint, "token">): GradientToken => ({
  name,
  kind: "gradient",
  value: gradientCss(paint, (stop) => drawnColor(stop.color, stop.alpha)),
  detail: `${paint.kind === "linear" ? "Linear" : "Gradient"} ${paint.angle}°`,
  paint
})

export const gradientTokens: GradientToken[] = [
  gradientToken("gradient-brand", {
    kind: "linear",
    angle: 90,
    stops: [
      { id: "brand-1", position: 0, color: "blue-500" },
      { id: "brand-2", position: 100, color: "teal-600" }
    ]
  }),
  gradientToken("gradient-sunset", {
    kind: "linear",
    angle: 135,
    stops: [
      { id: "sunset-1", position: 0, color: "chart-4" },
      { id: "sunset-2", position: 50, color: "chart-5" },
      { id: "sunset-3", position: 100, color: "chart-1" }
    ]
  })
]

/* Text */

/** A font token: its value is the stack, which its preview draws Ag in. */
export interface FontToken extends FieldToken {
  kind: "font"
  /** The whole stack, as CSS writes it. */
  stack: string
}

/** A font token from its family's name and its stack, as the stand-ins and Create token make them. */
export const fontToken = (name: string, family: string, stack: string): FontToken => ({
  name,
  kind: "font",
  value: stack,
  detail: family,
  stack
})

/** The project's font tokens: Geist, as the app's own sans, and three more (`sans` is `--font-sans`). */
export const fontTokens: FontToken[] = [
  fontToken("sans", "Geist", '"Geist Variable", sans-serif'),
  fontToken("serif", "Georgia", "Georgia, serif"),
  fontToken("mono", "Consolas", "Consolas, monospace"),
  fontToken("brand", "Trebuchet MS", '"Trebuchet MS", sans-serif')
]

export interface WeightToken extends FieldToken {
  kind: "font-weight"
  weight: number
  /** Its name in words: Semibold. */
  label: string
}

/** A font-weight token, as the stand-ins and Create token make them. */
export const weightToken = (name: string, number: number, label: string): WeightToken => ({
  name,
  kind: "font-weight",
  value: String(number),
  detail: String(number),
  weight: number,
  label
})

/** Tailwind's font-weight tokens, which name each hundred. */
export const weightTokens: WeightToken[] = [
  weightToken("thin", 100, "Thin"),
  weightToken("extralight", 200, "Extra light"),
  weightToken("light", 300, "Light"),
  weightToken("normal", 400, "Regular"),
  weightToken("medium", 500, "Medium"),
  weightToken("semibold", 600, "Semibold"),
  weightToken("bold", 700, "Bold"),
  weightToken("extrabold", 800, "Extra bold"),
  weightToken("black", 900, "Black")
]

export interface SizeToken extends FieldToken {
  kind: "font-size"
  px: number
  /** The line height it pairs, in pixels. */
  lineHeight: number
  /** Pairs a weight and letter spacing too, so a line height beside it is its own class. */
  pairsMore?: true
}

const size = (name: string, px: number, lineHeight: number): SizeToken => ({
  name,
  kind: "font-size",
  value: `${px}px`,
  detail: `${px}px`,
  px,
  lineHeight
})

/** Tailwind v4's text sizes, each with the line height it pairs; `display` is the project's, pairing more. */
export const sizeTokens: SizeToken[] = [
  size("xs", 12, 16),
  size("sm", 14, 20),
  size("base", 16, 24),
  size("lg", 18, 28),
  size("xl", 20, 28),
  // A project size that pairs a weight and letter spacing too, so a line height beside it is its own class.
  { ...size("display", 36, 40), pairsMore: true }
]

export interface LeadingToken extends FieldToken {
  kind: "leading"
  /** The line height as a multiple of the font size. */
  multiple: number
}

/** A leading token from its multiple, as the stand-ins and Create token make them. */
export const leadingToken = (name: string, multiple: number): LeadingToken => ({
  name,
  kind: "leading",
  value: String(multiple),
  detail: `${formatNumber(multiple)}×`,
  multiple
})

/** Tailwind v4's leading tokens, as multiples. */
export const leadingTokens: LeadingToken[] = [
  leadingToken("none", 1),
  leadingToken("tight", 1.25),
  leadingToken("snug", 1.375),
  leadingToken("normal", 1.5),
  leadingToken("relaxed", 1.625),
  leadingToken("loose", 2)
]

export interface TrackingToken extends FieldToken {
  kind: "tracking"
  em: number
}

/** A tracking token from its em, as the stand-ins and Create token make them. */
export const trackingToken = (name: string, em: number): TrackingToken => ({
  name,
  kind: "tracking",
  value: `${em}em`,
  detail: `${em}em`,
  em
})

/** Tailwind v4's tracking tokens, in em. */
export const trackingTokens: TrackingToken[] = [
  trackingToken("tighter", -0.05),
  trackingToken("tight", -0.025),
  trackingToken("normal", 0),
  trackingToken("wide", 0.025),
  trackingToken("wider", 0.05),
  trackingToken("widest", 0.1)
]

export interface OpacityToken extends FieldToken {
  kind: "opacity"
  percent: number
}

/** An opacity token from its percentage, as the stand-ins and Create token make them. */
export const opacityToken = (name: string, percent: number): OpacityToken => ({
  name,
  kind: "opacity",
  value: String(percent / 100),
  detail: `${percent}%`,
  percent
})

/** The project's opacity tokens. */
export const opacityTokens: OpacityToken[] = [opacityToken("disabled", 50), opacityToken("muted", 70)]

/* Interaction */

const cursor = (name: string, value: string): FieldToken => ({ name, kind: "cursor", value, detail: value })

/** The project's cursor tokens and the cursors they hold. */
export const cursorTokens: FieldToken[] = [cursor("cursor-interactive", "pointer"), cursor("cursor-busy", "progress")]

/**
 * The length tokens an expression can name, in pixels: Tailwind's spacing step, the containers, two text sizes and a
 * radius, by the custom property's name without `--`.
 */
export const lengthVars = Object.fromEntries([
  ["spacing", 4],
  ...containerTokens.map((token) => [token.name, token.px] as const),
  ...sizeTokens.flatMap((token) =>
    ["base", "xl"].includes(token.name) ? [[`text-${token.name}`, token.px] as const] : []
  ),
  ...radiusTokens.flatMap((token) => (token.name === "radius-lg" ? [[token.name, token.px] as const] : []))
])

/** A length in pixels: its own, or its token's; 0 for unset or a token the project doesn't have. */
export const lengthPx = (value: Length | undefined, tokens: readonly LengthToken[]): number => {
  if (value === undefined) {
    return 0
  }

  if (!isLengthToken(value)) {
    return value.px
  }

  return tokens.find((token) => token.name === value)?.px ?? 0
}

/**
 * Every set a field offers tokens from, by name, so `useTokens` can hold what Create token adds to each and phase B's
 * fields find theirs the same way.
 */
export const tokenSets = {
  color: colorTokens,
  radius: radiusTokens,
  blur: blurTokens,
  spacing: spacingTokens,
  borderWidth: borderWidthTokens,
  zIndex: zIndexTokens,
  container: containerTokens,
  breakpoint: breakpointTokens,
  duration: durationTokens,
  easing: easingTokens,
  shadow: shadowTokens,
  insetShadow: insetShadowTokens,
  dropShadow: dropShadowTokens,
  textShadow: textShadowTokens,
  gradient: gradientTokens,
  weight: weightTokens,
  size: sizeTokens,
  leading: leadingTokens,
  tracking: trackingTokens,
  opacity: opacityTokens,
  cursor: cursorTokens,
  font: fontTokens
}

export type TokenSets = typeof tokenSets

export type TokenSetName = keyof TokenSets
