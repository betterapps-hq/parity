import { CodedError } from "@parity-app/core"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import type { ExternalToast } from "sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { reportError, setWindowTelemetry, track } from "./report-error.ts"

const notifications = vi.hoisted(() => ({ error: vi.fn<(title: string, options: ExternalToast) => void>() }))

vi.mock("sonner", () => ({ toast: notifications }))

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
  notifications.error.mockReset()
})

describe("reportError", () => {
  it("shows the notification as given and records error.caught with the code and context", () => {
    const error = new CodedError("No design d1", { code: "unknown_design" })
    reportError(error, {
      operation: "layers.export",
      title: "Couldn't export",
      id: "progress",
      description: "No design d1",
      context: { designs: 2 }
    })

    expect(notifications.error).toHaveBeenCalledWith("Couldn't export", { id: "progress", description: "No design d1" })
    expect(sink.named("error.caught")).toMatchObject([
      {
        level: "error",
        attributes: {
          action: "layers.export",
          title: "Couldn't export",
          message: "No design d1",
          code: "unknown_design",
          context: { designs: 2 }
        }
      }
    ])
  })

  it("records a failure without a code, given as text", () => {
    reportError("Disk full", { operation: "project.autosave", title: "Couldn't save Demo" })

    expect(sink.named("error.caught")[0]?.attributes).toEqual({
      action: "project.autosave",
      title: "Couldn't save Demo",
      message: "Disk full"
    })
  })

  it("puts the event in the trace it belongs to", () => {
    const span = { traceId: "a".repeat(32), spanId: "b".repeat(16) }
    reportError(new Error("Nope"), { operation: "document.save", title: "Couldn't save", span })

    expect(sink.named("error.caught")[0]).toMatchObject(span)
  })

  it("still shows the notification without telemetry", () => {
    setWindowTelemetry(undefined)
    reportError(new Error("Nope"), { operation: "document.save", title: "Couldn't save" })

    expect(notifications.error).toHaveBeenCalledOnce()
    expect(sink.events).toEqual([])
  })
})

describe("track", () => {
  it("logs an event that doesn't match its schema instead of throwing", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
    // @ts-expect-error -- a mistake the development build's checks catch
    track("document.saved", { file: "a.par" })

    expect(logged).toHaveBeenCalledOnce()
    expect(sink.events).toEqual([])
    logged.mockRestore()
  })
})
