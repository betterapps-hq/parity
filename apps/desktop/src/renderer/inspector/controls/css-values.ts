/*
 * How the styling controls write values as CSS and as Tailwind, in one place, so every writer agrees: numbers, spacing
 * steps, Tailwind's fractions and arbitrary values, colors with their alpha, shadows and gradients, and the nine
 * spots' keywords. Each takes data and returns text; none knows about fields or tokens.
 */
import { stepFieldValue } from "@parity-app/core"
import { formatNumber, lengthForm, spacingPx } from "@parity-app/style-schema"

/** A number brought within `min` and `max`. */
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/** Tailwind's fraction for a percentage, where it has one (50% is `1/2`), or `full` for 100%, as call 10 writes them. */
export function fraction(percent: number): string | undefined {
  for (const denominator of [2, 3, 4, 5, 6, 12]) {
    for (let numerator = 1; numerator < denominator; numerator++) {
      if (Math.abs((numerator / denominator) * 100 - percent) < 0.01) {
        return `${numerator}/${denominator}`
      }
    }
  }

  return percent === 100 ? "full" : undefined
}

/**
 * A CSS value as the inside of a Tailwind arbitrary value (`[…]`), as Tailwind reads one back: the spaces CSS doesn't
 * need are dropped (after a comma, inside brackets, around an operator, which Tailwind puts back in maths), an
 * underscore of the value's own is escaped (`\_`), and every other space becomes an underscore.
 */
export function arbitrary(css: string): string {
  return css
    .trim()
    .replaceAll(/\(\s+/g, "(")
    .replaceAll(/\s+\)/g, ")")
    .replaceAll(/\s*,\s*/g, ",")
    .replaceAll(/\s+([+\-*/])\s+/g, "$1")
    .replaceAll("_", String.raw`\_`)
    .replaceAll(/\s+/g, "_")
}

/** A length after a utility's prefix: `130` for a step, `[13.3px]` otherwise. */
export function lengthClass(px: number): string {
  const form = lengthForm(px)

  return "step" in form ? String(form.step) : `[${form.value}]`
}

/** A length as CSS: `calc(var(--spacing) * 130)` for a step, the value otherwise. */
export function lengthCss(px: number): string {
  const form = lengthForm(px)

  return "step" in form ? `calc(var(--spacing) * ${form.step})` : form.value
}

/**
 * A length moved by `count` whole spacing steps, as Up and Down and scrubbing move a spacing length: 13px goes up to
 * 16px and down to 12px, then a step (4px) at a time.
 */
export function stepSpacing(px: number, count: number): number {
  return stepFieldValue(px / spacingPx, count, { kind: "length" }) * spacingPx
}

/** Two hex digits for an alpha from 0 to 100, as `#rrggbbaa` takes it. */
export const alphaHex = (alpha: number): string =>
  Math.round((clamp(alpha, 0, 100) / 100) * 255)
    .toString(16)
    .padStart(2, "0")

/** Whether a color is a plain value (`#2563eb`, `oklch(…)`) rather than a token's name. */
export const isPlainColor = (color: string): boolean => /^#|^oklch\(/i.test(color)

/**
 * A color at an alpha from 0 to 100, mixed toward transparent as Tailwind draws a token's alpha
 * (`color-mix(in oklab, …)`); the color as it is without one. Previews draw colors with it, and writers a token's alpha.
 */
export function mixColor(color: string, alpha: number | undefined): string
export function mixColor(color: string | undefined, alpha: number | undefined): string | undefined
export function mixColor(color: string | undefined, alpha: number | undefined): string | undefined {
  if (color === undefined || alpha === undefined) {
    return color
  }

  return `color-mix(in oklab, ${color} ${alpha}%, transparent)`
}

/**
 * A color as CSS writes it: a plain color with its alpha in it (`#2563eb80`, `oklch(… / 50%)`), or a token's variable,
 * mixed toward transparent at its alpha.
 */
export function colorCss(color: string, alpha?: number): string {
  if (isPlainColor(color)) {
    if (alpha === undefined) {
      return color
    }

    return color.startsWith("#") ? `${color.slice(0, 7)}${alphaHex(alpha)}` : color.replace(/\)$/, ` / ${alpha}%)`)
  }

  return mixColor(`var(--color-${color})`, alpha)
}

/** A number of pixels in a shadow or offset: `0` bare, the rest with px. */
const shadowPx = (value: number) => (value === 0 ? "0" : `${formatNumber(value)}px`)

/** One shadow's numbers, as every shadow writer and token takes them. */
export interface ShadowParts {
  x: number
  y: number
  blur: number
  spread: number
  inset?: boolean
}

/**
 * Shadows as CSS, top first: `inset 0 4px 12px -2px color`, each color as `color` writes it. Without `spread`, as
 * `text-shadow` and `drop-shadow()` take them, the spread is left out.
 */
export function shadowCss<T extends ShadowParts>(
  layers: readonly T[],
  color: (layer: T) => string,
  { spread = true }: { spread?: boolean } = {}
): string {
  return layers
    .map((layer) => {
      const numbers = [layer.x, layer.y, layer.blur, ...(spread ? [layer.spread] : [])].map(shadowPx).join(" ")

      return `${layer.inset ? "inset " : ""}${numbers} ${color(layer)}`
    })
    .join(", ")
}

/** What a gradient writer takes: its kind, where it starts, how it blends, and its stops. */
export interface GradientParts<Stop extends { position: number; hint?: number }> {
  kind: "linear" | "radial" | "angular"
  angle: number
  center?: [number, number]
  repeat?: boolean
  interpolation?: string
  stops: readonly Stop[]
}

const gradientFunction = { linear: "linear-gradient", radial: "radial-gradient", angular: "conic-gradient" } as const

/**
 * A gradient as CSS: `linear-gradient(90deg in oklab, red 0%, 30%, blue 100%)`, with a color hint after a stop where
 * it has one, each stop's color as `color` writes it.
 */
export function gradientCss<Stop extends { position: number; hint?: number }>(
  paint: GradientParts<Stop>,
  color: (stop: Stop) => string
): string {
  const blend = `in ${paint.interpolation ?? "oklab"}`
  const [x, y] = paint.center ?? [50, 50]
  let head = `from ${paint.angle}deg at ${x}% ${y}% ${blend}`

  if (paint.kind === "linear") {
    head = `${paint.angle}deg ${blend}`
  }

  if (paint.kind === "radial") {
    head = `at ${x}% ${y}% ${blend}`
  }

  const stops = [...paint.stops].sort((a, b) => a.position - b.position)

  const parts = stops.flatMap((stop, index) => {
    const own = `${color(stop)} ${stop.position}%`

    return stop.hint !== undefined && index < stops.length - 1 ? [own, `${stop.hint}%`] : [own]
  })

  return `${paint.repeat ? "repeating-" : ""}${gradientFunction[paint.kind]}(${head}, ${parts.join(", ")})`
}

/** A place on one axis of a box where a spot sits, as a percentage from the top or left. */
export type SpotValue = 0 | 50 | 100

/** The three spots on each axis of the nine-spot box. */
export const spotValues: readonly SpotValue[] = [0, 50, 100]

/** A position in a box, as percentages from its top left; the nine spots are 0, 50 and 100 on each axis. */
export interface BoxPoint {
  x: number
  y: number
}

const across = new Map([
  [0, "left"],
  [50, "center"],
  [100, "right"]
])

const down = new Map([
  [0, "top"],
  [50, "center"],
  [100, "bottom"]
])

/**
 * A spot's CSS keywords, as `object-position` and `transform-origin` write them (`top left`, `top`, `center`), or
 * nothing for a position off the spots. Every nine-spot box names its spots with these.
 */
export function spotKeywords({ x, y }: BoxPoint): string | undefined {
  const horizontal = across.get(x)
  const vertical = down.get(y)

  if (horizontal === undefined || vertical === undefined) {
    return undefined
  }

  if (horizontal === "center" && vertical === "center") {
    return "center"
  }

  if (horizontal === "center") {
    return vertical
  }

  if (vertical === "center") {
    return horizontal
  }

  return `${vertical} ${horizontal}`
}

/** Up and Down's count of steps: one, or ten with Shift. */
export const stepCount = (up: boolean, shift: boolean) => (up ? 1 : -1) * (shift ? 10 : 1)

/** The entry Up or Down steps to from `at` in a scale: the next or the one before, or with Shift the last or first. */
export function stepThrough<T>(scale: readonly T[], at: T, up: boolean, shift: boolean): T {
  const last = scale.length - 1
  let index = clamp(scale.indexOf(at) + (up ? 1 : -1), 0, last)

  if (shift) {
    index = up ? last : 0
  }

  return scale[index] ?? at
}

/** Whether two values a style holds are the same, part for part. */
export const sameValue = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b)

/** A color toward transparent, at `strength` percent, as the canvas tints what it marks. */
export const tint = (color: string, strength: number) => `color-mix(in oklch, ${color} ${strength}%, transparent)`
