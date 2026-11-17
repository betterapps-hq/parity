/*
 * What Motion's, Transform's and Rotation's values are stored as and what they write, for the readout beside each
 * story, in the forms writes.ts uses: the stored value and the CSS. Lengths and the nine spots' keywords are written as
 * css-values.ts writes them for every other control.
 */
import { formatNumber, lengthForm } from "@parity-app/style-schema"
import { textValue } from "../../chrome/prop-values.ts"
import { arbitrary, type BoxPoint, lengthCss, spotKeywords } from "./css-values.ts"
import {
  type Angle,
  defaultDuration,
  type Easing,
  type Move,
  springLinear,
  type Time,
  timeMs,
  type TransformValue,
  type TransitionEntry,
  type TransitionProperty,
  transitionProperties
} from "./motion-data.ts"
import type { DurationToken } from "./tokens.ts"
import { noWrites, type StoredObject, type Writes } from "./writes.ts"

/** Position's Rotation: a step in degrees (`rotate: 45deg`), or a value of its own (`rotate: 22.5deg`). */
export function angleWrites(angle: Angle | undefined): Writes {
  if (angle === undefined) {
    return noWrites
  }

  return { stored: angle, css: [`rotate: ${"step" in angle ? `${angle.step}deg` : angle.value}`] }
}

/** A transition's duration or delay: a step in milliseconds, a token, or a value as read from code (`0.2s`). */
export function timeWrites(which: "duration" | "delay", time: Time | undefined): Writes {
  if (time === undefined) {
    return noWrites
  }

  const property = `transition-${which}`

  if ("step" in time) {
    return { stored: time, css: [`${property}: ${time.step}ms`] }
  }

  if ("token" in time) {
    return { stored: time, css: [`${property}: var(--${time.token})`] }
  }

  return { stored: time, css: [`${property}: ${time.value}`] }
}

/**
 * An easing as CSS writes it: a keyword as the project's token of its name, else CSS's keyword; the token's; the
 * curve; or a spring's `linear()`.
 */
export function easingCss(easing: Easing): string {
  if ("keyword" in easing) {
    return easing.keyword === "linear" ? "linear" : `var(--${easing.keyword}, ${easing.keyword})`
  }

  if ("token" in easing) {
    return `var(--${easing.token})`
  }

  if ("spring" in easing) {
    return springLinear(easing.spring)
  }

  return easing.value
}

/** The class an easing writes: `ease-out`, `ease-linear`, `ease-snappy`, or `ease-[…]`, as CSS's `ease` is. */
export function easingClass(easing: Easing): string {
  if ("keyword" in easing && easing.keyword !== "ease") {
    return `ease-${easing.keyword.replace(/^ease-/, "")}`
  }

  if ("token" in easing) {
    return easing.token
  }

  return `ease-[${arbitrary(easingCss(easing))}]`
}

/** Whether an easing's class runs long enough to offer Create token first, as a spring's `linear()` does. */
export const easingIsLong = (easing: Easing | undefined) => easing !== undefined && easingClass(easing).length > 60

/** A transition's easing. */
export function easingWrites(easing: Easing | undefined): Writes {
  if (easing === undefined) {
    return noWrites
  }

  return { stored: easing, css: [`transition-timing-function: ${easingCss(easing)}`] }
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

  if (on.length === 0) {
    return "none"
  }

  if (on.length === 1) {
    return "utilities"
  }

  return new Set(on.map(timing)).size === 1 ? "merged" : "arbitrary"
}

/** Whether a transition's property is one of Tailwind's sets (`colors`, `all`), rather than a property of its own. */
const isTransitionSet = (property: TransitionProperty): property is Extract<TransitionProperty, string> =>
  textValue.safeParse(property).success

/** A transition as stored: its property, its timing where it's set, and whether its eye is off. */
function storedEntry(entry: TransitionEntry): StoredObject {
  const stored: StoredObject = {
    property: isTransitionSet(entry.property) ? { keyword: entry.property } : { value: entry.property.property }
  }

  if (entry.duration) {
    stored.duration = entry.duration
  }

  if (entry.easing) {
    stored.easing = entry.easing
  }

  if (entry.delay) {
    stored.delay = entry.delay
  }

  if (entry.off) {
    stored.off = true
  }

  return stored
}

/**
 * Motion's Transitions. Tailwind takes one transition property, duration, easing and delay per element, so one entry
 * is utilities, entries with one timing merge into one property list, and entries with different timings are one
 * arbitrary value. An entry that's off isn't written. Saved as a transition token, which has no Tailwind namespace, the
 * list writes the token's variable. A duration token is read among the project's `durations`.
 */
export function transitionsWrites(
  entries: readonly TransitionEntry[],
  durations: readonly DurationToken[],
  savedAs?: string
): Writes {
  if (savedAs !== undefined) {
    return {
      stored: { transitions: { token: `transition-${savedAs}` } },
      css: [`transition: var(--transition-${savedAs})`]
    }
  }

  const on = entries.filter((entry) => !entry.off)
  const form = transitionForm(entries)

  if (form === "none") {
    return { stored: entries.length > 0 ? { transitions: [] } : undefined, css: [] }
  }

  const stored = { transitions: entries.map(storedEntry) }

  if (form === "arbitrary") {
    const parts = on.flatMap((entry) =>
      transitionProperties(entry.property).map((property) =>
        [
          property,
          `${timeMs(entry.duration, durations) ?? defaultDuration(durations)}ms`,
          entry.easing ? easingCss(entry.easing) : "var(--default-transition-timing-function, ease)",
          entry.delay ? `${timeMs(entry.delay, durations)}ms` : ""
        ]
          .filter(Boolean)
          .join(" ")
      )
    )

    return { stored, css: [`transition: ${parts.join(", ")}`] }
  }

  const first = on[0]!
  const properties = on.flatMap((entry) => transitionProperties(entry.property))
  const css = [`transition-property: ${properties.join(", ")}`]

  for (const part of [
    timeWrites("duration", first.duration),
    easingWrites(first.easing),
    timeWrites("delay", first.delay)
  ]) {
    css.push(...part.css)
  }

  return { stored, css }
}

/** A move as CSS writes it: a length as every length is written (a spacing step where it's one), or its percentage. */
const moveCss = (move: Move | undefined) => {
  if (move === undefined) {
    return "0"
  }

  return "px" in move ? lengthCss(move.px) : `${formatNumber(move.percent)}%`
}

function moveStored(move: Move): { step: number } | { value: string } {
  if ("percent" in move) {
    return { value: `${formatNumber(move.percent)}%` }
  }

  return lengthForm(move.px)
}

/** Transform's Move, Scale with its flips, and Origin: `translate`, `scale` and `transform-origin`. */
export function transformWrites(transform: TransformValue): Writes {
  const css: string[] = []
  const stored: StoredObject = {}

  if (transform.moveX || transform.moveY) {
    const translate: StoredObject = {}

    if (transform.moveX) {
      translate.x = moveStored(transform.moveX)
    }

    if (transform.moveY) {
      translate.y = moveStored(transform.moveY)
    }

    stored.translate = translate
    css.push(`translate: ${moveCss(transform.moveX)}${transform.moveY ? ` ${moveCss(transform.moveY)}` : ""}`)
  }

  // A flip is the scale on that axis made negative.
  const x = (transform.scaleX ?? 100) * (transform.flipX ? -1 : 1)
  const y = (transform.scaleY ?? 100) * (transform.flipY ? -1 : 1)

  if (x !== 100 || y !== 100) {
    stored.scale = { x: { step: x }, y: { step: y } }
    css.push(x === y ? `scale: ${x}%` : `scale: ${x}% ${y}%`)
  }

  if (transform.origin) {
    const origin = positionWrites("origin", transform.origin)
    stored.origin = origin.stored
    css.push(...origin.css)
  }

  return { stored: Object.keys(stored).length > 0 ? stored : undefined, css }
}

/** A position in a box: a spot by name (`top left`, `bottom`), or one off them (`25% 75%`). */
export function positionWrites(which: "origin" | "object", position: BoxPoint | undefined): Writes {
  if (position === undefined) {
    return noWrites
  }

  const property = which === "origin" ? "transform-origin" : "object-position"
  const spot = spotKeywords(position)

  if (spot) {
    return { stored: { keyword: spot }, css: [`${property}: ${spot}`] }
  }

  const value = `${formatNumber(position.x)}% ${formatNumber(position.y)}%`

  return { stored: { value }, css: [`${property}: ${value}`] }
}
