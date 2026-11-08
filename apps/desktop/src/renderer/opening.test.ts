import { createTelemetry, createTestSink, registeredEvents, traceHeaders } from "@parity-app/telemetry"
import { describe, expect, it } from "vite-plus/test"
import type { ProjectInfo } from "../shared/protocol.ts"
import { startOpening } from "./opening.ts"
import { setWindowTelemetry } from "./report-error.ts"
import { currentTraceHeaders, startTrace, traceWith } from "./tracing.ts"

const sink = createTestSink()
const telemetry = createTelemetry({
  events: registeredEvents,
  context: { process: "renderer", installId: "install", sessionId: "session" },
  sinks: [sink],
  check: true
})
traceWith(telemetry)
setWindowTelemetry(telemetry)

const info = { id: "/work/site", root: "/work/site", name: "site" } as ProjectInfo

/** A clock that reads what `at` was last set to. */
function clock() {
  const time = { at: 1000 }
  return { time, now: () => time.at }
}

describe("startOpening", () => {
  it("records the first frame drawn, once, with the time from asking, in the open's trace", () => {
    sink.clear()
    const { time, now } = clock()
    const opening = startOpening("/work/site", false, now)
    const asked = opening.ask(() => currentTraceHeaders())
    time.at = 1400
    const firstFrame = opening.ready(info)
    time.at = 1650
    firstFrame("bitmap")
    firstFrame("live")

    const span = sink.spans.find(({ name }) => name === "project.opening")
    expect(span).toMatchObject({ outcome: "ok", attributes: { reload: false, root: "/work/site", name: "site" } })
    expect(asked).toEqual(traceHeaders(span!))
    expect(currentTraceHeaders()).toBeUndefined()
    const drawn = sink.named("project.drawn")
    expect(drawn).toHaveLength(1)
    expect(drawn[0]).toMatchObject({
      traceId: span!.traceId,
      spanId: span!.spanId,
      attributes: { name: "site", root: "/work/site", durationMs: 650, from: "bitmap" }
    })
  })

  it("joins the trace of the action that asked for it", () => {
    sink.clear()
    const action = startTrace("command.ran", { action: "open", from: "menu", enabled: true, layers: 0, designs: 0 })
    const opening = startOpening(undefined, false)
    action.end("ok")
    opening.ready(info)("live")
    const [command] = sink.named("command.ran")
    const [span] = sink.named("project.opening")
    expect(span).toMatchObject({ traceId: command!.traceId, parentSpanId: command!.spanId })
    expect(sink.named("project.drawn")[0]).toMatchObject({ traceId: command!.traceId, attributes: { from: "live" } })
  })

  it("puts what the window records while it loads in the open's trace", () => {
    sink.clear()
    const opening = startOpening("/work/site", true)
    opening.loaded({ name: "site", root: "/work/site", durationMs: 5, componentsMs: 2, components: 3 })
    opening.ready(info)
    const [span] = sink.named("project.opening")
    expect(sink.named("project.loaded")[0]).toMatchObject({ traceId: span!.traceId, spanId: span!.spanId })
  })

  it("ends with the failure's code, or as cancelled when the tab is closed", () => {
    sink.clear()
    startOpening("/work/broken", false).failed(
      Object.assign(new Error("No builder"), { details: { code: "no-builder" } })
    )
    startOpening("/work/closed", true).dropped()
    expect(sink.named("project.opening").map(({ outcome, attributes }) => ({ outcome, attributes }))).toEqual([
      { outcome: "error", attributes: { reload: false, root: "/work/broken", code: "no-builder" } },
      { outcome: "cancelled", attributes: { reload: true, root: "/work/closed" } }
    ])
    expect(sink.named("project.drawn")).toEqual([])
  })
})
