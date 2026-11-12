/**
 * How a field's edits reach the design while someone types, steps or scrubs in it, without the view: what shows on the
 * canvas as a preview, what's made, and which edits are one undo step together. The Design tab runs one session for
 * all its sections (`useEditSession`); the field says what happened, with the edits its change came to, and the
 * session says what to do with them.
 *
 * - A readable keystroke or a scrub's move shows its edits as a preview, without changing the design. Typing that
 *   can't be read takes the preview back.
 * - Enter, leaving the field and a scrub's release make the edits: one undo step, which takes the preview's place.
 * - Up and Down make each step's edits at once, so the panel shows the value the next step works from. A run of them on
 *   one target (the selection) is one undo step together: the run begins a gesture with a checkpoint, and ends as
 *   anything else happens or the target changes.
 * - Escape, or a scrub's pointer being cancelled, takes back the preview, and the run as though it was never made.
 *
 * Where the selected layers differ, a change that works from the value there (`+8`, `Mixed*2`) is worked out for each
 * layer from its own (`relativeUpdate`), as steps and scrubs are.
 */
import { applyFieldInput, type FieldRules, readFieldInput } from "@parity-app/core"
import { numberValue } from "../../chrome/prop-values.ts"

/** A session's state: whether a preview shows, and the run of Up and Down presses under way. */
export interface SessionState {
  /** Edits show on the canvas without being made. */
  previewing: boolean
  /** The run of steps, and the target it's on; its edits are made in one gesture, which Escape can take back. */
  run?: { target: string | undefined }
}

export const initialSession: SessionState = { previewing: false }

/** What happened in a field, as it tells its session. */
export type FieldSessionEvent =
  /** What's typed reads, or a scrub moved: show it. */
  | { type: "show" }
  /** What's typed can't be read, or is put back: show the design as it is. */
  | { type: "hide" }
  /** Enter, leaving the field with something typed, or a scrub's release: make it. */
  | { type: "make" }
  /** Up or Down: make it as one step of a run. */
  | { type: "step" }
  /** Escape, or the scrub's pointer cancelled: take it all back. */
  | { type: "cancel" }
  /** Leaving the field, a scrub beginning, or the field going: keep what's made, and end the run. */
  | { type: "end" }

/** A field's event with the edits its change came to, and the target the panel edits now. */
export type SessionEvent<E> =
  | (Exclude<FieldSessionEvent, { type: "step" }> & { edits?: readonly E[] })
  | { type: "step"; edits: readonly E[]; target: string | undefined }
  /** The panel edits another target (the selection changed): a run on the last one ends. */
  | { type: "target"; target: string | undefined }

export type SessionEffect<E> =
  /** Show the edits on the canvas, in place of any preview, without changing the design. */
  | { type: "preview"; edits: readonly E[] }
  /** Take the preview off the canvas. */
  | { type: "unpreview" }
  /** Make the edits: one undo step, or part of the run's when `inRun`. A made edit takes the preview's place. */
  | { type: "make"; edits: readonly E[]; inRun: boolean }
  /** Begin a run: a gesture, and a checkpoint to take it back to. */
  | { type: "beginRun" }
  /** End the run, keeping what it made as one undo step. */
  | { type: "endRun" }
  /** Take the run back to its checkpoint, as though it was never made, and end it. */
  | { type: "revertRun" }

export interface SessionUpdate<E> {
  state: SessionState
  effects: SessionEffect<E>[]
}

/** The next state of a session and what it asks for. */
export function reduceSession<E>(state: SessionState, event: SessionEvent<E>): SessionUpdate<E> {
  const effects: SessionEffect<E>[] = []
  const edits = "edits" in event ? (event.edits ?? []) : []

  const endRun = () => {
    if (state.run) {
      effects.push({ type: "endRun" })
    }
  }

  const unpreview = () => {
    if (state.previewing) {
      effects.push({ type: "unpreview" })
    }
  }

  switch (event.type) {
    case "show":
      endRun()

      if (edits.length === 0) {
        unpreview()

        return { state: { previewing: false }, effects }
      }

      effects.push({ type: "preview", edits })

      return { state: { previewing: true }, effects }
    case "hide":
      unpreview()

      return { state: { ...state, previewing: false }, effects }
    case "make":
      endRun()

      if (edits.length === 0) {
        unpreview()
      } else {
        effects.push({ type: "make", edits, inRun: false })
      }

      return { state: { previewing: false }, effects }
    case "step": {
      unpreview()

      if (edits.length === 0) {
        return { state: { ...state, previewing: false }, effects }
      }

      if (!state.run || state.run.target !== event.target) {
        endRun()
        effects.push({ type: "beginRun" })
      }

      effects.push({ type: "make", edits, inRun: true })

      return { state: { previewing: false, run: { target: event.target } }, effects }
    }

    case "cancel":
      unpreview()

      if (state.run) {
        effects.push({ type: "revertRun" })
      }

      return { state: { previewing: false }, effects }
    case "end":
      unpreview()
      endRun()

      return { state: { previewing: false }, effects }
    case "target":
      if (state.run && state.run.target !== event.target) {
        return { state: { previewing: state.previewing }, effects: [{ type: "endRun" }] }
      }

      return { state, effects }
  }
}

/**
 * What typed text does to each layer's own number, where it works from the value there (`+8`, `*2`, `Mixed-4`):
 * undefined for text that sets one value for every layer, or can't be read. A layer's number it can't work from stays.
 */
export function relativeUpdate(text: string, label: string): ((own: number) => number) | undefined {
  const rules: FieldRules = { kind: "number", label }
  const typed = readFieldInput(text, rules)

  if (typed.type !== "maths" || !typed.relative) {
    return undefined
  }

  return (own) => {
    const outcome = applyFieldInput(typed, own, rules)
    const next = outcome.ok ? numberValue.safeParse(outcome.value).data : undefined

    return next === undefined ? own : Math.round(next * 10_000) / 10_000
  }
}
