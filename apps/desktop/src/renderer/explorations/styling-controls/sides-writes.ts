/*
 * Four sides (PAR-652's Four sides type): padding, margin, stroke width and insets, each side in its own form, and
 * what they're stored as and write. Layer order shares the side's forms, as a count. What's typed is read with the
 * app's maths and units from typing.ts; what's written is the fewest classes, shorthand first (`p-4`, `px-4 py-2`,
 * `p-4 pb-6`), in css-values.ts's forms. The tokens a side can hold are the project's, which the field passes in, so a
 * token made with Create token reads and steps as any other.
 */
import type { PreviewKind } from "@parity-app/tokens"
import { arbitrary, formatNumber, fraction, lengthClass, lengthCss, lengthForm, stepSpacing } from "./css-values.ts"
import type { LengthToken } from "./tokens.ts"
import { readLength } from "./typing.ts"
import { type StoredObject, type StoredValue, withAllow, type Writes } from "./writes.ts"

/**
 * One side's value in PAR-652's value forms: a number in the field's unit (pixels, or a count for Layer order), a
 * percentage, a token, or `auto`. A number off the field's steps can be allowed here, with a reason.
 */
export type SideValue = { number: number; allow?: string } | { percent: number } | { token: string } | "auto"

export type Side = SideValue | undefined

/** Four sides from the top, clockwise, as CSS orders them; an unset side is undefined. */
export type Sides = [Side, Side, Side, Side]

/** The sides' names, from the top, clockwise. */
export const sideNames = ["Top", "Right", "Bottom", "Left"] as const

export type SidesKind = "padding" | "margin" | "border" | "inset" | "layer"

/** What a kind of side takes and how it steps. */
export interface SideRules {
  kind: SidesKind
  /** The property in a sentence: padding, margin, stroke width. */
  noun: string
  /** Which of the project's token sets it offers (`useTokens`), and the kind of token Create token makes in it. */
  tokens: { set: "spacing" | "borderWidth" | "zIndex"; kind: PreviewKind }
  /** What the kind's token names start with, which a chip leaves off (`gutter` for `spacing-gutter`). */
  namespace: string
  /** Up and Down: the next whole spacing step (4px), a pixel, or one. */
  stepBy: "spacing" | "pixel" | "count"
  negatives: boolean
  auto: boolean
  percent: boolean
  /** What unset is called in the token list's first row: None, or Auto where unset is `auto`. */
  unset: "None" | "Auto"
  /** The unit after the number; a count has none. */
  unit?: string
}

const spacing = { set: "spacing", kind: "spacing" } as const

export const sideRules: Record<SidesKind, SideRules> = {
  padding: {
    kind: "padding",
    noun: "padding",
    tokens: spacing,
    namespace: "spacing-",
    stepBy: "spacing",
    negatives: false,
    auto: false,
    percent: true,
    unset: "None",
    unit: "px"
  },
  margin: {
    kind: "margin",
    noun: "margin",
    tokens: spacing,
    namespace: "spacing-",
    stepBy: "spacing",
    negatives: true,
    auto: true,
    percent: true,
    unset: "None",
    unit: "px"
  },
  border: {
    kind: "border",
    noun: "stroke width",
    tokens: { set: "borderWidth", kind: "border-width" },
    namespace: "border-width-",
    stepBy: "pixel",
    negatives: false,
    auto: false,
    percent: false,
    unset: "None",
    unit: "px"
  },
  inset: {
    kind: "inset",
    noun: "inset",
    tokens: spacing,
    namespace: "spacing-",
    stepBy: "spacing",
    negatives: true,
    auto: true,
    percent: true,
    unset: "Auto",
    unit: "px"
  },
  layer: {
    kind: "layer",
    noun: "layer order",
    tokens: { set: "zIndex", kind: "z-index" },
    namespace: "z-",
    stepBy: "count",
    negatives: true,
    auto: true,
    percent: false,
    unset: "Auto"
  }
}

const capital = (text: string) => `${text[0]!.toUpperCase()}${text.slice(1)}`

/**
 * Whether a number is one of the field's steps: a whole pixel, which is a step of the spacing scale (any multiple of a
 * quarter step, as css-values.ts's `lengthForm` says) and a whole stroke width, or a whole count.
 */
export const onStep = (number: number) => "step" in lengthForm(number)

/** A side's value in its unit, where it has one: its own number, or its token's. */
export function sideNumber(side: Side, tokens: readonly LengthToken[]): number | undefined {
  if (side === undefined || side === "auto") {
    return undefined
  }

  if ("number" in side) {
    return side.number
  }

  if ("token" in side) {
    return tokens.find((token) => token.name === side.token)?.px
  }

  return undefined
}

export type SideReading = { side: Side } | { shorthand: Sides } | { reason: string }

/**
 * What's typed into a side: a length with the app's maths and units, a token's name with or without its namespace,
 * `auto` where it's taken, or CSS's shorthand of two to four values, which fills the sides in CSS's order.
 */
export function readSide(
  text: string,
  label: string,
  rules: SideRules,
  current: Side,
  tokens: readonly LengthToken[]
): SideReading {
  const trimmed = text.trim()

  if (trimmed === "") {
    return { side: undefined }
  }

  const parts = trimmed.split(/\s+/)

  if (parts.length === 1) {
    return readOne(trimmed, label, rules, current, tokens)
  }

  if (parts.length > 4) {
    return { reason: `${label} takes one to four values, as CSS's shorthand does` }
  }

  const read: Side[] = []

  for (const part of parts) {
    const reading = readOne(part, label, rules, undefined, tokens)

    if ("reason" in reading) {
      return { reason: `Can't read ${part}: ${reading.reason}` }
    }

    if ("side" in reading) {
      read.push(reading.side)
    }
  }

  const [a, b = a, c = a, d = b] = read

  return { shorthand: [a, b, c, d] }
}

function readOne(
  text: string,
  label: string,
  rules: SideRules,
  current: Side,
  tokens: readonly LengthToken[]
): SideReading {
  if (text.toLowerCase() === "auto") {
    return rules.auto ? { side: "auto" } : { reason: `${capital(rules.noun)} doesn't take auto` }
  }

  const token = tokens.find((other) => other.name === text || other.name === rules.namespace + text)

  if (token) {
    return { side: { token: token.name } }
  }

  if (rules.stepBy === "count") {
    const number = Number(text)

    if (!Number.isInteger(number)) {
      return { reason: `Enter a whole number, such as 10, or a token` }
    }

    return { side: { number } }
  }

  const reading = readLength(text, { label, current: sideNumber(current, tokens), takesPercent: rules.percent })

  if ("clear" in reading) {
    return { side: undefined }
  }

  if ("reason" in reading) {
    if (!reading.reason.startsWith("Can't read")) {
      return reading
    }

    const auto = rules.auto ? ", auto" : ""

    return { reason: `Enter a length, such as 16 or 1rem${auto}, or a token` }
  }

  if ("percent" in reading) {
    if (reading.percent < 0 && !rules.negatives) {
      return { reason: `${capital(rules.noun)} can't be negative` }
    }

    return { side: { percent: reading.percent } }
  }

  if (reading.px < 0 && !rules.negatives) {
    return { reason: `${capital(rules.noun)} can't be negative` }
  }

  return { side: { number: reading.px } }
}

/**
 * Up or Down from a side: the next token in scale order, the next whole spacing step (13px goes to 16px, as
 * css-values.ts's `stepSpacing` moves every spacing length), a pixel or one; Shift goes to the first or last token, or
 * ten steps.
 */
export function stepSide(
  side: Side,
  rules: SideRules,
  up: boolean,
  shift: boolean,
  measured: number | undefined,
  tokens: readonly LengthToken[]
): Side {
  if (side !== undefined && side !== "auto" && "token" in side) {
    const scale = tokens.filter((token) => !token.deprecated).toSorted((a, b) => a.px - b.px)
    const index = scale.findIndex((token) => token.name === side.token)

    if (index !== -1) {
      const last = scale.length - 1
      let next = Math.min(last, Math.max(0, index + (up ? 1 : -1)))

      if (shift) {
        next = up ? last : 0
      }

      return { token: scale[next]!.name }
    }
  }

  const by = (up ? 1 : -1) * (shift ? 10 : 1)

  if (side !== undefined && side !== "auto" && "percent" in side) {
    return { percent: side.percent + by }
  }

  const from = sideNumber(side, tokens) ?? measured ?? 0
  const next = rules.stepBy === "spacing" ? stepSpacing(from, by) : from + by

  return { number: rules.negatives ? next : Math.max(0, next) }
}

/* What a side writes. */

type Slot = "all" | "x" | "y" | "t" | "r" | "b" | "l"

const slotOrder: Slot[] = ["all", "x", "y", "t", "r", "b", "l"]
const sideSlots = ["t", "r", "b", "l"] as const

const prefixes: Record<SidesKind, Record<Slot, string>> = {
  padding: { all: "p", x: "px", y: "py", t: "pt", r: "pr", b: "pb", l: "pl" },
  margin: { all: "m", x: "mx", y: "my", t: "mt", r: "mr", b: "mb", l: "ml" },
  border: {
    all: "border",
    x: "border-x",
    y: "border-y",
    t: "border-t",
    r: "border-r",
    b: "border-b",
    l: "border-l"
  },
  inset: { all: "inset", x: "inset-x", y: "inset-y", t: "top", r: "right", b: "bottom", l: "left" },
  layer: { all: "z", x: "z", y: "z", t: "z", r: "z", b: "z", l: "z" }
}

/** What each slot's class compiles to in Tailwind v4: `px-4` is `padding-inline`, as the panel spec says. */
const properties: Record<SidesKind, Record<Slot, string>> = {
  padding: {
    all: "padding",
    x: "padding-inline",
    y: "padding-block",
    t: "padding-top",
    r: "padding-right",
    b: "padding-bottom",
    l: "padding-left"
  },
  margin: {
    all: "margin",
    x: "margin-inline",
    y: "margin-block",
    t: "margin-top",
    r: "margin-right",
    b: "margin-bottom",
    l: "margin-left"
  },
  border: {
    all: "border-width",
    x: "border-inline-width",
    y: "border-block-width",
    t: "border-top-width",
    r: "border-right-width",
    b: "border-bottom-width",
    l: "border-left-width"
  },
  inset: { all: "inset", x: "inset-inline", y: "inset-block", t: "top", r: "right", b: "bottom", l: "left" },
  layer: { all: "z-index", x: "z-index", y: "z-index", t: "z-index", r: "z-index", b: "z-index", l: "z-index" }
}

/** A number of pixels that isn't a spacing step's length: a stroke width, or an off-step value, as `13.5px`. */
const pixels = (number: number) => `${formatNumber(number)}px`

/** One side's class: `pt-4`, `-mt-2`, `pt-3.25`, `pt-[13.3px]`, `p-gutter`, `mx-auto`, `top-1/2`, `border-b`. */
export function sideClass(kind: SidesKind, prefix: string, side: SideValue): string {
  if (side === "auto") {
    return `${prefix}-auto`
  }

  if ("token" in side) {
    if (kind === "border") {
      return `${prefix}-(length:--${side.token})`
    }

    if (kind === "layer") {
      return `${prefix}-(--${side.token})`
    }

    return `${prefix}-${side.token.replace(/^spacing-/, "")}`
  }

  if ("percent" in side) {
    const share = kind === "inset" ? fraction(Math.abs(side.percent)) : undefined

    if (share === undefined) {
      return `${prefix}-[${arbitrary(`${side.percent}%`)}]`
    }

    return side.percent < 0 ? `-${prefix}-${share}` : `${prefix}-${share}`
  }

  const number = side.number

  if (kind === "layer") {
    return number < 0 ? `-${prefix}-${-number}` : `${prefix}-${number}`
  }

  if (!onStep(number)) {
    return `${prefix}-[${pixels(number)}]`
  }

  if (kind === "border") {
    return number === 1 ? prefix : `${prefix}-${number}`
  }

  return number < 0 ? `-${prefix}-${lengthClass(-number)}` : `${prefix}-${lengthClass(number)}`
}

/** One side as CSS writes it: a step is `calc(var(--spacing) * 4)`, as Tailwind compiles it. */
export function sideCss(kind: SidesKind, side: SideValue): string {
  if (side === "auto") {
    return "auto"
  }

  if ("token" in side) {
    return `var(--${side.token})`
  }

  if ("percent" in side) {
    return `${side.percent}%`
  }

  if (kind === "layer") {
    return String(side.number)
  }

  if (kind === "border") {
    return pixels(side.number)
  }

  return lengthCss(side.number)
}

/** One side as it's drawn in a preview, in pixels where it has them. */
export function sideInline(side: Side, tokens: readonly LengthToken[]): string | undefined {
  if (side === undefined) {
    return undefined
  }

  if (side === "auto") {
    return "auto"
  }

  if ("percent" in side) {
    return `${side.percent}%`
  }

  return `${sideNumber(side, tokens) ?? 0}px`
}

/** One side in PAR-652's stored forms: `{ step }`, `{ value }`, `{ token }` or `{ keyword }`. */
export function sideStored(kind: SidesKind, side: SideValue): StoredObject {
  if (side === "auto") {
    return { keyword: "auto" }
  }

  if ("token" in side) {
    return { token: side.token }
  }

  if ("percent" in side) {
    return { value: `${side.percent}%` }
  }

  // Spacing kinds count their steps in quarters of a whole one; a stroke width and a count are their own steps.
  if (kind === "padding" || kind === "margin" || kind === "inset") {
    return withAllow(lengthForm(side.number), side.allow)
  }

  if (!onStep(side.number)) {
    return withAllow({ value: pixels(side.number) }, side.allow)
  }

  return withAllow({ step: side.number }, side.allow)
}

const sameSide = (a: Side, b: Side) => a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b)
const isZero = (side: Side) => side !== undefined && side !== "auto" && "number" in side && side.number === 0

/**
 * The fewest classes for four sides, shorthand first: a pair for each axis, one for every side with the others
 * after it, or each side on its own, whichever is fewest. A zero side writes nothing where preflight already zeroes
 * it (padding, margin, border width), but an inset's 0 is a value. A Mixed side writes nothing, since each layer keeps
 * its own.
 */
function plan(kind: SidesKind, sides: Sides): [Slot, SideValue][] {
  const skip = (side: Side) => side === undefined || (kind !== "inset" && isZero(side))

  const single = (index: number): [Slot, SideValue][] =>
    skip(sides[index]) ? [] : [[sideSlots[index]!, sides[index]!]]

  const pair = (slot: Slot, first: number, second: number): [Slot, SideValue][] => {
    if (!sameSide(sides[first], sides[second])) {
      return [...single(first), ...single(second)]
    }

    return skip(sides[first]) ? [] : [[slot, sides[first]!]]
  }

  // Pairs first, so a tie goes to classes that don't override one another (`px-4 py-2` over `p-2 px-4`).
  const candidates: [Slot, SideValue][][] = [[...pair("x", 1, 3), ...pair("y", 0, 2)]]

  if (sides.every((side) => side !== undefined)) {
    const distinct = sides.filter((side, index) => sides.findIndex((other) => sameSide(other, side)) === index)

    for (const base of distinct) {
      const differs = (index: number) => !sameSide(sides[index], base)

      const forced = (index: number): [Slot, SideValue][] =>
        differs(index) ? [[sideSlots[index]!, sides[index]!]] : []

      const axis = (slot: Slot, first: number, second: number): [Slot, SideValue][] =>
        differs(first) && differs(second) && sameSide(sides[first], sides[second])
          ? [[slot, sides[first]!]]
          : [...forced(first), ...forced(second)]

      const all: [Slot, SideValue][] = skip(base) ? [] : [["all", base!]]
      candidates.push([...all, ...axis("x", 1, 3), ...axis("y", 0, 2)])
    }
  }

  candidates.push([0, 1, 2, 3].flatMap(single))
  const fewest = candidates.reduce((best, next) => (next.length < best.length ? next : best))

  return fewest.toSorted(([a], [b]) => slotOrder.indexOf(a) - slotOrder.indexOf(b))
}

/** What four sides store and write, with the sides the selected layers differ on left as they are. */
export function sidesWrites(kind: SidesKind, sides: Sides, mixed: readonly boolean[] = []): Writes {
  const [top, right, bottom, left] = sides.map((side, index) => (mixed[index] ? undefined : side))
  const chosen = plan(kind, [top, right, bottom, left])
  const css = chosen.map(([slot, side]) => `${properties[kind][slot]}: ${sideCss(kind, side)}`)
  const tailwind = chosen.map(([slot, side]) => sideClass(kind, prefixes[kind][slot], side))

  if (kind === "border" && tailwind.length > 0) {
    css.push("border-style: solid")
  }

  let stored: StoredValue

  if (sides.some((side, index) => side !== undefined || mixed[index])) {
    const forms = sides.map((side, index) => {
      if (mixed[index]) {
        return "Mixed"
      }

      return side === undefined ? null : sideStored(kind, side)
    })

    const allSame = sides.every((side) => sameSide(side, sides[0])) && !mixed.some(Boolean)
    stored = allSame ? forms[0] : forms
  }

  return { stored, css, tailwind }
}
