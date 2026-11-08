/*
 * The values Motion, Transform and Position's Rotation hold (PAR-652's Angle, Time, Easing and spring, Transition
 * list, Transform and Position in a box), in its value forms: a step where the utility takes a bare number, a token, a
 * value of its own as typed or read from code, and a spring, kept as its settings since the `linear()` it writes can't
 * be read back into them.
 */

/** An angle: whole degrees as a step (`rotate-45`), or a value of its own as typed or read (`22.5deg`, `0.25turn`). */
export type Angle = { step: number } | { value: string }

/** Degrees in each unit an angle is typed or read in. */
export const angleUnits: Record<string, number> = { deg: 1, turn: 360, rad: 180 / Math.PI, grad: 0.9 }

/** A number and its unit, as `0.25turn` or `200ms` is written. */
export function splitUnit(text: string): { number: number; unit: string } | undefined {
  const match = /^\s*(-?\d*\.?\d+)\s*([a-z%]*)\s*$/i.exec(text)
  if (!match) return undefined
  return { number: Number(match[1]), unit: match[2]!.toLowerCase() }
}

const round = (number: number, places = 2) => Number(number.toFixed(places))

export function angleDegrees(angle: Angle | undefined): number {
  if (angle === undefined) return 0
  if ("step" in angle) return angle.step
  const split = splitUnit(angle.value)
  if (!split) return 0
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
export const timeUnits: Record<string, number> = { ms: 1, s: 1000 }

export interface DurationToken {
  name: string
  ms: number
}

/** A project's duration tokens; a project without them leaves every whole millisecond unmarked. */
export const durationTokens: DurationToken[] = [
  { name: "duration-fast", ms: 150 },
  { name: "duration-normal", ms: 250 },
  { name: "duration-slow", ms: 400 }
]

export function timeMs(time: Time | undefined, tokens: readonly DurationToken[] = durationTokens): number | undefined {
  if (time === undefined) return undefined
  if ("step" in time) return time.step
  if ("token" in time) return tokens.find((token) => token.name === time.token)?.ms
  const split = splitUnit(time.value)
  if (!split) return undefined
  return round(split.number * (timeUnits[split.unit || "ms"] ?? 1))
}

/** Tailwind v4's `--default-transition-duration`, which a transition with no duration of its own takes. */
export const defaultDuration = 150

/** A cubic Bézier's two handles, as `cubic-bezier(x1, y1, x2, y2)` takes them. */
export type Bezier = [number, number, number, number]

/** A spring: by the time it takes and how much it bounces, or by its physics, as Framer's are set. */
export type Spring = { duration: number; bounce: number } | { stiffness: number; damping: number; mass: number }

/**
 * An easing: Tailwind's own (`ease-out`, `ease-linear`), a project token (`ease-snappy`), a curve or steps of its own,
 * or a spring.
 */
export type Easing = { keyword: EasingKeyword } | { token: string } | { value: string } | { spring: Spring }

export type EasingKeyword = "linear" | "ease-in" | "ease-out" | "ease-in-out"

/** Tailwind v4's easings, as its theme defines them. */
export const easingPresets: { keyword: EasingKeyword; label: string; curve: Bezier }[] = [
  { keyword: "linear", label: "Linear", curve: [0, 0, 1, 1] },
  { keyword: "ease-in", label: "Ease in", curve: [0.4, 0, 1, 1] },
  { keyword: "ease-out", label: "Ease out", curve: [0, 0, 0.2, 1] },
  { keyword: "ease-in-out", label: "Ease in out", curve: [0.4, 0, 0.2, 1] }
]

/** Tailwind v4's `--default-transition-timing-function`, which a transition with no easing of its own takes. */
export const defaultCurve: Bezier = [0.4, 0, 0.2, 1]

export interface EasingToken {
  name: string
  curve?: Bezier
  spring?: Spring
}

/** The project's easing tokens. */
export const easingTokens: EasingToken[] = [
  { name: "ease-snappy", curve: [0.2, 0.8, 0.2, 1] },
  { name: "ease-gentle", curve: [0.33, 0, 0.15, 1] }
]

/** What an easing draws: a curve, a staircase, or a spring's samples. */
export type EasingShape =
  | { kind: "bezier"; curve: Bezier }
  | { kind: "steps"; count: number; jump: "start" | "end" }
  | { kind: "samples"; values: number[] }

/** `cubic-bezier(…)` or `steps(…)` read, or nothing when it's neither. */
export function readEasingValue(text: string): EasingShape | undefined {
  const bezier = /^cubic-bezier\(\s*([^)]*)\)$/i.exec(text.trim())
  if (bezier) {
    const numbers = bezier[1]!.split(",").map((part) => Number(part.trim()))
    if (numbers.length !== 4 || numbers.some((number) => !Number.isFinite(number))) return undefined
    if (numbers[0]! < 0 || numbers[0]! > 1 || numbers[2]! < 0 || numbers[2]! > 1) return undefined
    return { kind: "bezier", curve: numbers as Bezier }
  }
  const steps = /^steps\(\s*(\d+)\s*(?:,\s*(jump-start|start|jump-end|end)\s*)?\)$/i.exec(text.trim())
  if (steps && Number(steps[1]) > 0) {
    const jump = steps[2]?.toLowerCase().endsWith("start") ? "start" : "end"
    return { kind: "steps", count: Number(steps[1]), jump }
  }
  return undefined
}

export function easingShape(easing: Easing | undefined, tokens: readonly EasingToken[] = easingTokens): EasingShape {
  if (easing === undefined) return { kind: "bezier", curve: defaultCurve }
  if ("keyword" in easing) {
    return { kind: "bezier", curve: easingPresets.find((preset) => preset.keyword === easing.keyword)!.curve }
  }
  if ("spring" in easing) return { kind: "samples", values: springSamples(easing.spring) }
  if ("token" in easing) {
    const token = tokens.find((other) => other.name === easing.token)
    if (token?.spring) return { kind: "samples", values: springSamples(token.spring) }
    return { kind: "bezier", curve: token?.curve ?? defaultCurve }
  }
  return readEasingValue(easing.value) ?? { kind: "bezier", curve: defaultCurve }
}

/** An easing in words: its preset's name, its token's, Steps 4, Spring 400ms, or Custom. */
export function easingName(easing: Easing | undefined): string {
  if (easing === undefined) return "Default"
  if ("keyword" in easing) return easingPresets.find((preset) => preset.keyword === easing.keyword)!.label
  if ("token" in easing) return easing.token.replace(/^ease-/, "")
  if ("spring" in easing) {
    const spring = easing.spring
    if ("duration" in spring) return `Spring ${spring.duration}ms, bounce ${spring.bounce}`
    return `Spring ${spring.stiffness}/${spring.damping}/${spring.mass}`
  }
  const shape = readEasingValue(easing.value)
  if (shape?.kind === "steps") return `Steps ${shape.count}`
  return "Custom"
}

export const bezierCss = (curve: Bezier) => `cubic-bezier(${curve.map((number) => round(number)).join(", ")})`

/* A spring, solved: how far it's moved at a time, how long it takes to settle, and the `linear()` that draws it. */

/** It's settled once it stays within a thousandth of where it's going. */
const settledWithin = 0.001

/** How far along a spring is at `t` seconds, 0 to 1 with overshoot, for its damping ratio and natural frequency. */
function springAt(t: number, zeta: number, omega: number): number {
  if (Math.abs(zeta - 1) < 1e-6) return 1 - Math.exp(-omega * t) * (1 + omega * t)
  if (zeta < 1) {
    const damped = omega * Math.sqrt(1 - zeta * zeta)
    return 1 - Math.exp(-zeta * omega * t) * (Math.cos(damped * t) + ((zeta * omega) / damped) * Math.sin(damped * t))
  }
  const spread = omega * Math.sqrt(zeta * zeta - 1)
  const ratio = (zeta * omega) / spread
  return (
    1 -
    0.5 * ((1 + ratio) * Math.exp((-zeta * omega + spread) * t) + (1 - ratio) * Math.exp((-zeta * omega - spread) * t))
  )
}

const settleTimes = new Map<number, number>()

/** Seconds a spring takes to settle, at a natural frequency of 1, worked out once per damping ratio. */
function settleAtUnitFrequency(zeta: number): number {
  const known = settleTimes.get(zeta)
  if (known !== undefined) return known
  // The slowest part of its motion decays at this rate, so it has settled well before ten of these.
  const decay = zeta < 1 ? zeta : zeta - Math.sqrt(zeta * zeta - 1)
  const until = 10 / decay
  const step = until / 20000
  let last = 0
  for (let t = 0; t < until; t += step) {
    if (Math.abs(springAt(t, zeta, 1) - 1) > settledWithin) last = t
  }
  settleTimes.set(zeta, last)
  return last
}

/** The damping ratio and natural frequency, in radians a second, of a spring however it's set. */
function solve(spring: Spring): { zeta: number; omega: number } {
  if ("duration" in spring) {
    // Bounce 0 is critically damped, and each step toward 1 lets it overshoot further.
    const zeta = Math.max(0.05, 1 - spring.bounce)
    return { zeta, omega: settleAtUnitFrequency(zeta) / (spring.duration / 1000) }
  }
  const omega = Math.sqrt(spring.stiffness / spring.mass)
  return { zeta: spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass)), omega }
}

/** How long a spring takes to settle, in whole milliseconds: what a transition's duration is when it has one. */
export function springSettle(spring: Spring): number {
  if ("duration" in spring) return spring.duration
  const { zeta, omega } = solve(spring)
  return Math.round((settleAtUnitFrequency(zeta) / omega) * 1000)
}

/** Where the spring is at even steps through its settle time, from 0 to exactly 1. */
export function springSamples(spring: Spring): number[] {
  const { zeta, omega } = solve(spring)
  const seconds = springSettle(spring) / 1000
  const count = Math.min(60, Math.max(16, Math.round((seconds * 1000) / 16)))
  return Array.from({ length: count + 1 }, (_, index) =>
    index === count ? 1 : round(springAt((index / count) * seconds, zeta, omega), 3)
  )
}

/** The spring as CSS draws it: `linear()` through its samples, over its settle time. */
export const springLinear = (spring: Spring): string => `linear(${springSamples(spring).join(", ")})`

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

export function transitionLabel(property: TransitionProperty): string {
  return typeof property === "string" ? transitionSets[property].label : property.property
}

export function transitionProperties(property: TransitionProperty): readonly string[] {
  return typeof property === "string" ? transitionSets[property].properties : [property.property]
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
  origin?: BoxPosition
}

/* Position in a box. */

/** A position in a box, as percentages from its top left: the nine spots are 0, 50 and 100 on each axis. */
export interface BoxPosition {
  x: number
  y: number
}

export const spotValues = [0, 50, 100] as const

const horizontal: Record<number, string> = { 0: "left", 50: "center", 100: "right" }
const vertical: Record<number, string> = { 0: "top", 50: "center", 100: "bottom" }

/** The spot's name in CSS's words (`top left`, `center`), or nothing for a position off the spots. */
export function spotName(position: BoxPosition): string | undefined {
  const x = horizontal[position.x]
  const y = vertical[position.y]
  if (x === undefined || y === undefined) return undefined
  if (x === "center" && y === "center") return "center"
  if (x === "center") return y
  if (y === "center") return x
  return `${y} ${x}`
}
