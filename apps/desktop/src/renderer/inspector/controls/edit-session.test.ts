import { describe, expect, it } from "vite-plus/test"
import {
  initialSession,
  reduceSession,
  relativeUpdate,
  type SessionEffect,
  type SessionEvent,
  type SessionState
} from "./edit-session.ts"

/** Runs events through a session, collecting what it asked for. Edits are plain strings here. */
function run(events: SessionEvent<string>[], start: SessionState = initialSession) {
  let state = start
  const effects: SessionEffect<string>[] = []

  for (const event of events) {
    const update = reduceSession(state, event)
    state = update.state
    effects.push(...update.effects)
  }

  return { state, effects }
}

const step = (edit: string, target = "frame-1"): SessionEvent<string> => ({ type: "step", edits: [edit], target })

describe("typing", () => {
  it("previews each readable keystroke, and Enter makes the last one", () => {
    const { state, effects } = run([
      { type: "show", edits: ["width 3"] },
      { type: "show", edits: ["width 32"] },
      { type: "make", edits: ["width 32"] }
    ])

    expect(state).toEqual(initialSession)
    expect(effects).toEqual([
      { type: "preview", edits: ["width 3"] },
      { type: "preview", edits: ["width 32"] },
      { type: "make", edits: ["width 32"], inRun: false }
    ])
  })

  it("takes the preview back while what's typed can't be read", () => {
    const { effects } = run([{ type: "show", edits: ["width 16"] }, { type: "hide" }])

    expect(effects).toEqual([{ type: "preview", edits: ["width 16"] }, { type: "unpreview" }])
  })

  it("puts the design back on Escape", () => {
    const { state, effects } = run([{ type: "show", edits: ["width 16"] }, { type: "cancel" }])

    expect(state).toEqual(initialSession)
    expect(effects).toEqual([{ type: "preview", edits: ["width 16"] }, { type: "unpreview" }])
  })

  it("asks for nothing when there's nothing to take back", () => {
    expect(run([{ type: "hide" }, { type: "cancel" }, { type: "end" }]).effects).toEqual([])
  })
})

describe("scrubbing", () => {
  it("previews every move and makes only the last, on release: one undo step", () => {
    const { effects } = run([
      { type: "end" },
      { type: "show", edits: ["gap 9"] },
      { type: "show", edits: ["gap 10"] },
      { type: "show", edits: ["gap 11"] },
      { type: "make", edits: ["gap 11"] }
    ])

    expect(effects.filter((effect) => effect.type === "make")).toEqual([
      { type: "make", edits: ["gap 11"], inRun: false }
    ])
    expect(effects.filter((effect) => effect.type === "preview")).toHaveLength(3)
  })

  it("makes nothing when Escape or a cancelled pointer ends it", () => {
    const { effects } = run([
      { type: "show", edits: ["gap 9"] },
      { type: "show", edits: ["gap 10"] },
      { type: "cancel" }
    ])

    expect(effects.at(-1)).toEqual({ type: "unpreview" })
    expect(effects.some((effect) => effect.type === "make")).toBe(false)
  })

  it("previews several edits a change came to together", () => {
    const { effects } = run([{ type: "show", edits: ["width 40", "aspect off"] }])

    expect(effects).toEqual([{ type: "preview", edits: ["width 40", "aspect off"] }])
  })
})

describe("a run of Up and Down presses", () => {
  it("makes each step at once, in one gesture begun at the first", () => {
    const { state, effects } = run([step("padding 5"), step("padding 6"), step("padding 7")])

    expect(state.run).toEqual({ target: "frame-1" })
    expect(effects).toEqual([
      { type: "beginRun" },
      { type: "make", edits: ["padding 5"], inRun: true },
      { type: "make", edits: ["padding 6"], inRun: true },
      { type: "make", edits: ["padding 7"], inRun: true }
    ])
  })

  it("keeps the run as one undo step once the field's left", () => {
    const { state, effects } = run([step("padding 5"), step("padding 6"), { type: "end" }])

    expect(state).toEqual(initialSession)
    expect(effects.at(-1)).toEqual({ type: "endRun" })
  })

  it("takes the whole run back on Escape", () => {
    const { state, effects } = run([step("padding 5"), step("padding 6"), { type: "cancel" }])

    expect(state).toEqual(initialSession)
    expect(effects.at(-1)).toEqual({ type: "revertRun" })
  })

  it("ends as typing begins, so what's typed is a step of its own", () => {
    const { effects } = run([
      step("padding 5"),
      { type: "show", edits: ["padding 12"] },
      { type: "make", edits: ["padding 12"] }
    ])

    expect(effects.slice(2)).toEqual([
      { type: "endRun" },
      { type: "preview", edits: ["padding 12"] },
      { type: "make", edits: ["padding 12"], inRun: false }
    ])
  })

  it("ends as the selection changes, and a press on the new one begins another", () => {
    const { effects } = run([step("padding 5"), { type: "target", target: "frame-2" }, step("padding 3", "frame-2")])

    expect(effects.map((effect) => effect.type)).toEqual(["beginRun", "make", "endRun", "beginRun", "make"])
    expect(effects[2]).toEqual({ type: "endRun", selection: true })
  })

  it("ends as text it can't read is typed, so Escape then takes back only what's typed", () => {
    const { effects } = run([step("padding 5"), { type: "hide" }, { type: "cancel" }, step("padding 6")])

    expect(effects.map((effect) => effect.type)).toEqual(["beginRun", "make", "endRun", "beginRun", "make"])
  })

  it("stays the same run while the selection is the same", () => {
    const { effects } = run([step("padding 5"), { type: "target", target: "frame-1" }, step("padding 6")])

    expect(effects.map((effect) => effect.type)).toEqual(["beginRun", "make", "make"])
  })

  it("takes a preview off before its first step", () => {
    const { effects } = run([{ type: "show", edits: ["padding 12"] }, step("padding 5")])

    expect(effects.slice(1)).toEqual([
      { type: "unpreview" },
      { type: "beginRun" },
      { type: "make", edits: ["padding 5"], inRun: true }
    ])
  })

  it("begins nothing for a step that changes nothing, as at a field's limit", () => {
    expect(run([{ type: "step", edits: [], target: "frame-1" }]).effects).toEqual([])
  })
})

describe("relativeUpdate", () => {
  it("works out what's typed from each layer's own number", () => {
    const add = relativeUpdate("+8", "Width")
    const double = relativeUpdate("Mixed*2", "Width")
    const less = relativeUpdate("Mixed-4", "Width")

    expect([add?.(10), add?.(24)]).toEqual([18, 32])
    expect([double?.(10), double?.(24)]).toEqual([20, 48])
    expect([less?.(10), less?.(24)]).toEqual([6, 20])
  })

  it("reads pixels written out, as the field's numbers are pixels", () => {
    expect(relativeUpdate("+8px", "Width")?.(10)).toBe(18)
    expect(relativeUpdate("Mixed * 2 px", "Width")?.(10)).toBe(20)
  })

  it("leaves text that sets one value for every layer to the field", () => {
    expect(relativeUpdate("16", "Width")).toBeUndefined()
    expect(relativeUpdate("-8", "Inset")).toBeUndefined()
    expect(relativeUpdate("", "Width")).toBeUndefined()
    expect(relativeUpdate("wide", "Width")).toBeUndefined()
  })

  it("keeps a layer's number it can't work from", () => {
    expect(relativeUpdate("/0", "Width")?.(10)).toBe(10)
  })
})
