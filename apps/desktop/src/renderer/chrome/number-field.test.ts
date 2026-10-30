import { describe, expect, it } from "vite-plus/test"
import {
  type FieldEffect,
  type FieldEvent,
  type FieldState,
  fieldText,
  initialFieldState,
  type Reading,
  reduceField
} from "./number-field.ts"

/** Reads numbers, and nothing with letters in it except px. */
const read = (text: string): Reading =>
  /[a-oq-wyz]/i.test(text) || /p(?!x)/i.test(text) ? { ok: false, reason: `Can't read "${text}"` } : { ok: true }

/** Runs events through the field, collecting what it asked for. */
function run(events: FieldEvent[], start: FieldState = initialFieldState) {
  let state = start
  const effects: FieldEffect[] = []
  for (const event of events) {
    const update = reduceField(state, event, read)
    state = update.state
    effects.push(...update.effects)
  }
  return { state, effects }
}

describe("typing", () => {
  it("previews each readable draft as it's typed", () => {
    const { state, effects } = run([
      { type: "type", text: "3" },
      { type: "type", text: "32" },
      { type: "type", text: "320" }
    ])
    expect(state).toEqual({ draft: "320" })
    expect(effects).toEqual([
      { type: "preview", text: "3" },
      { type: "preview", text: "32" },
      { type: "preview", text: "320" }
    ])
  })

  it("keeps the last preview while what's typed can't be read yet", () => {
    const { state, effects } = run([
      { type: "type", text: "16" },
      { type: "type", text: "16p" }
    ])
    expect(state).toEqual({ draft: "16p" })
    expect(effects).toEqual([{ type: "preview", text: "16" }])
  })

  it("keeps the draft whatever the value underneath does, since it shows over the value", () => {
    const { state } = run([{ type: "type", text: "12" }])
    expect(fieldText(state, "10")).toBe("12")
    expect(fieldText(state, "40")).toBe("12")
    expect(fieldText(initialFieldState, "40")).toBe("40")
  })

  it("takes away a message once typing starts again", () => {
    const { state } = run([{ type: "type", text: "abc" }, { type: "enter" }, { type: "type", text: "ab" }])
    expect(state.message).toBeUndefined()
  })
})

describe("Enter", () => {
  it("commits, keeps focus and selects the text for the next value", () => {
    const { state, effects } = run([{ type: "type", text: "320" }, { type: "enter" }])
    expect(state).toEqual({})
    expect(effects.slice(1)).toEqual([{ type: "commit", text: "320" }, { type: "select" }])
    expect(effects).not.toContainEqual({ type: "blur" })
  })

  it("with nothing typed, only selects", () => {
    expect(run([{ type: "enter" }]).effects).toEqual([{ type: "select" }])
  })

  it("keeps input it can't read, with the reason, and takes the preview back", () => {
    const { state, effects } = run([{ type: "type", text: "16" }, { type: "type", text: "16p" }, { type: "enter" }])
    expect(state).toEqual({ draft: "16p", message: { tone: "error", text: `Can't read "16p"` } })
    expect(effects.at(-1)).toEqual({ type: "cancel" })
    expect(effects).not.toContainEqual(expect.objectContaining({ type: "commit" }))
  })

  it("shows the host's note on what it did to the value", () => {
    const { state } = run([
      { type: "type", text: "281" },
      { type: "enter" },
      { type: "committed", note: "Snapped to 282px" }
    ])
    expect(state).toEqual({ message: { tone: "note", text: "Snapped to 282px" } })
  })
})

describe("leaving the field", () => {
  it("commits a readable draft", () => {
    const { effects } = run([{ type: "type", text: "40" }, { type: "blur" }])
    expect(effects.at(-1)).toEqual({ type: "commit", text: "40" })
  })

  it("keeps input it can't read, with the reason", () => {
    const { state } = run([{ type: "type", text: "abc" }, { type: "blur" }])
    expect(state).toEqual({ draft: "abc", message: { tone: "error", text: `Can't read "abc"` } })
  })

  it("does nothing with no draft", () => {
    expect(run([{ type: "blur" }]).effects).toEqual([])
  })

  it("reverts on Escape, taking the preview back and leaving the field", () => {
    const { state, effects } = run([{ type: "type", text: "40" }, { type: "escape" }])
    expect(state).toEqual({})
    expect(effects.slice(1)).toEqual([{ type: "cancel" }, { type: "blur" }])
  })
})

describe("stepping", () => {
  it("steps from the value with no draft", () => {
    expect(run([{ type: "step", count: 10 }]).effects).toEqual([{ type: "step", count: 10 }])
  })

  it("steps from a readable draft, which it commits", () => {
    const { state, effects } = run([
      { type: "type", text: "16+4" },
      { type: "step", count: 1 }
    ])
    expect(state).toEqual({})
    expect(effects.at(-1)).toEqual({ type: "step", count: 1, from: "16+4" })
  })

  it("won't step from input it can't read, and says why", () => {
    const { state, effects } = run([
      { type: "type", text: "abc" },
      { type: "step", count: -1 }
    ])
    expect(state).toEqual({ draft: "abc", message: { tone: "error", text: `Can't read "abc"` } })
    expect(effects).toEqual([])
  })
})

describe("scrubbing", () => {
  it("drops the draft, shows the scrubbed value, then the value", () => {
    const start = run([{ type: "type", text: "abc" }, { type: "enter" }]).state
    const { state, effects } = run([{ type: "scrubStart" }, { type: "scrubMove", text: "24" }], start)
    expect(effects).toEqual([{ type: "cancel" }])
    expect(fieldText(state, "16")).toBe("24")
    expect(fieldText(run([{ type: "scrubEnd" }], state).state, "24")).toBe("24")
  })
})
