/*
 * What a length field reads from what's typed, with the app's own maths and units from `@parity-app/core`: `16`, `16px`,
 * `1.5rem`, `+8`, `*2`, `(24 - 4) / 2`, and `spacing-4` for step 4. `%` is CSS's percentage (call 10): a field that
 * takes one reads `50%` as such, and one that doesn't says to type `*0.5` for a share of the value there.
 */
import { applyFieldInput, type FieldRules, readFieldInput, scrubSteps } from "@parity-app/core"
import type { PointerEvent as ReactPointerEvent } from "react"

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
    const px = Number(step) * 4
    return Number.isInteger(px)
      ? { px }
      : { reason: `spacing-${step} isn't a step. Steps go in quarters, as spacing-3.25 does` }
  }
  if (trimmed.includes("%")) {
    const percent = /^(-?\d*\.?\d+)\s*%$/.exec(trimmed)?.[1]
    if (takesPercent && percent !== undefined) return { percent: Number(percent) }
    return {
      reason: takesPercent
        ? "Type a percentage on its own, such as 50%"
        : `${label} doesn't take a percentage. Type *0.5 for half of it`
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

/**
 * Dragging a field's label left or right to change its value, as Figma's labels scrub: 1px per screen pixel for a
 * value, or one whole spacing step per 2 screen pixels for a spacing length; ten times as far with Shift.
 */
export function scrubbing(
  from: () => number,
  apply: (value: number) => void,
  { spacing = false, min = 0 }: { spacing?: boolean; min?: number } = {}
) {
  return (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const start = from()
    const move = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX
      const by = spacing ? scrubSteps(dx, moveEvent.shiftKey) * 4 : Math.trunc(dx) * (moveEvent.shiftKey ? 10 : 1)
      apply(Math.max(min, start + by))
    }
    const end = () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", end)
      handle.removeEventListener("pointercancel", end)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", end)
    handle.addEventListener("pointercancel", end)
  }
}
