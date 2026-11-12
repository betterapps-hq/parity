import { z } from "zod"
import { finiteNumber, stored } from "./stored.ts"
import { off, stepForm, token, tokenForm, valueForm } from "./value.ts"

/*
 * A layer's transitions, and what they come to in CSS: the properties each of Tailwind's sets changes, its easings'
 * curves, a spring solved into the `linear()` it's drawn with, and a layer's transitions as one `transition` value.
 */

/** Tailwind's transition sets, each a list of properties: `transition-colors` changes color, background and the rest. */
export const transitionSets = ["all", "colors", "opacity", "transform", "shadow"] as const

/** Tailwind's own easings, whose curves its theme defines as `--ease-in` and the like (`linear` is CSS's). */
export const easingKeywords = ["linear", "ease-in", "ease-out", "ease-in-out"] as const

/** A time: whole or part milliseconds (`{ step: 200 }` is `duration-200`), or a duration token. */
const time = z.union([stepForm, tokenForm], "expected { step } in milliseconds or { token }")

export type Time = z.infer<typeof time>

/** A spring, by the time it takes and how much it bounces (0 to 1), or by its physics, as Framer's are set. */
const spring = z.union([
  stored({ duration: finiteNumber, bounce: finiteNumber }),
  stored({ stiffness: finiteNumber, damping: finiteNumber, mass: finiteNumber })
])

export type Spring = z.infer<typeof spring>

/**
 * An easing: one of Tailwind's (`{ keyword: "ease-out" }`), an easing token (`{ token: "ease-snappy" }`), a curve or
 * steps of its own (`{ value: "cubic-bezier(0.2, 0.8, 0.2, 1)" }`, `{ value: "steps(4)" }`), or a spring.
 */
const easing = z.union(
  [stored({ keyword: z.enum(easingKeywords) }), tokenForm, valueForm, stored({ spring })],
  "expected { keyword }, { token }, { value } or { spring }"
)

export type Easing = z.infer<typeof easing>

export const transition = stored({
  /** One of Tailwind's sets (`colors`), or a CSS property of its own (`width`). */
  property: z.string().regex(/^-?-?[a-z][a-z0-9-]*$/i, "expected a transition set or a CSS property, such as width"),
  /** Tailwind's 150ms when unset. A spring's settle time is its duration. */
  duration: time.optional(),
  /** Tailwind's default curve when unset. */
  easing: easing.optional(),
  delay: time.optional(),
  off
})

/** How one property, or one of Tailwind's sets of them, changes when the layer's style does. */
export type Transition = z.infer<typeof transition>

/** The properties each of Tailwind v4's transition sets changes, as its `transition-*` utilities list them. */
export const transitionSetProperties: Record<TransitionSet, readonly string[]> = {
  all: ["all"],
  colors: [
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
  opacity: ["opacity"],
  transform: ["transform", "translate", "scale", "rotate"],
  shadow: ["box-shadow"]
}

export type TransitionSet = (typeof transitionSets)[number]

export type EasingKeyword = (typeof easingKeywords)[number]

/** Whether a transition's property is one of Tailwind's sets, rather than a property of its own. */
export function isTransitionSet(property: string): property is TransitionSet {
  return transitionSets.some((set) => set === property)
}

export function isEasingKeyword(easing: string): easing is EasingKeyword {
  return easingKeywords.some((keyword) => keyword === easing)
}

/** The CSS properties a transition changes: its set's, or its own. */
export function transitionProperties(property: string): readonly string[] {
  return isTransitionSet(property) ? transitionSetProperties[property] : [property]
}

/**
 * Tailwind v4's easing curves, as its theme defines them. They differ from CSS's keywords of the same names, so where
 * the project doesn't define the variable, these numbers draw it.
 */
export const easingCurves: Record<EasingKeyword, string> = {
  linear: "linear",
  "ease-in": "cubic-bezier(0.4, 0, 1, 1)",
  "ease-out": "cubic-bezier(0, 0, 0.2, 1)",
  "ease-in-out": "cubic-bezier(0.4, 0, 0.2, 1)"
}

/** Tailwind v4's `--default-transition-duration`, in milliseconds. */
export const defaultTransitionDuration = 150

/** Tailwind v4's `--default-transition-timing-function`. */
export const defaultTransitionEasing = "cubic-bezier(0.4, 0, 0.2, 1)"

/** Whether an easing is a curve or steps of its own, written as CSS, rather than a keyword or a token's name. */
export const isEasingFunction = (easing: string) => /^(cubic-bezier|steps|linear)\(/i.test(easing.trim())

/** A time as CSS: milliseconds, or its token's variable. */
export function timeCss(time: Time): string {
  return "token" in time ? token(time.token) : `${time.step}ms`
}

/** Whether an easing is a spring, rather than a keyword, a token or a curve of its own. */
export const isSpring = (easing: Easing): easing is { spring: Spring } => "spring" in easing

/** An easing as CSS: Tailwind's variable with its curve to fall back on, the token's, the curve, or a spring's. */
export function easingCss(easing: Easing): string {
  if (isSpring(easing)) {
    return springLinear(easing.spring)
  }

  if ("token" in easing) {
    return token(easing.token)
  }

  if ("value" in easing) {
    return easing.value
  }

  return easing.keyword === "linear" ? "linear" : `var(--${easing.keyword}, ${easingCurves[easing.keyword]})`
}

/**
 * A layer's transitions as one CSS `transition` value, leaving out hidden ones; undefined when none is on.
 * Unset times and easings are Tailwind's defaults, which a project can change, and a spring's settle time is how long
 * its transition takes.
 */
export function transitionCss(transitions: readonly Transition[] | undefined): string | undefined {
  const parts = (transitions ?? [])
    .filter((transition) => !transition.off)
    .flatMap((transition) => {
      const spring =
        transition.easing !== undefined && isSpring(transition.easing) ? transition.easing.spring : undefined

      let duration = `var(--default-transition-duration, ${defaultTransitionDuration}ms)`

      if (spring) {
        duration = `${springSettle(spring)}ms`
      } else if (transition.duration !== undefined) {
        duration = timeCss(transition.duration)
      }

      const easing =
        transition.easing === undefined
          ? `var(--default-transition-timing-function, ${defaultTransitionEasing})`
          : easingCss(transition.easing)

      const delay = transition.delay === undefined ? "" : ` ${timeCss(transition.delay)}`

      return transitionProperties(transition.property).map((property) => `${property} ${duration} ${easing}${delay}`)
    })

  return parts.length > 0 ? parts.join(", ") : undefined
}

/* A spring, solved: how far it's moved at a time, how long it takes to settle, and the `linear()` that draws it. */

/** It's settled once it stays within a thousandth of where it's going. */
const settledWithin = 0.001

/** A number to three decimals. */
const round = (number: number) => Math.round(number * 1000) / 1000

/** How far along a spring is at `t` seconds, 0 to 1 with overshoot, for its damping ratio and natural frequency. */
function springAt(t: number, zeta: number, omega: number): number {
  if (Math.abs(zeta - 1) < 1e-6) {
    return 1 - Math.exp(-omega * t) * (1 + omega * t)
  }

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

  if (known !== undefined) {
    return known
  }

  // The slowest part of its motion decays at this rate, so it has settled well before ten of these.
  const decay = zeta < 1 ? zeta : zeta - Math.sqrt(zeta * zeta - 1)
  const until = 10 / decay
  const step = until / 20000
  let last = 0

  for (let t = 0; t < until; t += step) {
    if (Math.abs(springAt(t, zeta, 1) - 1) > settledWithin) {
      last = t
    }
  }

  settleTimes.set(zeta, last)

  return last
}

/** The damping ratio and natural frequency, in radians a second, of a spring however it's set. */
function solve(spring: Spring) {
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
  if ("duration" in spring) {
    return spring.duration
  }

  const { zeta, omega } = solve(spring)

  return Math.round((settleAtUnitFrequency(zeta) / omega) * 1000)
}

/** Where the spring is at even steps through its settle time, from 0 to exactly 1. */
export function springSamples(spring: Spring): number[] {
  const { zeta, omega } = solve(spring)
  const seconds = springSettle(spring) / 1000
  const count = Math.min(60, Math.max(16, Math.round((seconds * 1000) / 16)))

  return Array.from({ length: count + 1 }, (_, index) =>
    index === count ? 1 : round(springAt((index / count) * seconds, zeta, omega))
  )
}

/** The spring as CSS draws it: `linear()` through its samples, over its settle time. */
export const springLinear = (spring: Spring): string => `linear(${springSamples(spring).join(", ")})`
