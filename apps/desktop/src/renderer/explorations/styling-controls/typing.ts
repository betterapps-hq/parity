/*
 * What a length field reads from what's typed, with the app's own maths and units from `@parity-app/core`: `16`, `16px`,
 * `1.5rem`, `+8`, `*2`, `(24 - 4) / 2`, and `spacing-4` for step 4. `%` is CSS's percentage (call 10): a field that
 * takes one reads `50%` as such, and one that doesn't says to type `*0.5` for a share of the value there.
 */
import { applyFieldInput, type FieldRules, readFieldInput } from "@parity-app/core"
import { numberValue } from "../../chrome/prop-values.ts"
import { spacingPx } from "./css-values.ts"

/** Lengths read in pixels, to a quarter pixel, so nothing typed snaps to the spacing scale (call 1). */
const rulesFor = (label: string): FieldRules => ({ kind: "length", unit: 0.25, label })

/** What a length field makes of what's typed. */
export type LengthReading = { clear: true } | { px: number } | { percent: number } | { reason: string }

export function readLength(
  text: string,
  { label, current, takesPercent = false }: { label: string; current: number | undefined; takesPercent?: boolean }
): LengthReading {
  const trimmed = text.trim()

  if (trimmed === "") {
    return { clear: true }
  }

  const step = /^spacing-(\d*\.?\d+)$/i.exec(trimmed)?.[1]

  if (step !== undefined) {
    const px = Number(step) * spacingPx

    return Number.isInteger(px)
      ? { px }
      : { reason: `spacing-${step} isn't a spacing step. Use quarter steps, such as spacing-3.25` }
  }

  if (trimmed.includes("%")) {
    const percent = /^(-?\d*\.?\d+)\s*%$/.exec(trimmed)?.[1]

    if (takesPercent && percent !== undefined) {
      return { percent: Number(percent) }
    }

    return {
      reason: takesPercent
        ? "Enter a percentage on its own, such as 50%"
        : `${label} doesn't accept percentages. To halve it, enter *0.5`
    }
  }

  const rules = rulesFor(label)

  const outcome = applyFieldInput(
    readFieldInput(trimmed, rules),
    current === undefined ? undefined : current * 4,
    rules
  )

  if (!outcome.ok) {
    return { reason: outcome.reason }
  }

  // In quarter pixels, the unit `rulesFor` reads in; anything but a number clears the field.
  const quarters = numberValue.safeParse(outcome.value).data

  if (quarters === undefined) {
    return { clear: true }
  }

  return { px: Math.round((quarters / 4) * 100) / 100 }
}

/** Whether what's typed is a bare number, which a field reads in the unit it shows. */
export const isBareNumber = (text: string) => /^\s*-?\d*\.?\d+\s*$/.test(text)

/** A number typed with the app's maths: `8`, `+2`, `*2`, `(24 - 4) / 2`, working from `current` when it starts with one. */
export function readNumber(
  text: string,
  current: number | undefined,
  label: string
): { value: number } | { clear: true } | { reason: string } {
  const rules = { kind: "number" as const, label }
  const outcome = applyFieldInput(readFieldInput(text, rules), current, rules)

  if (!outcome.ok) {
    return { reason: outcome.reason }
  }

  const number = numberValue.safeParse(outcome.value).data

  if (number === undefined) {
    return { clear: true }
  }

  return { value: Math.round(number * 10_000) / 10_000 }
}

/**
 * A number typed in a field's own units, with the app's maths as `readNumber` reads it: `45`, `0.25turn`, `+15`, `*2`,
 * `(90 - 30) / 2`. A unit at the end converts from that unit, `units` giving what one of each comes to in the field's
 * own; a bare number is in the field's own unit, and a leading `-` is a negative number, not a step down. Text it
 * can't read gets `takes`, which says what the field takes.
 */
export function readUnitNumber(
  text: string,
  {
    units,
    current,
    label,
    takes
  }: { units: Readonly<Record<string, number>>; current: number; label: string; takes: string }
): { value: number } | { reason: string } {
  const trimmed = text.trim()
  const cannot = { reason: `Can't read "${trimmed}". ${takes}` }

  // A percentage is a share of a length, which a field in its own units doesn't take.
  if (trimmed.includes("%")) {
    return cannot
  }

  const withUnit = /^(.*[\d.)])\s*([a-z°]+)$/i.exec(trimmed)
  const unit = withUnit?.[2]?.toLowerCase().replace("°", "deg")
  const factor = unit === undefined ? 1 : units[unit]

  if (factor === undefined) {
    return cannot
  }

  const reading = readNumber(withUnit?.[1] ?? trimmed, current / factor, label)

  if ("clear" in reading) {
    return cannot
  }

  if ("reason" in reading) {
    return reading.reason.startsWith("Can't read") ? cannot : reading
  }

  return { value: Math.round(reading.value * factor * 10_000) / 10_000 }
}
