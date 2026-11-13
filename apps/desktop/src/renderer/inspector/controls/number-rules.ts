/*
 * What a number field takes, as rules rather than a reader of its own: its range, whether it's whole, what an empty
 * field and a number past either end do, the unit and words it reads. `NumberField` builds its reading, stepping and
 * reasons from these, so every number field reads, steps and says what it takes the same way. The maths is
 * `readNumber`'s: `8`, `+2`, `*2`, `(24 - 4) / 2`.
 */
import { type ReadFailure, readFailure } from "@parity-app/style-schema"
import { stepCount } from "./css-values.ts"
import { readNumber } from "./typing.ts"

export interface NumberRules {
  /** The field's accessible name. */
  label: string
  /** What its reasons call it, where that isn't its label: Weight, for the field named Weight number. */
  called?: string
  min?: number
  max?: number
  /** Whole numbers only: what's typed, stepped or scrubbed rounds to one, as a count does. */
  whole?: boolean
  /** Decimals kept: 3 unless said, as fields show numbers. */
  places?: number
  /**
   * What a number typed past either end does: stops there, which the field shows, so it says nothing (the default), or
   * is refused with what the field takes.
   */
  past?: "stop" | "refuse"
  /** An empty field is refused, for a value that must be there; otherwise it's unset. */
  required?: boolean
  /** The unit typed after a number that it reads as its own: `%`, `px`, `ms`. */
  unit?: string
  /** Words it reads as numbers, or as unset: `left` as 0, `auto` as unset. Matched without case. */
  words?: Readonly<Record<string, number | undefined>>
  /** What else it takes, which its reason adds: "Column count takes a whole number from 1 to 12, or Fit". */
  alsoTakes?: string
  /** Up and Down move it by `step`, `shiftStep` with Shift and `altStep` with Alt: 1, 10 and `step` unless said. */
  step?: number
  shiftStep?: number
  altStep?: number
}

/** What a number field reads from what's typed: a number, unset, or why not. */
export type NumberReading = { value: number | undefined } | ReadFailure

/** What a field with these rules takes, as its reason says: "Weight takes a whole number from 1 to 1000". */
export function numberTakes(rules: NumberRules): string {
  const { min, max } = rules
  let range = ""

  if (min !== undefined && max !== undefined) {
    range = ` from ${min} to ${max}`
  } else if (min !== undefined) {
    range = ` from ${min}`
  } else if (max !== undefined) {
    range = ` up to ${max}`
  }

  const also = rules.alsoTakes ? `, or ${rules.alsoTakes}` : ""

  return `${rules.called ?? rules.label} takes ${rules.whole ? "a whole number" : "a number"}${range}${also}`
}

/** A number rounded as the field keeps it: to a whole one, or to its decimals. */
function rounded(number: number, rules: NumberRules): number {
  const scale = 10 ** (rules.whole ? 0 : (rules.places ?? 3))

  return Math.round(number * scale) / scale
}

/** A number as the field keeps it: rounded, and held to its range. */
export function settleNumber(number: number, rules: NumberRules): number {
  return Math.min(rules.max ?? Infinity, Math.max(rules.min ?? -Infinity, rounded(number, rules)))
}

const escaped = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * What's typed, read by the rules, working from `current` for maths that starts with an operator. A word it takes
 * comes first, then the unit after a number is dropped, and `−` read as a minus.
 */
export function readNumberText(text: string, rules: NumberRules, current: number | undefined): NumberReading {
  const trimmed = text.trim()
  const word = trimmed.toLowerCase()

  if (rules.words && Object.hasOwn(rules.words, word)) {
    return { value: rules.words[word] }
  }

  const unit = rules.unit ? new RegExp(`\\s*${escaped(rules.unit)}$`, "i") : undefined

  const reading = readNumber(
    (unit ? trimmed.replace(unit, "") : trimmed).replaceAll("−", "-"),
    current,
    rules.called ?? rules.label
  )

  if ("clear" in reading) {
    return rules.required ? readFailure("incomplete", numberTakes(rules)) : { value: undefined }
  }

  if ("reason" in reading) {
    return reading
  }

  const settled = settleNumber(reading.value, rules)

  // Refused past either end, where the rules say so; otherwise it stops there.
  if (rules.past === "refuse" && settled !== rounded(reading.value, rules)) {
    return readFailure("out-of-range", numberTakes(rules))
  }

  return { value: settled }
}

/** The number Up or Down comes to from `own`, by the rules' steps. */
export function stepNumber(
  own: number,
  up: boolean,
  keys: { shift: boolean; alt: boolean },
  rules: NumberRules
): number {
  const step = rules.step ?? 1
  let by = step * stepCount(up, false)

  if (keys.shift) {
    by = (rules.shiftStep ?? step * 10) * stepCount(up, false)
  } else if (keys.alt && rules.altStep !== undefined) {
    by = rules.altStep * stepCount(up, false)
  }

  return settleNumber(own + by, rules)
}
