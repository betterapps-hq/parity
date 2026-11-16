import { tmpdir } from "node:os"
import { join } from "node:path"
import { CodedError } from "@parity-app/core"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { traceWith } from "../shared/tracing.ts"
import { degraded } from "./degraded.ts"
import { startReopening } from "./reopening.ts"

const sink = createTestSink()

traceWith(
  createTelemetry({
    events: registeredEvents,
    context: { process: "service", installId: "install", sessionId: "session" },
    sinks: [sink],
    check: true
  })
)

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  sink.clear()
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => warn.mockRestore())

describe("recording what the service stopped doing", () => {
  it("records the feature, why, the error's code and the project, and logs the warning", () => {
    const error = Object.assign(new Error("EMFILE: too many open files, watch"), { code: "EMFILE" })
    degraded("watch", "can't watch D:/shop for changes", error, "D:/shop")

    expect(sink.named("service.degraded")).toMatchObject([
      {
        level: "warn",
        attributes: {
          feature: "watch",
          message: "EMFILE: too many open files, watch",
          code: "EMFILE",
          root: "D:/shop"
        }
      }
    ])
    expect(warn).toHaveBeenCalledWith("[service] can't watch D:/shop for changes: EMFILE: too many open files, watch")
  })

  it("takes a coded error's code, and leaves out what it doesn't know", () => {
    degraded(
      "prop_inference",
      "couldn't infer component props",
      new CodedError("No tsconfig", { code: "execution_failed" })
    )
    degraded("bitmap_cache", "sharp couldn't load", "libvips is missing")

    expect(sink.named("service.degraded").map((event) => event.attributes)).toEqual([
      { feature: "prop_inference", message: "No tsconfig", code: "execution_failed" },
      { feature: "bitmap_cache", message: "libvips is missing" }
    ])
  })

  it("records it when the open projects can't be kept", async () => {
    const file = join(tmpdir(), "parity-no-such-folder", String(Date.now()), "open-projects.json")
    const reopening = startReopening({ file, open: () => Promise.resolve(), close: () => Promise.resolve() })
    reopening.remember(["D:/shop"])
    await reopening.written()

    expect(sink.named("service.degraded")).toMatchObject([{ attributes: { feature: "reopening", code: "ENOENT" } }])
  })
})
