import { isTransitionSet, type Time as StoredTime, type Transition } from "@parity-app/core"
import { z } from "zod"
import { type Time, timeMs, type TransitionEntry } from "./controls/motion-data.ts"

/*
 * Motion's transitions between the forms `NodeStyle` holds them in and the forms the Transition list edits: a time is
 * milliseconds (`{ step }`) or a duration token, and an easing is one of Tailwind's, a token, a curve of its own or a
 * spring, in the forms the list holds them. The list's other times come back as one of these: `0.2s` as 200
 * milliseconds.
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
      entry.easing = transition.easing
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
function timeOf(time: StoredTime): Time {
  if ("token" in time) {
    return time
  }

  return Number.isInteger(time.step) ? { step: time.step } : { value: `${time.step}ms` }
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
      transition.easing = entry.easing
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

/** A time as `NodeStyle` holds it: a token, or milliseconds, whatever unit it was typed or read in. */
function storedTime(time: Time | undefined): StoredTime | undefined {
  if (time === undefined) {
    return undefined
  }

  if ("token" in time) {
    return { token: time.token }
  }

  const ms = timeMs(time, [])

  return ms === undefined ? undefined : { step: ms }
}
