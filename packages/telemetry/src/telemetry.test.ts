import { describe, expect, expectTypeOf, it } from "vite-plus/test"
import { z } from "zod"
import {
  createTelemetry,
  createTestSink,
  defineEvent,
  type EventAttributes,
  type EventContext,
  TelemetryError
} from "./index.ts"

/** Who sends an event and when, which only the catalog reads. */
const about = { sentBy: ["renderer"], when: "In these tests." } as const

const projectOpened = defineEvent("project.opened", z.object({ framework: z.string(), components: z.number().int() }), {
  level: "info",
  ...about
})
const saveFailed = defineEvent("file.save_failed", z.object({ path: z.string() }), { level: "error", ...about })
const pointerMoved = defineEvent("gesture.sampled", z.object({}), { level: "debug", sample: 0.25, ...about })
const events = [projectOpened, saveFailed, pointerMoved] as const

const context: EventContext = { process: "renderer", installId: "install-1", sessionId: "session-1", windowId: "w1" }

/** Telemetry checking every event, at a clock the test moves, with IDs counted up from 1. */
function setup(options: { check?: boolean; random?: () => number; keep?: number } = {}) {
  const sink = createTestSink()
  let time = Date.UTC(2026, 10, 5, 12)
  let id = 0
  const telemetry = createTelemetry({
    events,
    context,
    sinks: [sink],
    check: options.check ?? true,
    keep: options.keep,
    now: () => time,
    random: options.random ?? (() => 0),
    randomBytes: (length) => {
      id++
      return Uint8Array.from({ length }, (_, index) => (index === length - 1 ? id : 0))
    }
  })
  return { telemetry, sink, wait: (ms: number) => (time += ms) }
}

describe("defineEvent", () => {
  it("takes dotted names, area first", () => {
    expect(projectOpened).toMatchObject({ name: "project.opened", level: "info", sample: 1 })
    expect(defineEvent("projectEdit.saveFailed", z.object({}), { level: "info", ...about }).name).toBe(
      "projectEdit.saveFailed"
    )
    expect(() => defineEvent("projectOpened", z.object({}), { level: "info", ...about })).toThrow(/dotted/)
    expect(() => defineEvent("Project.opened", z.object({}), { level: "info", ...about })).toThrow(/dotted/)
    expect(() => defineEvent("project", z.object({}), { level: "info", ...about })).toThrow(/dotted/)
  })

  it("keeps a share from 0 to 1", () => {
    expect(() => defineEvent("a.b", z.object({}), { level: "info", sample: 1.5, ...about })).toThrow(/0 to 1/)
    expect(() => defineEvent("a.b", z.object({}), { level: "info", sample: Number.NaN, ...about })).toThrow(/0 to 1/)
  })

  it("registers each name once", () => {
    const again = defineEvent("project.opened", z.object({}), { level: "warn", ...about })
    expect(() => createTelemetry({ events: [projectOpened, again], context, sinks: [], check: true })).toThrow(
      "project.opened is registered twice"
    )
  })
})

describe("track", () => {
  it("sends an event in its envelope to every sink, with the process's context", () => {
    const { telemetry, sink } = setup()
    const other = createTestSink()
    const both = createTelemetry({ events, context, sinks: [sink, other], check: true, now: () => 0 })
    telemetry.track("project.opened", { framework: "vite", components: 41 })
    both.track("file.save_failed", { path: "src/app.par" })
    expect(sink.events[0]).toEqual({
      process: "renderer",
      installId: "install-1",
      sessionId: "session-1",
      windowId: "w1",
      name: "project.opened",
      time: "2026-11-05T12:00:00.000Z",
      level: "info",
      attributes: { framework: "vite", components: 41 }
    })
    expect(sink.named("file.save_failed")).toHaveLength(1)
    expect(other.named("file.save_failed")).toEqual(sink.named("file.save_failed"))
  })

  it("scrubs secrets from attributes before any sink or the kept events see them", () => {
    const sink = createTestSink()
    const telemetry = createTelemetry({ events, context, sinks: [sink], check: true, secrets: ["acme-shop-secret"] })
    const message = "POST https://api.acme.dev/upload?access_token=acme-shop-secret failed"
    telemetry.track("file.save_failed", { path: `/Users/ada/acme/${message}` })
    telemetry.setSecrets(["another-project-value"])
    const span = telemetry.startSpan("file.save_failed", { path: "/Users/ada/shop/another-project-value" })
    span.end("error")

    const scrubbed = "/Users/ada/acme/POST https://api.acme.dev/upload?access_token=[redacted] failed"
    expect(sink.events[0]?.attributes).toEqual({ path: scrubbed })
    expect(sink.spans[0]?.attributes).toEqual({ path: "/Users/ada/shop/[redacted]" })
    expect(telemetry.recent().map((event) => event.attributes)).toEqual([
      { path: scrubbed },
      { path: "/Users/ada/shop/[redacted]" }
    ])
  })
  it("takes only registered names and their attributes, as types", () => {
    const { telemetry } = setup({ check: false })
    expectTypeOf<Parameters<typeof telemetry.track>[0]>().toEqualTypeOf<
      "project.opened" | "file.save_failed" | "gesture.sampled"
    >()
    expectTypeOf<EventAttributes<typeof events, "project.opened">>().toEqualTypeOf<{
      framework: string
      components: number
    }>()
    // @ts-expect-error: not a registered event
    telemetry.track("project.closed", {})
    // @ts-expect-error: components is a number
    telemetry.track("project.opened", { framework: "vite", components: "41" })
  })

  it("throws on attributes that don't match the schema, or an unknown name, while checking", () => {
    const { telemetry, sink } = setup()
    const wrong = { framework: "vite", components: 4.5 }
    // @ts-expect-error: an event that isn't registered
    expect(() => telemetry.track("project.closed", {})).toThrow(
      new TelemetryError("project.closed isn't a registered event")
    )
    expect(() => telemetry.track("project.opened", wrong)).toThrow(TelemetryError)
    expect(() => telemetry.track("project.opened", wrong)).toThrow(/components: /)
    expect(sink.events).toEqual([])
  })

  it("sends attributes as given when not checking, and drops an unknown name", () => {
    const { telemetry, sink } = setup({ check: false })
    telemetry.track("project.opened", { framework: "vite", components: 4.5 })
    // @ts-expect-error: an event that isn't registered
    telemetry.track("project.closed", {})
    expect(sink.events.map((event) => [event.name, event.attributes])).toEqual([
      ["project.opened", { framework: "vite", components: 4.5 }]
    ])
  })

  it("keeps an event's share of samples", () => {
    const rolls = [0.1, 0.3, 0.24, 0.9]
    const { telemetry, sink } = setup({ random: () => rolls.shift() ?? 1 })
    for (let index = 0; index < 4; index++) telemetry.track("gesture.sampled", {})
    expect(sink.events).toHaveLength(2)
  })

  it("carries the span it was recorded under, and the window and project set later", () => {
    const { telemetry, sink } = setup()
    const span = telemetry.startSpan("project.opened", { framework: "vite", components: 1 })
    telemetry.setContext({ project: "D:/shop" })
    telemetry.track("file.save_failed", { path: "src/app.par" }, { span })
    expect(sink.events[0]).toMatchObject({ project: "D:/shop", traceId: span.traceId, spanId: span.spanId })
  })

  it("keeps a sink's failure from the code that recorded it", () => {
    const failures: unknown[] = []
    const sink = createTestSink()
    const broken = {
      event: () => {
        throw new Error("offline")
      },
      span: () => undefined
    }
    const telemetry = createTelemetry({
      events,
      context,
      sinks: [broken, sink],
      check: true,
      onSinkError: (error) => failures.push(error)
    })
    telemetry.track("file.save_failed", { path: "a" })
    expect(failures).toEqual([new Error("offline")])
    expect(sink.events).toHaveLength(1)
  })
})

describe("startSpan", () => {
  it("adds what was learned by its end, such as a failure's code, to the attributes it started with", () => {
    const { telemetry, sink } = setup()
    telemetry.startSpan("file.save_failed", { path: "a.tsx" }).end("error", { path: "b.tsx" })
    expect(sink.spans[0]).toMatchObject({ outcome: "error", attributes: { path: "b.tsx" } })
  })

  it("records one event when it ends, with its start time, duration and outcome", () => {
    const { telemetry, sink, wait } = setup()
    const span = telemetry.startSpan("project.opened", { framework: "vite", components: 41 })
    expect(sink.spans).toEqual([])
    wait(1250)
    span.end()
    span.end("error")
    expect(sink.spans).toEqual([
      {
        ...context,
        name: "project.opened",
        time: "2026-11-05T12:00:00.000Z",
        level: "info",
        traceId: "00000000000000000000000000000001",
        spanId: "0000000000000002",
        durationMs: 1250,
        outcome: "ok",
        attributes: { framework: "vite", components: 41 }
      }
    ])
  })

  it("continues its parent's trace, as one from another process does", () => {
    const { telemetry, sink } = setup()
    const parent = { traceId: "4bf92f3577b34da6a3ce929d0e0e4736", spanId: "00f067aa0ba902b7" }
    const child = telemetry.startSpan("file.save_failed", { path: "a" }, { parent })
    child.end("cancelled")
    expect(child.traceId).toBe(parent.traceId)
    expect(sink.spans[0]).toMatchObject({ traceId: parent.traceId, parentSpanId: parent.spanId, outcome: "cancelled" })
  })

  it("carries the window and project it started in", () => {
    const { telemetry, sink } = setup()
    const span = telemetry.startSpan("file.save_failed", { path: "a" })
    telemetry.setContext({ windowId: "w2", project: "D:/blog" })
    span.end()
    expect(sink.spans[0]).toMatchObject({ windowId: "w1" })
    expect(sink.spans[0]).not.toHaveProperty("project")
  })

  it("keeps IDs for a span sampled out, recording nothing", () => {
    const { telemetry, sink } = setup({ random: () => 0.5 })
    const span = telemetry.startSpan("gesture.sampled", {})
    span.end()
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/)
    expect(sink.spans).toEqual([])
  })

  it("checks its attributes as it starts", () => {
    const { telemetry } = setup()
    // @ts-expect-error: path is a string
    expect(() => telemetry.startSpan("file.save_failed", { path: 1 })).toThrow(TelemetryError)
  })
})

describe("recent", () => {
  it("keeps the last events and ended spans, oldest first, 500 unless told", () => {
    const { telemetry } = setup({ keep: 3 })
    for (const path of ["a", "b", "c"]) telemetry.track("file.save_failed", { path })
    telemetry.startSpan("file.save_failed", { path: "d" }).end()
    expect(telemetry.recent().map((event) => event.attributes.path)).toEqual(["b", "c", "d"])

    const defaults = setup()
    for (let index = 0; index < 600; index++) defaults.telemetry.track("file.save_failed", { path: `${index}` })
    expect(defaults.telemetry.recent()).toHaveLength(500)
    expect(defaults.telemetry.recent()[0]?.attributes.path).toBe("100")
  })
})
