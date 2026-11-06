import { createTelemetry, defineEvent } from "@parity-app/telemetry"
import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import { createSentrySink, type SentryTarget } from "./sentry-sink.ts"

const events = [
  defineEvent("project.opened", z.object({ root: z.string(), components: z.number() }), {
    level: "info",
    sentBy: ["service"],
    when: "A project opens."
  }),
  defineEvent("error.caught", z.object({ message: z.string(), code: z.string() }), {
    level: "error",
    sentBy: ["renderer"],
    when: "An error is shown."
  }),
  defineEvent("frame.rendered", z.object({ design: z.string() }), {
    level: "debug",
    sentBy: ["main"],
    when: "A frame is drawn."
  })
] as const

/** A Sentry that keeps what it's given. */
function fakeSentry() {
  const sent = { breadcrumbs: [] as unknown[], events: [] as Record<string, unknown>[], logs: [] as unknown[] }
  const target: SentryTarget = {
    addBreadcrumb: (breadcrumb) => sent.breadcrumbs.push(breadcrumb),
    captureEvent: (event) => sent.events.push(event as Record<string, unknown>),
    log: (log) => sent.logs.push(log)
  }
  return { sent, target }
}

function telemetryInto(target: SentryTarget, options?: Parameters<typeof createSentrySink>[1]) {
  let time = Date.parse("2026-11-06T17:00:00.000Z")
  let byte = 0
  return createTelemetry({
    events,
    context: { process: "service", installId: "install", sessionId: "session", project: "/work/site" },
    sinks: [createSentrySink(target, options)],
    check: true,
    now: () => (time += 250),
    randomBytes: (length) => new Uint8Array(length).fill(++byte)
  })
}

describe("createSentrySink", () => {
  it("makes each event a breadcrumb with its attributes and the envelope's fields", () => {
    const { sent, target } = fakeSentry()
    telemetryInto(target).track("project.opened", { root: "/work/site", components: 12 })
    expect(sent.breadcrumbs).toEqual([
      {
        type: "default",
        category: "project.opened",
        level: "info",
        timestamp: Date.parse("2026-11-06T17:00:00.250Z") / 1000,
        data: {
          process: "service",
          installId: "install",
          sessionId: "session",
          project: "/work/site",
          root: "/work/site",
          components: 12
        }
      }
    ])
    // Other events aren't errors, and only main uploads logs.
    expect(sent.events).toEqual([])
    expect(sent.logs).toEqual([])
  })

  it("sends an error.* event as a Sentry error, in its trace, after its breadcrumb", () => {
    const { sent, target } = fakeSentry()
    const telemetry = telemetryInto(target)
    const span = telemetry.startSpan("frame.rendered", { design: "Home" })
    telemetry.track("error.caught", { message: "The file couldn't be saved", code: "save-failed" }, { span })
    expect(sent.breadcrumbs).toHaveLength(1)
    expect(sent.events).toEqual([
      {
        level: "error",
        message: "error.caught: The file couldn't be saved",
        timestamp: Date.parse("2026-11-06T17:00:00.500Z") / 1000,
        tags: { process: "service", event: "error.caught" },
        contexts: {
          parity: expect.objectContaining({ code: "save-failed", traceId: span.traceId, spanId: span.spanId }),
          trace: { trace_id: span.traceId, span_id: span.spanId }
        }
      }
    ])
  })

  it("uploads events as structured logs searchable by their attributes, in their trace", () => {
    const { sent, target } = fakeSentry()
    const telemetry = telemetryInto(target, { upload: true, scope: false })
    const span = telemetry.startSpan("frame.rendered", { design: "Home" })
    telemetry.track("project.opened", { root: "/work/site", components: 12 }, { span })
    expect(sent.breadcrumbs).toEqual([])
    expect(sent.logs).toEqual([
      {
        level: "info",
        message: "project.opened",
        traceId: span.traceId,
        attributes: {
          root: "/work/site",
          components: 12,
          "parity.process": "service",
          "parity.install_id": "install",
          "parity.session_id": "session",
          "parity.project": "/work/site",
          "parity.span_id": span.spanId
        }
      }
    ])
  })

  it("uploads a span as a transaction with Parity's trace, span and parent IDs", () => {
    const { sent, target } = fakeSentry()
    const telemetry = telemetryInto(target, { upload: true, scope: false })
    const parent = telemetry.startSpan("frame.rendered", { design: "Home" })
    const child = telemetry.startSpan("frame.rendered", { design: "About" }, { parent })
    child.end("cancelled")
    expect(sent.events).toEqual([
      {
        type: "transaction",
        transaction: "frame.rendered",
        transaction_info: { source: "custom" },
        start_timestamp: Date.parse("2026-11-06T17:00:00.500Z") / 1000,
        timestamp: Date.parse("2026-11-06T17:00:00.750Z") / 1000,
        level: "debug",
        tags: { process: "service" },
        contexts: {
          trace: {
            trace_id: parent.traceId,
            span_id: child.spanId,
            parent_span_id: parent.spanId,
            op: "frame.rendered",
            status: "cancelled",
            origin: "manual",
            data: expect.objectContaining({ design: "About", "parity.duration_ms": 250, "parity.outcome": "cancelled" })
          }
        },
        spans: []
      }
    ])
  })
})
