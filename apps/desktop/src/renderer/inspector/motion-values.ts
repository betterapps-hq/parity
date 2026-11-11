import {
  isEasingFunction,
  isEasingKeyword,
  isSpring,
  isTimeToken,
  isTransitionSet,
  type Transition
} from "@parity-app/core"
import { defaultValues, previewKind, type Token } from "@parity-app/tokens"
import { z } from "zod"
import { readEasingValue, splitUnit, type Time, timeMs, type TransitionEntry } from "./controls/motion-data.ts"
import { durationToken, type DurationToken, easingToken, type EasingToken } from "./controls/tokens.ts"

/*
 * Motion's transitions between the forms `NodeStyle` holds them in and the forms the Transition list edits: a time is
 * milliseconds or a duration token's name, and an easing is one of Tailwind's, a token's name, a curve of its own or a
 * spring. The control's other forms come back as one of these: `0.2s` as 200 milliseconds.
 */

/** A layer's transitions as the Transition list's entries, without the ids it keys its rows by. */
export function entriesOf(transitions: readonly Transition[] | undefined): Omit<TransitionEntry, "id">[] {
  return (transitions ?? []).map((transition) => {
    const entry: Omit<TransitionEntry, "id"> = {
      property: isTransitionSet(transition.property) ? transition.property : { property: transition.property }
    }

    if (transition.duration !== undefined) {
      entry.duration = timeOf(transition.duration)
    }

    if (transition.easing !== undefined) {
      const easing = transition.easing

      if (isSpring(easing)) {
        entry.easing = { spring: easing.spring }
      } else if (isEasingKeyword(easing)) {
        entry.easing = { keyword: easing }
      } else {
        entry.easing = isEasingFunction(easing) ? { value: easing } : { token: easing }
      }
    }

    if (transition.delay !== undefined) {
      entry.delay = timeOf(transition.delay)
    }

    if (transition.off) {
      entry.off = true
    }

    return entry
  })
}

/** A time as the Time field holds it: whole milliseconds as a step, part milliseconds as typed, or a token. */
function timeOf(time: number | string): Time {
  if (isTimeToken(time)) {
    return { token: time }
  }

  return Number.isInteger(time) ? { step: time } : { value: `${time}ms` }
}

/** What changes, as the Transition list holds it: one of Tailwind's sets by name, or a property of its own. */
const setName = z.string()
const propertyName = z.object({ property: z.string() })

/** The Transition list's entries as a layer's transitions; nothing once the list is empty, which clears them. */
export function transitionsOf(entries: readonly TransitionEntry[]): Transition[] | undefined {
  if (entries.length === 0) {
    return undefined
  }

  return entries.map((entry) => {
    const transition: Transition = {
      property: setName.safeParse(entry.property).data ?? propertyName.parse(entry.property).property
    }

    const duration = storedTime(entry.duration)

    if (duration !== undefined) {
      transition.duration = duration
    }

    if (entry.easing !== undefined) {
      const easing = entry.easing

      if ("spring" in easing) {
        transition.easing = { spring: easing.spring }
      } else if ("keyword" in easing) {
        transition.easing = easing.keyword
      } else {
        transition.easing = "token" in easing ? easing.token : easing.value
      }
    }

    const delay = storedTime(entry.delay)

    if (delay !== undefined) {
      transition.delay = delay
    }

    if (entry.off) {
      transition.off = true
    }

    return transition
  })
}

/** A time as `NodeStyle` holds it: a token's name, or milliseconds, whatever unit it was typed or read in. */
function storedTime(time: Time | undefined): number | string | undefined {
  if (time === undefined) {
    return undefined
  }

  return "token" in time ? time.token : timeMs(time, [])
}

/**
 * The project's durations and easings as Motion's fields offer them. Tailwind's own easings (`ease-out`) are its
 * presets, and its defaults (`default-transition-duration`) are what an unset time or easing is, so neither is listed.
 */
export function motionTokens(tokens: readonly Token[]) {
  const lookup = defaultValues(tokens)
  const duration: DurationToken[] = []
  const easing: EasingToken[] = []

  for (const token of tokens) {
    if (token.name.startsWith("default-") || isEasingKeyword(token.name)) {
      continue
    }

    const kind = previewKind(token, undefined, lookup)
    const value = lookup(token.name)?.trim() ?? ""

    if (kind === "duration") {
      const split = splitUnit(value)
      const ms = split && (split.unit === "s" ? split.number * 1000 : split.number)

      if (ms !== undefined && Number.isFinite(ms)) {
        duration.push(durationToken(token.name, ms))
      }
    }

    if (kind === "easing") {
      const plot = readEasingValue(value)
      easing.push(easingToken(token.name, plot?.kind === "bezier" ? plot.curve : undefined))
    }
  }

  return { duration, easing }
}
