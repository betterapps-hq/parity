import { createTelemetry, createTestSink, registeredEvents, traceHeaders } from "@parity-app/telemetry"
import { describe, expect, it } from "vite-plus/test"
import { currentTraceHeaders, keepTrace, startTrace, traceWith, tracedCommand } from "./tracing.ts"

const sink = createTestSink()
traceWith(
  createTelemetry({
    events: registeredEvents,
    context: { process: "renderer", installId: "install", sessionId: "session" },
    sinks: [sink],
    check: true
  })
)

/** A command run from a key with nothing selected. */
const command = (action: string) => ({ action, from: "key" as const, enabled: true, layers: 0, designs: 0 })

describe("tracedCommand", () => {
  it("is the trace requests carry until what the action returns settles", async () => {
    sink.clear()
    let finish: () => void = () => undefined
    const asked: unknown[] = []
    const running = tracedCommand(command("save"), async () => {
      await new Promise<void>((resolve) => (finish = resolve))
      asked.push(currentTraceHeaders())
      return "saved"
    })
    finish()
    expect(await running).toBe("saved")
    await Promise.resolve()
    const [span] = sink.spans
    expect(span).toMatchObject({ name: "command.ran", outcome: "ok", attributes: command("save") })
    expect(asked).toEqual([traceHeaders(span!)])
    expect(currentTraceHeaders()).toBeUndefined()
  })

  it("passes on what a synchronous action returns or throws, and records the failure's code", () => {
    sink.clear()
    expect(tracedCommand(command("selectAll"), () => 3)).toBe(3)
    const locked = Object.assign(new Error("Locked"), { details: { code: "locked" } })
    expect(() =>
      tracedCommand(command("delete"), () => {
        throw locked
      })
    ).toThrow(locked)
    expect(sink.spans.map(({ outcome, attributes }) => ({ outcome, attributes }))).toEqual([
      { outcome: "ok", attributes: command("selectAll") },
      { outcome: "error", attributes: { ...command("delete"), code: "locked" } }
    ])
  })
})

describe("startTrace", () => {
  it("gives back the trace it interrupted once it ends", () => {
    sink.clear()
    const action = startTrace("command.ran", command("paste"))
    const outer = currentTraceHeaders()
    const gesture = startTrace("gesture.ran", { gesture: "resize" })
    expect(currentTraceHeaders()).not.toEqual(outer)
    gesture.end("cancelled", { how: "escape" })
    expect(currentTraceHeaders()).toEqual(outer)
    action.end()
    expect(sink.spans[0]).toMatchObject({ outcome: "cancelled", attributes: { gesture: "resize", how: "escape" } })
  })
})

describe("keepTrace", () => {
  it("runs later work, such as a scheduled save, in the trace it was kept in", () => {
    const action = startTrace("command.ran", command("duplicate"))
    const during = currentTraceHeaders()
    const inTrace = keepTrace()
    action.end()
    expect(currentTraceHeaders()).toBeUndefined()
    expect(inTrace(() => currentTraceHeaders())).toEqual(during)
    expect(currentTraceHeaders()).toBeUndefined()
  })
})
