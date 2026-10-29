/**
 * How a number or length field behaves while someone types, steps or scrubs in it, without the view: what it shows,
 * what it says under itself, and what it asks the canvas to do. The field component runs its effects.
 *
 * - What's typed is a draft, kept until it's committed, reverted or the field closes, so a value changing underneath
 *   (an agent's edit, an undo) doesn't wipe it. With no draft, the field shows the value as it is.
 * - Each readable draft previews on the canvas as it's typed. One that can't be read keeps the last preview while
 *   typing, since it's often on its way to something readable (`16p` before `16px`).
 * - Enter commits and keeps focus, with the text selected for the next value. Leaving the field commits too. Input
 *   that can't be read stays, with the reason under it, and the canvas goes back to the value.
 * - Escape reverts the draft and the preview and leaves the field.
 */

/** Whether what's typed can be read, and if not, why. */
export type Reading = { ok: true } | { ok: false; reason: string }

export interface FieldState {
  /** What's typed, while it hasn't been committed or reverted. */
  draft?: string
  /** What a scrub shows while the label is dragged. */
  scrubbing?: string
  /** Said under the field: why the draft can't be read, or what was done with a committed value. */
  message?: { tone: "error" | "note"; text: string }
}

export type FieldEvent =
  | { type: "type"; text: string }
  | { type: "enter" }
  | { type: "blur" }
  | { type: "escape" }
  /** Up or Down: `count` steps, ten with Shift. */
  | { type: "step"; count: number }
  /** The host committed; `note` says what it did to a value that didn't fit. */
  | { type: "committed"; note?: string }
  | { type: "scrubStart" }
  | { type: "scrubMove"; text: string }
  | { type: "scrubEnd" }

export type FieldEffect =
  /** Show what `text` comes to on the canvas, without changing the design. */
  | { type: "preview"; text: string }
  /** Make `text` the value: one undo step. The host answers with `committed`. */
  | { type: "commit"; text: string }
  /** Step from `text` when given (the draft), else from the value; then commit. The host answers with `committed`. */
  | { type: "step"; count: number; from?: string }
  /** Take the preview off the canvas. */
  | { type: "cancel" }
  /** Select the field's text, for the next value. */
  | { type: "select" }
  /** Leave the field. */
  | { type: "blur" }

export interface FieldUpdate {
  state: FieldState
  effects: FieldEffect[]
}

export const initialFieldState: FieldState = {}

/** The next state of a field and what it asks for. `read` says whether some text can be read. */
export function reduceField(state: FieldState, event: FieldEvent, read: (text: string) => Reading): FieldUpdate {
  switch (event.type) {
    case "type": {
      const next: FieldState = { draft: event.text }
      return { state: next, effects: read(event.text).ok ? [{ type: "preview", text: event.text }] : [] }
    }
    case "enter":
    case "blur": {
      const select: FieldEffect[] = event.type === "enter" ? [{ type: "select" }] : []
      if (state.draft === undefined) return { state, effects: select }
      const reading = read(state.draft)
      if (!reading.ok) {
        return {
          state: { draft: state.draft, message: { tone: "error", text: reading.reason } },
          effects: [{ type: "cancel" }]
        }
      }
      return { state: {}, effects: [{ type: "commit", text: state.draft }, ...select] }
    }
    case "escape":
      return { state: {}, effects: [{ type: "cancel" }, { type: "blur" }] }
    case "step": {
      if (state.draft === undefined) return { state: {}, effects: [{ type: "step", count: event.count }] }
      const reading = read(state.draft)
      if (!reading.ok) return { state: { ...state, message: { tone: "error", text: reading.reason } }, effects: [] }
      return { state: {}, effects: [{ type: "step", count: event.count, from: state.draft }] }
    }
    case "committed":
      return { state: event.note ? { message: { tone: "note", text: event.note } } : {}, effects: [] }
    case "scrubStart":
      return { state: {}, effects: [{ type: "cancel" }] }
    case "scrubMove":
      return { state: { scrubbing: event.text }, effects: [] }
    case "scrubEnd":
      return { state: {}, effects: [] }
  }
}

/** What the field shows: the scrub's value, the draft, else the value as it is now. */
export function fieldText(state: FieldState, shown: string): string {
  return state.scrubbing ?? state.draft ?? shown
}
