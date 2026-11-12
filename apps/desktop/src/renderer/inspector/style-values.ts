import type { Length, Padding, Size } from "@parity-app/core"
import { sidesOf, tidySides } from "@parity-app/editor"
import { numberValue } from "../chrome/prop-values.ts"
import { isLengthToken, isTokenSize, type Radius, type Size as ControlSize } from "./controls/data.ts"
import type { Side, Sides } from "./controls/sides-writes.ts"
import type { FontSize, FontValue, LetterSpacing, LineHeight, Opacity, WeightValue } from "./controls/text-writes.ts"
import type { LeadingToken, LengthToken, SizeToken, TrackingToken, WeightToken } from "./controls/tokens.ts"

/*
 * The Design tab's controls take values in PAR-652's forms: lengths in pixels, tokens as `{ token }`, keywords as
 * `{ option }`. `NodeStyle` holds lengths as steps of the spacing scale, and colors, radii and type as token names.
 * These read a style's value as a control shows it, and write what the control gives back as the style holds it.
 * Where a control gives a value the style can't hold as it is, a size of its own for a type value, it takes the token
 * nearest it, as a length off the spacing scale lands on its nearest step.
 */

/** Steps to the fourth place, so pixels typed come back as the steps they were. */
const exact = (steps: number) => Math.round(steps * 10_000) / 10_000

/** A length as a side shows it: its pixels, or its token. */
export function sideOf(length: Length | undefined, unit: number): Side {
  if (length === undefined) {
    return undefined
  }

  const steps = numberValue.safeParse(length)

  return steps.success ? { number: exact(steps.data * unit) } : { token: String(length) }
}

/** A side as the style holds it: steps of the spacing scale, or a token's name. Auto and percentages it can't hold. */
export function lengthOf(side: Side, unit: number): Length | undefined {
  if (side === undefined || side === "auto") {
    return undefined
  }

  if ("number" in side) {
    return exact(side.number / unit)
  }

  return "token" in side ? side.token : undefined
}

/** Padding or margin as the four sides a box model shows, from the top, clockwise. */
export function sidesShown(padding: Padding | undefined, unit: number): Sides {
  const sides = sidesOf(padding)

  return [sideOf(sides?.[0], unit), sideOf(sides?.[1], unit), sideOf(sides?.[2], unit), sideOf(sides?.[3], unit)]
}

/**
 * Four sides as the style writes them, in its shortest form, from what each layer had: only the sides an edit reached
 * change, so several layers keep their other sides. Unset sides are 0, and four unset sides unset it.
 */
export function paddingOf(
  own: Padding | undefined,
  sides: Sides,
  reached: readonly number[],
  unit: number
): Padding | undefined {
  const next = sidesOf(own) ?? [0, 0, 0, 0]
  const lengths: [Length, Length, Length, Length] = [...next]

  for (const index of reached) {
    lengths[index] = lengthOf(sides[index], unit) ?? 0
  }

  return lengths.every((length) => length === 0) && own === undefined && sides.every((side) => side === undefined)
    ? undefined
    : tidySides(lengths)
}

/**
 * A length or size worked out from its own pixels, as `Mixed+8` works on each selected layer, in steps of the spacing
 * scale, and held at `min` pixels or more, as the field holds what's typed; undefined where it has no pixels to work
 * from (Fill, Hug, unset, a token that isn't a length), so it stays.
 */
export function eachLength(
  length: Size | undefined,
  update: (px: number) => number,
  unit: number,
  tokens: readonly LengthToken[],
  min = 0
): number | undefined {
  const px = length === "fill" || length === "hug" ? undefined : lengthPx(length, unit, tokens)

  return px === undefined ? undefined : exact(Math.max(min, update(px)) / unit)
}

/**
 * Padding or margin with the sides an edit reached each worked out from its own pixels (`eachLength`); unset sides
 * count as 0. `min` is the least a side takes: 0 for padding, none for margin, which can be negative.
 */
export function eachSideOf(
  own: Padding | undefined,
  reached: readonly number[],
  update: (px: number) => number,
  unit: number,
  tokens: readonly LengthToken[],
  min = 0
): Padding | undefined {
  const lengths: [Length, Length, Length, Length] = [...(sidesOf(own) ?? [0, 0, 0, 0])]
  let changed = false

  for (const index of reached) {
    const next = eachLength(lengths[index], update, unit, tokens, min)

    if (next !== undefined) {
      lengths[index] = next
      changed = true
    }
  }

  return changed ? tidySides(lengths) : own
}

/** A width or height as W and H show it: pixels, Fill or Hug, or a token. */
export function sizeShown(size: Size | undefined, unit: number): ControlSize | undefined {
  if (size === undefined) {
    return undefined
  }

  if (size === "fill" || size === "hug") {
    return size
  }

  const steps = numberValue.safeParse(size)

  return steps.success ? exact(steps.data * unit) : { token: String(size) }
}

/** A size from W or H as the style holds it; the forms it can't hold yet, a percentage or content's, aren't offered. */
export function sizeOf(size: ControlSize, unit: number): Size | undefined {
  if (size === "fill" || size === "hug") {
    return size
  }

  const pixels = numberValue.safeParse(size)

  if (pixels.success) {
    return exact(pixels.data / unit)
  }

  return isTokenSize(size) ? size.token : undefined
}

/** A length's pixels, for what a limit starts at: its steps', or its token's. */
export function lengthPx(length: Length | undefined, unit: number, tokens: readonly LengthToken[]): number | undefined {
  if (length === undefined) {
    return undefined
  }

  const steps = numberValue.safeParse(length)

  return steps.success ? steps.data * unit : tokens.find((token) => token.name === length)?.px
}

/** The token whose measure is nearest `to`, by name. */
export function nearestName<T extends { name: string; deprecated?: string }>(
  tokens: readonly T[],
  measure: (token: T) => number,
  to: number
): string | undefined {
  let nearest: T | undefined

  for (const token of tokens) {
    if (
      token.deprecated === undefined &&
      (!nearest || Math.abs(measure(token) - to) < Math.abs(measure(nearest) - to))
    ) {
      nearest = token
    }
  }

  return nearest?.name
}

/** A radius token's name from Radius: a token as it is, or the token nearest a length of its own. */
export function radiusOf(value: Radius | undefined, tokens: readonly LengthToken[]): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (isLengthToken(value)) {
    return value
  }

  return "px" in value
    ? nearestName(tokens, (token) => token.px, value.px)
    : nearestName(tokens, (token) => token.px, 9999)
}

/** Opacity as its field shows it: a percentage of its own. */
export const opacityShown = (opacity: number | undefined): Opacity | undefined =>
  opacity === undefined ? undefined : { percent: opacity }

/** Opacity as the style holds it: a percentage. The project's opacity tokens aren't offered yet. */
export const opacityOf = (value: Opacity | undefined): number | undefined =>
  value !== undefined && "percent" in value ? value.percent : undefined

/** A keyword from a set as the style holds it, where it's one the style takes; a custom keyword it can't hold. */
export function optionOf<T extends string>(
  value: { option: string } | { custom: string } | undefined,
  takes: readonly T[]
): T | undefined {
  return value !== undefined && "option" in value ? takes.find((each) => each === value.option) : undefined
}

/** A type token the style holds, as its field shows it. */
export const tokenShown = (name: string | undefined) => (name === undefined ? undefined : { token: name })

/** Font as the style holds it: a font token's name. A stack of its own isn't offered, as the field takes tokens only. */
export const fontOf = (value: FontValue | undefined): string | undefined =>
  value !== undefined && "token" in value ? value.token : undefined

/** A text size token's name: the token, or the one nearest pixels of its own. */
export function fontSizeOf(value: FontSize | undefined, tokens: readonly SizeToken[]): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return "token" in value ? value.token : nearestName(tokens, (token) => token.px, value.px)
}

/** A weight as its field shows it: the number the style holds. */
export const weightShown = (weight: number | undefined): WeightValue | undefined =>
  weight === undefined ? undefined : { value: weight }

/** A weight as the style holds it: its number, or a weight token's. */
export function weightOf(value: WeightValue | undefined, tokens: readonly WeightToken[]): number | undefined {
  if (value === undefined) {
    return undefined
  }

  return "token" in value ? tokens.find((token) => token.name === value.token)?.weight : value.value
}

/**
 * A leading token's name: the token, or the one nearest a multiple or pixels at the text's size. Auto (`normal`) is
 * what unset comes to.
 */
export function leadingOf(
  value: LineHeight | undefined,
  tokens: readonly LeadingToken[],
  fontPx: number
): string | undefined {
  if (value === undefined || "keyword" in value) {
    return undefined
  }

  if ("token" in value) {
    return value.token
  }

  const multiple = "multiple" in value ? value.multiple : value.px / fontPx

  return nearestName(tokens, (token) => token.multiple, multiple)
}

/** A tracking token's name: the token, or the one nearest em or pixels at the text's size. */
export function trackingOf(
  value: LetterSpacing | undefined,
  tokens: readonly TrackingToken[],
  fontPx: number
): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if ("token" in value) {
    return value.token
  }

  const em = "em" in value ? value.em : value.px / fontPx

  return nearestName(tokens, (token) => token.em, em)
}
