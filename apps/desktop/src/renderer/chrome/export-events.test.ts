import { CodedError } from "@parity-app/core"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { ServiceMethods } from "../../shared/protocol.ts"
import { setWindowTelemetry } from "../report-error.ts"
import { exportLayers } from "./commands.ts"

type LayersExport = ServiceMethods["layers.export"]

const service = vi.hoisted(() => ({
  request: vi.fn<(method: "layers.export", params: LayersExport["params"]) => Promise<LayersExport["result"]>>()
}))

vi.mock("../service.ts", () => service)

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn<() => string>(() => "progress"),
    success: vi.fn<() => void>(),
    warning: vi.fn<() => void>(),
    error: vi.fn<() => void>()
  }
}))

// Exporting names layers as the canvas does, which there isn't one of here.
vi.mock("../canvas/CanvasEditor.tsx", () => ({ canvasIdFor: (key: string) => key }))

const sink = createTestSink()

const card = [{ design: "card", name: "Card" }]
const png = [{ format: "png", scale: 2 }] as const

/** The clock reads `began` until the service is asked, then `began + took`. */
function exportTaking(took: number, answer: () => Promise<LayersExport["result"]>) {
  let now = 1000
  vi.spyOn(performance, "now").mockImplementation(() => now)
  service.request.mockImplementation(() => {
    now += took

    return answer()
  })
}

beforeEach(() => {
  vi.stubGlobal("window", {
    canvasHost: { pickFolder: () => Promise.resolve("C:/exports"), showItem: vi.fn<() => void>() }
  })
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("export events", () => {
  it("say how long an export took, from asking for it until its files are written", async () => {
    exportTaking(240.4, () => Promise.resolve({ files: ["C:/exports/Card@2x.png"], warnings: [] }))
    await exportLayers("project", card, png)

    expect(sink.named("export.done").map((event) => event.attributes)).toEqual([
      { kind: "layers", formats: ["png"], scales: [2], designs: 1, durationMs: 240, files: 1, warnings: 0 }
    ])
  })

  it("count the layers that couldn't be drawn in an export that still finished", async () => {
    exportTaking(10, () =>
      Promise.resolve({
        files: ["C:/exports/Card@2x.png"],
        warnings: ["Badge couldn't be drawn", "Avatar couldn't be drawn"]
      })
    )
    await exportLayers("project", card, png)

    expect(sink.named("export.done").map((event) => event.attributes.warnings)).toEqual([2])
  })

  it("say how long a failed export ran before it failed", async () => {
    exportTaking(75, () => Promise.reject(new CodedError("No design card", { code: "unknown_design" })))
    await exportLayers("project", card, png)

    expect(sink.named("export.failed").map((event) => event.attributes)).toEqual([
      { kind: "layers", formats: ["png"], scales: [2], designs: 1, durationMs: 75, code: "unknown_design" }
    ])
  })
})
