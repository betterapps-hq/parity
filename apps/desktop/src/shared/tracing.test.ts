import { createTelemetry, createTestSink, registeredEvents, traceHeaders } from "@parity-app/telemetry"
import { describe, expect, it } from "vite-plus/test"
import { currentTrace, currentTraceHeaders, handleInSpan, inSpan, traceWith } from "./tracing.ts"

const sink = createTestSink()
traceWith(
  createTelemetry({
    events: registeredEvents,
    context: { process: "service", installId: "install", sessionId: "session" },
    sinks: [sink],
    check: true
  })
)
const sent = { traceId: "4bf92f3577b34da6a3ce929d0e0e4736", spanId: "00f067aa0ba902b7" }

describe("handleInSpan", () => {
  it("runs a request's handler in a span that continues the trace it came with, carried by what it asks", async () => {
    sink.clear()
    let asked: unknown
    const answer = await handleInSpan({ method: "frames.capture", trace: traceHeaders(sent) }, async () => {
      await Promise.resolve()
      asked = currentTraceHeaders()
      return "drawn"
    })
    expect(answer).toBe("drawn")
    const [span] = sink.spans
    expect(span).toMatchObject({
      name: "request.handled",
      traceId: sent.traceId,
      parentSpanId: sent.spanId,
      outcome: "ok",
      attributes: { method: "frames.capture" }
    })
    expect(asked).toEqual(traceHeaders({ traceId: sent.traceId, spanId: span!.spanId }))
    expect(currentTrace()).toBeUndefined()
  })

  it("starts a trace for an older sender's request, and records a failure's code", async () => {
    sink.clear()
    const locked = Object.assign(new Error("Locked"), { details: { code: "locked" } })
    await expect(
      handleInSpan({ method: "document.save", trace: undefined }, () => {
        throw locked
      })
    ).rejects.toBe(locked)
    expect(sink.spans[0]).toMatchObject({ outcome: "error", attributes: { method: "document.save", code: "locked" } })
    expect(sink.spans[0]?.parentSpanId).toBeUndefined()
  })

  it("leaves telemetry sent on to main out, since each span would record another", async () => {
    sink.clear()
    expect(await handleInSpan({ method: "record", trace: traceHeaders(sent) }, () => "kept")).toBe("kept")
    expect(sink.spans).toEqual([])
  })
})

describe("inSpan", () => {
  it("nests under the span this process is working in, or a parent given for work queued earlier", async () => {
    sink.clear()
    await inSpan("agent.called", { method: "screenshot" }, () =>
      inSpan("frame.drawn", { priority: "render", queuedMs: 3, whole: true }, () => undefined)
    )
    const [drawn, called] = sink.spans
    expect(drawn?.parentSpanId).toBe(called?.spanId)
    expect(drawn?.traceId).toBe(called?.traceId)
    await inSpan("builder.started", { builder: "vite" }, () => undefined, sent)
    expect(sink.spans[2]).toMatchObject({ traceId: sent.traceId, parentSpanId: sent.spanId })
  })
})
