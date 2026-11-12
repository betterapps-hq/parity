/*
 * Tokens as the Design tab's fields offer them: each a `FieldToken`, which a field's chip and list draw with
 * `TokenMark`, plus what its kind's fields work with (`px`, `hex`, `ms`, `layers`), and the sets a panel is given
 * (`TokenSets`). The project's own come from `projectTokenSets` (inspector/token-sets.ts); the stories' stand-ins are in
 * stand-in-tokens.ts, which nothing in the live panel imports.
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

/**
 * A color token from its color, as the project's, the stand-ins and Create token make them: a hex's detail is its
 * digits (`171717`), and any other color's is the color as written (`oklch(0.97 0 0)`).
 */
export const colorToken = (name: string, hex: string, deprecated?: string): ColorToken => {
  const detail = hex.startsWith("#") ? hex.slice(1).toUpperCase() : hex
  const token: ColorToken = { name, kind: "color", value: hex, hex, detail }

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

/** A style's color as CSS draws it: a token's color by its name, or a plain color (`#2563eb`, `oklch(…)`) as written. */
export function hexOf(value: string | undefined, tokens: readonly ColorToken[]): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (isPlainColor(value)) {
    return value
  }

  return tokens.find((token) => token.name === value)?.hex
}

/** A color and its alpha from 0 to 100 as a preview draws them; transparent for a token the project doesn't have. */
export const drawnColor = (value: string, alpha: number | undefined, tokens: readonly ColorToken[]): string =>
  mixColor(hexOf(value, tokens) ?? "transparent", alpha)

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

/* Shadows and gradients */

export interface ShadowToken extends FieldToken {
  layers: ShadowLayer[]
}

/**
 * A shadow token of a kind (shadow, inset, drop, text) from its layers, as the stand-ins and Create token make them,
 * its colors named by the project's `colors`.
 */
export const shadowToken = (
  kind: PreviewKind,
  name: string,
  layers: ShadowLayer[],
  colors: readonly ColorToken[]
): ShadowToken => {
  const spread = kind !== "text-shadow" && kind !== "drop-shadow"

  // Each number with its unit, as lists-data.ts's layerNumbers writes them; a drop or text shadow has no spread.
  const numbers = (one: ShadowLayer) =>
    [one.x, one.y, one.blur, ...(spread ? [one.spread] : [])]
      .map((value) => `${formatNumber(value).replace("-", "−")}px`)
      .join(" ")

  return {
    name,
    kind,
    value: shadowCss(layers, (one) => drawnColor(one.color, one.alpha, colors), { spread }),
    detail: layers.length === 1 ? numbers(layers[0]!) : `${layers.length} layers`,
    layers
  }
}

export interface GradientToken extends FieldToken {
  kind: "gradient"
  paint: Omit<GradientPaint, "token">
}

/** A gradient token from its paint, as the stand-ins and Create token make them, its stops' colors named by `colors`. */
export const gradientToken = (
  name: string,
  paint: Omit<GradientPaint, "token">,
  colors: readonly ColorToken[]
): GradientToken => ({
  name,
  kind: "gradient",
  value: gradientCss(paint, (stop) => drawnColor(stop.color, stop.alpha, colors)),
  detail: `${paint.kind === "linear" ? "Linear" : "Gradient"} ${paint.angle}°`,
  paint
})

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

export interface SizeToken extends FieldToken {
  kind: "font-size"
  px: number
  /** The line height it pairs, in pixels. */
  lineHeight: number
  /** Pairs a weight and letter spacing too, so a line height beside it is its own class. */
  pairsMore?: true
}

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

/** Tailwind's font weights, which name each hundred: a weight is a number in the style, so a project without weight tokens still steps through these. */
export const tailwindWeights: WeightToken[] = [
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

/**
 * Every set a field offers tokens from, by name, as a panel is given them (`ProjectData`): the project's own in the
 * Design tab, the stand-ins in the stories. A set the project has nothing in is empty, never left out.
 */
export interface TokenSets {
  color: ColorToken[]
  radius: LengthToken[]
  blur: LengthToken[]
  spacing: LengthToken[]
  borderWidth: LengthToken[]
  zIndex: LengthToken[]
  container: LengthToken[]
  breakpoint: LengthToken[]
  duration: DurationToken[]
  easing: EasingToken[]
  shadow: ShadowToken[]
  insetShadow: ShadowToken[]
  dropShadow: ShadowToken[]
  textShadow: ShadowToken[]
  gradient: GradientToken[]
  weight: WeightToken[]
  size: SizeToken[]
  leading: LeadingToken[]
  tracking: TrackingToken[]
  opacity: OpacityToken[]
  cursor: FieldToken[]
  font: FontToken[]
}

export type TokenSetName = keyof TokenSets
