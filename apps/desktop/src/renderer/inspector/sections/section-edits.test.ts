import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { GestureRun } from "../../canvas/gesture.ts"
import type { StyleChange } from "../../chrome/style-editor.ts"
import { setWindowTelemetry } from "../../report-error.ts"
import { SessionRunner, type SessionTarget } from "./section-edits.ts"

const sink = createTestSink()

beforeEach(() => {
  setWindowTelemetry(
    createTelemetry({
      events: registeredEvents,
      context: { process: "renderer", installId: "install", sessionId: "session" },
      sinks: [sink],
      check: true
    })
  )
})

afterEach(() => {
  setWindowTelemetry(undefined)
  sink.clear()
})

const ended = () => sink.named("gesture.ended").map(({ attributes }) => attributes)

/** A change to padding, as a field's press comes to. */
const padding = (steps: number): StyleChange => ({ row: "padding", edit: { padding: steps }, label: "Change padding" })

/**
 * A session over an editor and store that log what they're asked, with `reverts` saying whether a checkpoint can still
 * take its run back, as it can't once something else has changed the design.
 */
function session(reverts = true) {
  const log: string[] = []
  let gestures = 0

  const run = new GestureRun(
    {
      beginGesture: () => `g${(gestures += 1)}`,
      endGesture: (gesture) => {
        log.push(`end ${gesture}`)

        return true
      }
    },
    "fieldNudge"
  )

  const now = {
    current: {
      target: "frame-1",
      editor: {
        preview: () => log.push("preview"),
        endPreview: () => log.push("endPreview"),
        make: (changes, gesture) =>
          log.push(`make ${changes.map((change) => change.label).join()} ${gesture ?? "alone"}`),
        checkpoint: (gesture) => ({
          revert: () => {
            log.push(`revert ${gesture}`)

            return reverts
          }
        })
      }
    }
  } satisfies { current: SessionTarget }

  return { runner: new SessionRunner(run, now), now, log }
}

describe("the Design tab's session, run against the editor and the store's gestures", () => {
  it("makes a run of presses in one gesture, counting each press", () => {
    const { runner, log } = session()
    runner.dispatch({ type: "step", edits: [padding(5)], target: "frame-1" })
    runner.dispatch({ type: "step", edits: [padding(6)], target: "frame-1" })
    runner.dispatch({ type: "end" })

    expect(log).toEqual(["make Change padding g1", "make Change padding g1", "end g1"])
    expect(ended()).toEqual([expect.objectContaining({ kind: "fieldNudge", how: "ended", kept: true, presses: 2 })])
  })

  it("takes the run back on Escape, recorded as not kept", () => {
    const { runner, log } = session()
    runner.dispatch({ type: "step", edits: [padding(5)], target: "frame-1" })
    runner.dispatch({ type: "cancel" })

    expect(log).toEqual(["make Change padding g1", "revert g1", "end g1"])
    expect(ended()).toEqual([expect.objectContaining({ kept: false, presses: 1 })])
  })

  it("keeps the run on Escape once something else has changed the design, so that change isn't lost", () => {
    const { runner, log } = session(false)
    runner.dispatch({ type: "step", edits: [padding(5)], target: "frame-1" })
    runner.dispatch({ type: "cancel" })

    expect(log).toEqual(["make Change padding g1", "revert g1", "end g1"])
    expect(ended()).toEqual([expect.objectContaining({ kept: true })])
  })

  it("ends the run as another layer is selected, recorded as such", () => {
    const { runner, now, log } = session()
    runner.dispatch({ type: "step", edits: [padding(5)], target: "frame-1" })
    now.current = { ...now.current, target: "frame-2" }
    runner.dispatch({ type: "target", target: "frame-2" })
    runner.dispatch({ type: "step", edits: [padding(3)], target: "frame-2" })

    expect(log).toEqual(["make Change padding g1", "end g1", "make Change padding g2"])
    expect(ended()).toEqual([expect.objectContaining({ how: "selection", presses: 1 })])
  })

  it("makes a typed value alone, and previews before it", () => {
    const { runner, log } = session()
    runner.dispatch({ type: "show", edits: [padding(4)] })
    runner.dispatch({ type: "make", edits: [padding(4)] })

    expect(log).toEqual(["preview", "make Change padding alone"])
    expect(ended()).toEqual([])
  })
})
