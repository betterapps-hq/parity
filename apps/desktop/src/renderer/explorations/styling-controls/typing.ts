/*
 * What a length field reads from what's typed, with the app's own maths and units from `@parity-app/core`: `16`, `16px`,
 * `1.5rem`, `+8`, `*2`, `(24 - 4) / 2`, and `spacing-4` for step 4. `%` is CSS's percentage (call 10): a field that
 * takes one reads `50%` as such, and one that doesn't says to type `*0.5` for a share of the value there.
 */
import { applyFieldInput, type FieldRules, readFieldInput } from "@parity-app/core"
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
  if (trimmed === "") return { clear: true }
  const step = /^spacing-(\d*\.?\d+)$/i.exec(trimmed)?.[1]
  if (step !== undefined) {
    const px = Number(step) * spacingPx
    return Number.isInteger(px)
      ? { px }
      : { reason: `spacing-${step} isn't a step. Steps go in quarters, such as 3.25` }
  }
  if (trimmed.includes("%")) {
    const percent = /^(-?\d*\.?\d+)\s*%$/.exec(trimmed)?.[1]
    if (takesPercent && percent !== undefined) return { percent: Number(percent) }
    return {
      reason: takesPercent ? "Type a percentage on its own, such as 50%" : `No percentages here. Type *0.5 for half`
    }
  }
  const rules = rulesFor(label)
  const outcome = applyFieldInput(
    readFieldInput(trimmed, rules),
    current === undefined ? undefined : current * 4,
    rules
  )
  if (!outcome.ok) return { reason: outcome.reason }
  if (typeof outcome.value !== "number") return { clear: true }
  return { px: Math.round((outcome.value / 4) * 100) / 100 }
}
