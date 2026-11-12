import {
  type FieldLength,
  type FontWeight,
  isFill,
  isHug,
  type Length,
  type LineHeight as StoredLineHeight,
  lengthSteps,
  lengthToken,
  type Named,
  type Opacity as StoredOpacity,
  opacityPercent,
  type Padding,
  type Size
} from "@parity-app/core"
import { sidesOf, tidySides } from "@parity-app/editor"
import { isFixedSize, isLengthToken, isTokenSize, type Radius, type Size as ControlSize } from "./controls/data.ts"
import type { Side, Sides } from "./controls/sides-writes.ts"
import type { FontSize, FontValue, LetterSpacing, LineHeight, Opacity, WeightValue } from "./controls/text-writes.ts"
import type { LeadingToken, LengthToken, SizeToken, TrackingToken } from "./controls/tokens.ts"

/*
 * The Design tab's controls take values in PAR-652's forms: lengths in pixels, tokens as `{ token }`, keywords as
 * `{ option }`. `NodeStyle` holds each value with its form (PAR-941): lengths as `{ step }` of the spacing scale, tokens
 * as `{ token }`, and what's written out as `{ value }` or `{ keyword }`. These read a style's value as a control shows
 * it, and write what the control gives back as the style holds it. Where a control gives a type value the style's
 * fields don't take yet, a size of its own, it takes the token nearest it, as a length off the spacing scale lands on
 * its nearest step.
 */

/** Steps to the fourth place, so pixels typed come back as the steps they were. */
const exact = (steps: number) => Math.round(steps * 10_000) / 10_000

/** A percentage a length is written as (`{ value: "50%" }`). */
function percentOf(length: Size): number | undefined {
  if (!("value" in length)) {
    return undefined
  }

  const match = /^(-?\d*\.?\d+)%$/.exec(length.value)

  return match ? Number(match[1]) : undefined
}

const isAuto = (length: Size) => "keyword" in length && length.keyword === "auto"

/** A length as a side shows it: its pixels, its token, a percentage, or Auto. What else is written out shows nothing. */
export function sideOf(length: Length | undefined, unit: number): Side {
  if (length === undefined) {
    return undefined
  }

  const steps = lengthSteps(length)
  const token = lengthToken(length)
  const percent = percentOf(length)

  if (steps !== undefined) {
    return { number: exact(steps * unit) }
  }

  if (token !== undefined) {
    return { token }
  }

  if (percent !== undefined) {
    return { percent }
  }

  return isAuto(length) ? "auto" : undefined
}

/** A side as the style holds it: steps of the spacing scale, a token, a percentage, or Auto. */
export function lengthOf(side: Side, unit: number): Length | undefined {
  if (side === undefined) {
    return undefined
  }

  if (side === "auto") {
    return { keyword: "auto" }
  }

  if ("number" in side) {
    return { step: exact(side.number / unit) }
  }

  return "token" in side ? { token: side.token } : { value: `${side.percent}%` }
}

/** Padding or margin as the four sides a box model shows, from the top, clockwise. */
export function sidesShown(padding: Padding | undefined, unit: number): Sides {
  const sides = sidesOf(padding)

  return [sideOf(sides?.[0], unit), sideOf(sides?.[1], unit), sideOf(sides?.[2], unit), sideOf(sides?.[3], unit)]
}

const zero: Length = { step: 0 }

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
  const next = sidesOf(own) ?? [zero, zero, zero, zero]
  const lengths: [Length, Length, Length, Length] = [...next]

  for (const index of reached) {
    lengths[index] = lengthOf(sides[index], unit) ?? zero
  }

  return lengths.every((length) => lengthSteps(length) === 0) &&
    own === undefined &&
    sides.every((side) => side === undefined)
    ? undefined
    : tidySides(lengths)
}

/**
 * A length or size worked out from its own pixels, as `Mixed+8` works on each selected layer, in steps of the spacing
 * scale, and held at `min` pixels or more, as the field holds what's typed; undefined where it has no pixels to work
 * from (Fill, Hug, unset, a token that isn't a length, a length written out), so it stays.
 */
export function eachLength(
  length: Size | undefined,
  update: (px: number) => number,
  unit: number,
  tokens: readonly LengthToken[],
  min = 0
): Length | undefined {
  const px = lengthPx(length, unit, tokens)

  return px === undefined ? undefined : { step: exact(Math.max(min, update(px)) / unit) }
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
  const lengths: [Length, Length, Length, Length] = [...(sidesOf(own) ?? [zero, zero, zero, zero])]
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

/** A width or height as W and H show it: pixels, Fill or Hug, a percentage, or a token. */
export function sizeShown(size: Size | undefined, unit: number): ControlSize | undefined {
  if (size === undefined) {
    return undefined
  }

  if (isFill(size) || isHug(size)) {
    return size.size
  }

  const steps = lengthSteps(size)
  const token = lengthToken(size)
  const percent = percentOf(size)

  if (steps !== undefined) {
    return exact(steps * unit)
  }

  if (token !== undefined) {
    return { token }
  }

  return percent === undefined ? undefined : { percent }
}

/**
 * A size from W or H as a size field holds it, for `sizeEdit`: steps, a token's name, or Fill or Hug. A percentage and
 * content's sizes aren't offered.
 */
export function sizeOf(size: ControlSize, unit: number): FieldLength | undefined {
  if (size === "fill" || size === "hug") {
    return size
  }

  if (isFixedSize(size)) {
    return exact(size / unit)
  }

  return isTokenSize(size) ? size.token : undefined
}

/** A length's pixels, for what a limit or an edit starts at: its steps', or its token's. Fill and Hug have none. */
export function lengthPx(length: Size | undefined, unit: number, tokens: readonly LengthToken[]): number | undefined {
  const steps = lengthSteps(length)
  const token = lengthToken(length)

  return steps === undefined ? tokens.find((each) => each.name === token)?.px : steps * unit
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

/** A token's name as the style holds it. */
const named = (name: string | undefined): { token: string } | undefined =>
  name === undefined ? undefined : { token: name }

/** A radius from Radius: a token as it is, or the token nearest a length of its own. */
export function radiusOf(value: Radius | undefined, tokens: readonly LengthToken[]): Named | undefined {
  if (value === undefined) {
    return undefined
  }

  if (isLengthToken(value)) {
    return { token: value }
  }

  return named(
    "px" in value ? nearestName(tokens, (token) => token.px, value.px) : nearestName(tokens, (token) => token.px, 9999)
  )
}

/** Opacity as its field shows it: a token, or a percentage of its own. */
export function opacityShown(opacity: StoredOpacity | undefined): Opacity | undefined {
  if (opacity === undefined) {
    return undefined
  }

  const percent = opacityPercent(opacity)

  return percent === undefined ? named("token" in opacity ? opacity.token : undefined) : { percent }
}

/** Opacity as the style holds it: a token, or a percentage. */
export function opacityOf(value: Opacity | undefined): StoredOpacity | undefined {
  if (value === undefined) {
    return undefined
  }

  return "token" in value ? { token: value.token } : { step: value.percent }
}

/** A keyword from a set as the style holds it, where it's one the style takes; a custom keyword it can't hold. */
export function optionOf<T extends string>(
  value: { option: string } | { custom: string } | undefined,
  takes: readonly T[]
): T | undefined {
  return value !== undefined && "option" in value ? takes.find((each) => each === value.option) : undefined
}

/** A type value the style holds, as its field shows it: its token. What's written out shows nothing. */
export const tokenShown = (value: Named | StoredLineHeight | undefined) =>
  value !== undefined && "token" in value ? { token: value.token } : undefined

/** Font as the style holds it: a font token. A stack of its own isn't offered, as the field takes tokens only. */
export const fontOf = (value: FontValue | undefined): Named | undefined =>
  value !== undefined && "token" in value ? { token: value.token } : undefined

/** A text size: the token, or the one nearest pixels of its own. */
export function fontSizeOf(value: FontSize | undefined, tokens: readonly SizeToken[]): Named | undefined {
  if (value === undefined) {
    return undefined
  }

  return "token" in value ? { token: value.token } : named(nearestName(tokens, (token) => token.px, value.px))
}

/** A weight as its field shows it: the number or the token the style holds. */
export function weightShown(weight: FontWeight | undefined): WeightValue | undefined {
  if (weight === undefined) {
    return undefined
  }

  if ("value" in weight) {
    return { value: weight.value }
  }

  return "token" in weight ? { token: weight.token } : undefined
}

/** A weight as the style holds it: its number, or its token. */
export function weightOf(value: WeightValue | undefined): FontWeight | undefined {
  if (value === undefined) {
    return undefined
  }

  return "token" in value ? { token: value.token } : { value: value.value }
}

/**
 * A line height: the token, or the one nearest a multiple or pixels at the text's size. Auto (`normal`) is what unset
 * comes to.
 */
export function leadingOf(
  value: LineHeight | undefined,
  tokens: readonly LeadingToken[],
  fontPx: number
): StoredLineHeight | undefined {
  if (value === undefined || "keyword" in value) {
    return undefined
  }

  if ("token" in value) {
    return { token: value.token }
  }

  const multiple = "multiple" in value ? value.multiple : value.px / fontPx

  return named(nearestName(tokens, (token) => token.multiple, multiple))
}

/** Letter spacing: the token, or the one nearest em or pixels at the text's size. */
export function trackingOf(
  value: LetterSpacing | undefined,
  tokens: readonly TrackingToken[],
  fontPx: number
): Named | undefined {
  if (value === undefined) {
    return undefined
  }

  if ("token" in value) {
    return { token: value.token }
  }

  const em = "em" in value ? value.em : value.px / fontPx

  return named(nearestName(tokens, (token) => token.em, em))
}
