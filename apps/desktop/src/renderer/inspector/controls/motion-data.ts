/*
 * The values Motion, Transform and Position's Rotation hold (PAR-652's Angle, Time, Easing and spring, Transition
 * list and Transform), in its value forms: a step where the utility takes a bare number, a token, a value of its own as
 * typed or read from code, and a spring, kept as its settings since the `linear()` it writes can't be read back into
 * them. Functions that look a token up take the project's tokens, so a token made with Create token is found too.
 */
import { springLinear, springSamples, springSettle } from "@parity-app/core"
import {
  type Bezier,
  easingBeziers,
  type EasingPlot,
  formatNumber,
  isReadFailure,
  plotCss,
  readEasingFunction
} from "@parity-app/style-schema"
import { type BoxPoint } from "./css-values.ts"
import type { DurationToken, EasingToken } from "./tokens.ts"

/** A number to `places` decimals, as a value is kept. */
const round = (number: number, places = 2) => Number(formatNumber(number, places))

/** An angle: whole degrees as a step (`rotate-45`), or a value of its own as typed or read (`22.5deg`, `0.25turn`). */
export type Angle = { step: number } | { value: string }

/** How many of a base unit (degrees, milliseconds) each unit a value is typed or read in comes to. */
interface UnitScale {
  readonly [unit: string]: number
}

/** Degrees in each unit an angle is typed or read in. */
export const angleUnits: UnitScale = { deg: 1, turn: 360, rad: 180 / Math.PI, grad: 0.9 }

/** A number and its unit, as `0.25turn` or `200ms` is written. */
export function splitUnit(text: string): { number: number; unit: string } | undefined {
  const match = /^\s*(-?\d*\.?\d+)\s*([a-z%]*)\s*$/i.exec(text)

  if (!match) {
    return undefined
  }

  return { number: Number(match[1]), unit: match[2]!.toLowerCase() }
}

export function angleDegrees(angle: Angle | undefined): number {
  if (angle === undefined) {
    return 0
  }

  if ("step" in angle) {
    return angle.step
  }

  const split = splitUnit(angle.value)

  if (!split) {
    return 0
  }

  return round(split.number * (angleUnits[split.unit || "deg"] ?? 1))
}

/** An angle in degrees in its simplest form: whole degrees are a step. */
export const angleOf = (degrees: number): Angle =>
  Number.isInteger(degrees) ? { step: degrees } : { value: `${round(degrees)}deg` }

/**
 * A time: whole milliseconds as a step (`duration-200`), a duration token, or a value as read from code (`0.2s`), kept
 * in its unit until it's edited. A value off the system can be allowed here, with why.
 */
export type Time = { step: number; allow?: string } | { token: string } | { value: string; allow?: string }

/** Milliseconds in each unit a time is typed or read in. */
export const timeUnits: UnitScale = { ms: 1, s: 1000 }

/** A time in milliseconds, its token's among the project's `tokens`; nothing for unset or a token it doesn't have. */
export function timeMs(time: Time | undefined, tokens: readonly DurationToken[]): number | undefined {
  if (time === undefined) {
    return undefined
  }

  if ("step" in time) {
    return time.step
  }

  if ("token" in time) {
    return tokens.find((token) => token.name === time.token)?.ms
  }

  const split = splitUnit(time.value)

  if (!split) {
    return undefined
  }

  return round(split.number * (timeUnits[split.unit || "ms"] ?? 1))
}

/** Tailwind v4's `--default-transition-duration`, which a transition with no duration of its own takes. */
export const defaultDuration = 150

/** A spring: by the time it takes and how much it bounces, or by its physics, as Framer's are set. */
export type Spring = { duration: number; bounce: number } | { stiffness: number; damping: number; mass: number }

/**
 * An easing: Tailwind's own (`ease-out`, `ease-linear`), a project token (`ease-snappy`), a curve or steps of its own,
 * or a spring.
 */
export type Easing = { keyword: EasingKeyword } | { token: string } | { value: string } | { spring: Spring }

export type EasingKeyword = "linear" | "ease-in" | "ease-out" | "ease-in-out"

/** Tailwind v4's easings as the panel offers them, by name, each drawn from the package's one table of curves. */
export const easingPresets: { keyword: EasingKeyword; label: string; curve: Bezier }[] = [
  { keyword: "linear", label: "Linear", curve: easingBeziers.linear },
  { keyword: "ease-in", label: "Ease in", curve: easingBeziers["ease-in"] },
  { keyword: "ease-out", label: "Ease out", curve: easingBeziers["ease-out"] },
  { keyword: "ease-in-out", label: "Ease in out", curve: easingBeziers["ease-in-out"] }
]

/** Tailwind v4's `--default-transition-timing-function`, which a transition with no easing of its own takes. */
export const defaultCurve: Bezier = [0.4, 0, 0.2, 1]

/** `cubic-bezier(…)` or `steps(…)` as what it draws, or nothing when it's neither. */
export function easingValuePlot(text: string): EasingPlot | undefined {
  const plot = readEasingFunction(text)

  return isReadFailure(plot) ? undefined : plot
}

/** A preset's curve, from the one table. */
const presetCurve = (keyword: EasingKeyword): Bezier =>
  easingPresets.find((preset) => preset.keyword === keyword)!.curve

/** What an easing draws, its token's among the project's `tokens`; Tailwind's default curve for unset. */
export function easingPlot(easing: Easing | undefined, tokens: readonly EasingToken[]): EasingPlot {
  if (easing === undefined) {
    return { kind: "bezier", curve: defaultCurve }
  }

  if ("keyword" in easing) {
    return { kind: "bezier", curve: presetCurve(easing.keyword) }
  }

  if ("spring" in easing) {
    return { kind: "samples", values: springSamples(easing.spring) }
  }

  if ("token" in easing) {
    const token = tokens.find((other) => other.name === easing.token)

    if (token?.spring) {
      return { kind: "samples", values: springSamples(token.spring) }
    }

    return { kind: "bezier", curve: token?.curve ?? defaultCurve }
  }

  return easingValuePlot(easing.value) ?? { kind: "bezier", curve: defaultCurve }
}

/**
 * An easing as a preview's CSS draws it: the curve's own numbers, steps or a spring's `linear()`, rather than a
 * variable the page may not have, so Tailwind's presets and the project's tokens move as they're defined.
 */
export function drawnEasing(easing: Easing | undefined, tokens: readonly EasingToken[]): string {
  return plotCss(easingPlot(easing, tokens))
}

/** An easing in words: its preset's name, its token's, Steps 4, Spring 400ms, or Custom. */
export function easingName(easing: Easing | undefined): string {
  if (easing === undefined) {
    return "Default"
  }

  if ("keyword" in easing) {
    return easingPresets.find((preset) => preset.keyword === easing.keyword)!.label
  }

  if ("token" in easing) {
    return easing.token.replace(/^ease-/, "")
  }

  if ("spring" in easing) {
    const spring = easing.spring

    if ("duration" in spring) {
      return `Spring ${spring.duration}ms, bounce ${spring.bounce}`
    }

    return `Spring ${spring.stiffness}/${spring.damping}/${spring.mass}`
  }

  const plot = easingValuePlot(easing.value)

  if (plot?.kind === "steps") {
    return `Steps ${plot.count}`
  }

  return "Custom"
}

/* A spring is solved in `@parity-app/core`, which draws it on the canvas too. */
export { springLinear, springSamples, springSettle }

/* Transitions. */

/** What a transition changes: one of Tailwind's sets, or a property of its own. */
export type TransitionProperty = "all" | "colors" | "opacity" | "transform" | "shadow" | { property: string }

export interface TransitionEntry {
  id: string
  property: TransitionProperty
  duration?: Time
  easing?: Easing
  delay?: Time
  /** Turned off with the eye: kept in the file, not drawn or written. */
  off?: boolean
}

export const transitionSets = {
  all: { label: "All", properties: ["all"], utility: "transition-all" },
  colors: {
    label: "Colors",
    properties: [
      "color",
      "background-color",
      "border-color",
      "outline-color",
      "text-decoration-color",
      "fill",
      "stroke",
      "--tw-gradient-from",
      "--tw-gradient-via",
      "--tw-gradient-to"
    ],
    utility: "transition-colors"
  },
  opacity: { label: "Opacity", properties: ["opacity"], utility: "transition-opacity" },
  transform: {
    label: "Transform",
    properties: ["transform", "translate", "scale", "rotate"],
    utility: "transition-transform"
  },
  shadow: { label: "Shadow", properties: ["box-shadow"], utility: "transition-shadow" }
} as const

/** The set of Tailwind's a transition changes, or for a property of its own, a set of that one named after it. */
function transitionSet(property: TransitionProperty) {
  switch (property) {
    case "all":
    case "colors":
    case "opacity":
    case "transform":
    case "shadow":
      return transitionSets[property]
    default:
      return { label: property.property, properties: [property.property] }
  }
}

export function transitionLabel(property: TransitionProperty): string {
  return transitionSet(property).label
}

export function transitionProperties(property: TransitionProperty): readonly string[] {
  return transitionSet(property).properties
}

/* Transform. */

/** A move on one axis: pixels, or a percentage of the layer's own size. */
export type Move = { px: number } | { percent: number }

export interface TransformValue {
  moveX?: Move
  moveY?: Move
  /** Scale on each axis, in percent; unset is 100. */
  scaleX?: number
  scaleY?: number
  /** Whether X and Y scale together, as Width and Height do with the aspect lock. */
  scaleLinked?: boolean
  flipX?: boolean
  flipY?: boolean
  origin?: BoxPoint
}
