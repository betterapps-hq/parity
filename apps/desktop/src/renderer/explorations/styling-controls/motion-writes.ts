/*
 * What Motion's, Transform's and Rotation's values are stored as and what they write, for the readout beside each
 * story, in the forms writes.ts uses: the stored value, the CSS and the Tailwind classes.
 */
import {
  type Angle,
  type BoxPosition,
  defaultDuration,
  type Easing,
  easingPresets,
  type Move,
  springLinear,
  spotName,
  type Time,
  timeMs,
  type TransformValue,
  type TransitionEntry,
  transitionProperties,
  transitionSets
} from "./motion-data.ts"
import { easingTokens } from "./tokens.ts"
import type { Writes } from "./writes.ts"

const nothing: Writes = { stored: undefined, css: [], tailwind: [] }

/** Tailwind's arbitrary value: spaces become underscores. */
const arbitrary = (value: string) => value.replaceAll(", ", ",").replaceAll(" ", "_")

/** Position's Rotation: `rotate-45`, `-rotate-12`, or `rotate-[22.5deg]` for a value of its own. */
export function angleWrites(angle: Angle | undefined): Writes {
  if (angle === undefined) return nothing
  if ("step" in angle) {
    const sign = angle.step < 0 ? "-" : ""
    return { stored: angle, css: [`rotate: ${angle.step}deg`], tailwind: [`${sign}rotate-${Math.abs(angle.step)}`] }
  }
  return { stored: angle, css: [`rotate: ${angle.value}`], tailwind: [`rotate-[${angle.value}]`] }
}

/** A transition's duration or delay: `duration-200`, a token, or `duration-[0.2s]` as read from code. */
export function timeWrites(which: "duration" | "delay", time: Time | undefined): Writes {
  if (time === undefined) return nothing
  const property = `transition-${which}`
  if ("step" in time) return { stored: time, css: [`${property}: ${time.step}ms`], tailwind: [`${which}-${time.step}`] }
  if ("token" in time) {
    return { stored: time, css: [`${property}: var(--${time.token})`], tailwind: [`${which}-(--${time.token})`] }
  }
  return { stored: time, css: [`${property}: ${time.value}`], tailwind: [`${which}-[${time.value}]`] }
}

/** An easing as CSS writes it: Tailwind's variable for its own, the token's, the curve, or a spring's `linear()`. */
export function easingCss(easing: Easing): string {
  if ("keyword" in easing) return easing.keyword === "linear" ? "linear" : `var(--${easing.keyword})`
  if ("token" in easing) return `var(--${easing.token})`
  if ("spring" in easing) return springLinear(easing.spring)
  return easing.value
}

/** The class an easing writes: `ease-out`, `ease-linear`, `ease-snappy`, or `ease-[…]`. */
export function easingClass(easing: Easing): string {
  if ("keyword" in easing) return `ease-${easing.keyword.replace(/^ease-/, "")}`
  if ("token" in easing) return easing.token
  return `ease-[${arbitrary(easingCss(easing))}]`
}

/** Whether an easing's class runs long enough to offer Save as token first, as a spring's `linear()` does. */
export const easingIsLong = (easing: Easing | undefined) => easing !== undefined && easingClass(easing).length > 60

/** A transition's easing. */
export function easingWrites(easing: Easing | undefined): Writes {
  if (easing === undefined) return nothing
  return {
    stored: easing,
    css: [`transition-timing-function: ${easingCss(easing)}`],
    tailwind: [easingClass(easing)]
  }
}

const timing = (entry: TransitionEntry) =>
  [
    entry.duration === undefined ? "" : JSON.stringify(entry.duration),
    entry.easing === undefined ? "" : JSON.stringify(entry.easing),
    entry.delay === undefined ? "" : JSON.stringify(entry.delay)
  ].join("|")

/** How a list of transitions is written: as utilities, merged into one property list, or as one arbitrary value. */
export type TransitionForm = "none" | "utilities" | "merged" | "arbitrary"

export function transitionForm(entries: readonly TransitionEntry[]): TransitionForm {
  const on = entries.filter((entry) => !entry.off)
  if (on.length === 0) return "none"
  if (on.length === 1) return "utilities"
  return new Set(on.map(timing)).size === 1 ? "merged" : "arbitrary"
}

const storedEntry = (entry: TransitionEntry) => ({
  property: typeof entry.property === "string" ? { keyword: entry.property } : { value: entry.property.property },
  ...(entry.duration ? { duration: entry.duration } : {}),
  ...(entry.easing ? { easing: entry.easing } : {}),
  ...(entry.delay ? { delay: entry.delay } : {})
})

/**
 * Motion's Transitions. Tailwind takes one transition property, duration, easing and delay per element, so one entry
 * is utilities, entries with one timing merge into one property list, and entries with different timings are one
 * arbitrary value. An entry that's off isn't written. Saved as a transition token, which has no Tailwind namespace, the
 * list writes the token's variable.
 */
export function transitionsWrites(entries: readonly TransitionEntry[], savedAs?: string): Writes {
  if (savedAs !== undefined) {
    return {
      stored: { transitions: { token: `transition-${savedAs}` } },
      css: [`transition: var(--transition-${savedAs})`],
      tailwind: [`[transition:var(--transition-${savedAs})]`]
    }
  }
  const on = entries.filter((entry) => !entry.off)
  const form = transitionForm(entries)
  if (form === "none") return { stored: entries.length > 0 ? { transitions: [] } : undefined, css: [], tailwind: [] }
  const stored = {
    transitions: entries.map((entry) => ({ ...storedEntry(entry), ...(entry.off ? { off: true } : {}) }))
  }
  if (form === "arbitrary") {
    const parts = on.flatMap((entry) =>
      transitionProperties(entry.property).map((property) =>
        [
          property,
          `${timeMs(entry.duration) ?? defaultDuration}ms`,
          entry.easing ? easingCss(entry.easing) : "var(--default-transition-timing-function)",
          entry.delay ? `${timeMs(entry.delay)}ms` : ""
        ]
          .filter(Boolean)
          .join(" ")
      )
    )
    return {
      stored,
      css: [`transition: ${parts.join(", ")}`],
      tailwind: [`[transition:${arbitrary(parts.join(","))}]`]
    }
  }
  const first = on[0]!
  const properties = on.flatMap((entry) => transitionProperties(entry.property))
  const css = [`transition-property: ${properties.join(", ")}`]
  const tailwind: string[] = []
  if (form === "utilities" && typeof first.property === "string") tailwind.push(transitionSets[first.property].utility)
  else tailwind.push(`transition-[${properties.join(",")}]`)
  for (const part of [
    timeWrites("duration", first.duration),
    easingWrites(first.easing),
    timeWrites("delay", first.delay)
  ]) {
    css.push(...part.css)
    tailwind.push(...part.tailwind)
  }
  return { stored, css, tailwind }
}

/** Tailwind's fractions for a percentage, where it has one (50% is `1/2`), as call 10 writes them. */
function fraction(percent: number): string | undefined {
  if (percent === 100) return "full"
  for (const denominator of [2, 3, 4, 5, 6, 12]) {
    for (let numerator = 1; numerator < denominator; numerator++) {
      if (Math.abs((numerator / denominator) * 100 - percent) < 0.01) return `${numerator}/${denominator}`
    }
  }
  return undefined
}

const moveCss = (move: Move | undefined) => {
  if (move === undefined) return "0"
  return "px" in move ? `${move.px}px` : `${move.percent}%`
}

function moveClass(axis: "x" | "y", move: Move): string {
  const negative = ("px" in move ? move.px : move.percent) < 0
  const sign = negative ? "-" : ""
  if ("px" in move) {
    const size = Math.abs(move.px)
    const value = Number.isInteger(size * 4) ? String(size / 4) : `[${size}px]`
    return `${sign}translate-${axis}-${value}`
  }
  const share = fraction(Math.abs(move.percent))
  return `${sign}translate-${axis}-${share ?? `[${Math.abs(move.percent)}%]`}`
}

function moveStored(move: Move): { step: number } | { value: string } {
  if ("percent" in move) return { value: `${move.percent}%` }
  return Number.isInteger(move.px * 4) ? { step: move.px / 4 } : { value: `${move.px}px` }
}

const scaleClass = (prefix: string, percent: number) => {
  const sign = percent < 0 ? "-" : ""
  const size = Math.abs(percent)
  return `${sign}${prefix}-${Number.isInteger(size) ? size : `[${size}%]`}`
}

/** Transform's Move, Scale with its flips, and Origin: `translate`, `scale` and `transform-origin`. */
export function transformWrites(transform: TransformValue): Writes {
  const css: string[] = []
  const tailwind: string[] = []
  const stored: Record<string, unknown> = {}
  if (transform.moveX || transform.moveY) {
    stored.translate = {
      ...(transform.moveX ? { x: moveStored(transform.moveX) } : {}),
      ...(transform.moveY ? { y: moveStored(transform.moveY) } : {})
    }
    css.push(`translate: ${moveCss(transform.moveX)}${transform.moveY ? ` ${moveCss(transform.moveY)}` : ""}`)
    if (transform.moveX) tailwind.push(moveClass("x", transform.moveX))
    if (transform.moveY) tailwind.push(moveClass("y", transform.moveY))
  }
  // A flip is the scale on that axis made negative.
  const x = (transform.scaleX ?? 100) * (transform.flipX ? -1 : 1)
  const y = (transform.scaleY ?? 100) * (transform.flipY ? -1 : 1)
  if (x !== 100 || y !== 100) {
    stored.scale = { x: { step: x }, y: { step: y } }
    css.push(x === y ? `scale: ${x}%` : `scale: ${x}% ${y}%`)
    if (x === y) tailwind.push(scaleClass("scale", x))
    else {
      if (x !== 100) tailwind.push(scaleClass("scale-x", x))
      if (y !== 100) tailwind.push(scaleClass("scale-y", y))
    }
  }
  if (transform.origin) {
    const origin = positionWrites("origin", transform.origin)
    stored.origin = origin.stored
    css.push(...origin.css)
    tailwind.push(...origin.tailwind)
  }
  return { stored: Object.keys(stored).length > 0 ? stored : undefined, css, tailwind }
}

/** A position in a box: a spot by name (`origin-top-left`, `object-bottom`), or one off them (`object-[25%_75%]`). */
export function positionWrites(which: "origin" | "object", position: BoxPosition | undefined): Writes {
  if (position === undefined) return nothing
  const property = which === "origin" ? "transform-origin" : "object-position"
  const spot = spotName(position)
  if (spot) {
    return {
      stored: { keyword: spot },
      css: [`${property}: ${spot}`],
      tailwind: [`${which}-${spot.replace(" ", "-")}`]
    }
  }
  const value = `${position.x}% ${position.y}%`
  return { stored: { value }, css: [`${property}: ${value}`], tailwind: [`${which}-[${arbitrary(value)}]`] }
}

/** The easing presets and tokens in the order Up and Down step through them. */
export const easingOrder: Easing[] = [
  ...easingPresets.map((preset) => ({ keyword: preset.keyword })),
  ...easingTokens.map((token) => ({ token: token.name }))
]
