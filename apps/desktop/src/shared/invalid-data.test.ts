import { onInvalidData, parseData } from "@parity-app/core"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import { recordInvalidData } from "./invalid-data.ts"

const sink = createTestSink()

afterEach(() => {
  // Taking the listener's place, then stopping, leaves failed checks unrecorded for the next test.
  onInvalidData(() => undefined)()
  sink.clear()
})

function start() {
  recordInvalidData(
    createTelemetry({
      events: registeredEvents,
      context: { process: "service", installId: "install", sessionId: "session" },
      sinks: [sink],
      check: true
    })
  )
}

describe("recordInvalidData", () => {
  it("records a failed check as data.invalid, with its schema, problems and data, secrets scrubbed", () => {
    start()
    const settings = z.object({ port: z.number(), token: z.string() }).meta({ id: "settings" })
    expect(() => parseData(settings, { port: "80", token: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" })).toThrow(
      "/port: expected a number"
    )
    const [event] = sink.named("data.invalid")
    expect(event?.level).toBe("warn")
    expect(event?.attributes).toMatchObject({
      schema: "settings",
      pointer: "/port",
      message: "expected a number",
      issues: ["/port: expected a number"]
    })
    expect(event?.attributes.data).toContain('"port":"80"')
    expect(event?.attributes.data).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789")
  })

  it("names an unnamed schema by the function that checked with it, and cuts long data short", () => {
    start()

    function readNames(value: unknown) {
      return parseData(z.array(z.number()), value)
    }

    expect(() => readNames(["x".repeat(3000)])).toThrow("/0: expected a number")
    const [event] = sink.named("data.invalid")
    expect(event?.attributes.schema).toBe("readNames")
    expect(event?.attributes.data).toHaveLength(2001)
  })
})
