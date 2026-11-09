import { createTelemetry, createTestSink, frameTimeoutMs, registeredEvents } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { RenderedFrame, RenderJob } from "../shared/protocol.ts"
import { inSpan, traceWith } from "../shared/tracing.ts"
import { watchFrame } from "./frame-telemetry.ts"

const sink = createTestSink()

traceWith(
  createTelemetry({
    events: registeredEvents,
    context: { process: "main", installId: "install", sessionId: "session" },
    sinks: [sink],
    check: true
  })
)

const job = {
  projectId: "D:/shop",
  guestUrl: "http://localhost:5001",
  theme: [],
  tree: [],
  mode: { width: 400, viewport: { width: 1280, height: 800 }, classNames: [], attributes: {} },
  scale: 0.25,
  design: { key: "card", state: "empty", mode: "light" }
} as RenderJob

const frame = (extra: Partial<RenderedFrame> = {}): RenderedFrame => ({
  width: 400,
  height: 300,
  nodes: [{ id: "n1", x: 0, y: 0, width: 400, height: 300 }],
  overflowsX: false,
  unknownComponents: [],
  ...extra
})

/** Draws a frame in a `frame.rendered` span, as main's offscreen windows do, the clock moving as `steps` say. */
function draw(
  steps: (watch: ReturnType<typeof watchFrame>, tick: (ms: number) => void) => void,
  failed = vi.fn<() => void>()
) {
  let time = 1000

  const tick = (ms: number) => {
    time += ms
  }

  return inSpan("frame.rendered", { priority: "render", queuedMs: 12, whole: true }, (span) =>
    steps(
      watchFrame(job, "render", span, failed, () => time),
      tick
    )
  )
}

beforeEach(() => sink.clear())

afterEach(() => vi.useRealTimers())

describe("watchFrame", () => {
  it("times the render and the capture after it, and records the frame's design and size", async () => {
    await draw((watch, tick) => {
      tick(80)
      watch.rendered(frame())
      tick(40)
      watch.end(frame())
    })
    const [span] = sink.named("frame.rendered")
    expect(span).toMatchObject({
      outcome: "ok",
      attributes: {
        design: "card",
        state: "empty",
        mode: "light",
        priority: "render",
        queuedMs: 12,
        renderMs: 80,
        captureMs: 40,
        width: 400,
        height: 300,
        nodes: 1
      }
    })
    expect(sink.named("frame.failed")).toEqual([])
  })

  it("records a guest's error with its stack and why, under the frame's span, and pictures it", async () => {
    const failed = vi.fn<() => void>()
    await draw((watch) => {
      const broken = frame({
        error: "Cannot find module './theme'",
        errorStack: "Error: Cannot find module\n  at Card"
      })

      watch.rendered(broken)
      watch.end(broken)
    }, failed)
    const [span] = sink.named("frame.rendered")
    const [failure] = sink.named("frame.failed")
    expect(span).toMatchObject({ outcome: "error", attributes: { failure: "module not found" } })
    expect(failure).toMatchObject({
      level: "warn",
      spanId: span?.spanId,
      attributes: {
        design: "card",
        failure: "module not found",
        message: "Cannot find module './theme'",
        stack: "Error: Cannot find module\n  at Card"
      }
    })
    expect(failed).toHaveBeenCalledOnce()
  })

  it("records a frame still drawing after the timeout as timed out, once, and lets it finish", async () => {
    vi.useFakeTimers()
    const failed = vi.fn<() => void>()
    let finish: () => void = () => undefined

    const drawing = draw(
      (watch) =>
        new Promise<void>((resolve) => {
          finish = () => {
            watch.rendered(frame())
            watch.end(frame())
            resolve()
          }
        }),
      failed
    )

    await vi.advanceTimersByTimeAsync(frameTimeoutMs)
    expect(sink.named("frame.failed")[0]?.attributes).toMatchObject({ failure: "timed out" })
    finish()
    await drawing
    expect(sink.named("frame.rendered")[0]).toMatchObject({ outcome: "error", attributes: { failure: "timed out" } })
    expect(sink.named("frame.failed")).toHaveLength(1)
    expect(failed).toHaveBeenCalledOnce()
  })

  it("leaves a draw that threw to its span, which records the error", async () => {
    await expect(
      draw((watch) => {
        watch.end(undefined, true)
        throw new Error("The render window closed")
      })
    ).rejects.toThrow("The render window closed")
    expect(sink.named("frame.rendered")[0]).toMatchObject({ outcome: "error" })
    expect(sink.named("frame.failed")).toEqual([])
  })

  it("records a frame whose window's renderer crashed as crashed, without picturing the dead window", async () => {
    const failed = vi.fn<() => void>()
    await expect(
      draw((watch) => {
        watch.crashed()
        watch.end(undefined, true)
        throw new Error("Render frame was disposed before the request completed")
      }, failed)
    ).rejects.toThrow("Render frame was disposed")
    expect(sink.named("frame.failed")[0]?.attributes).toMatchObject({
      design: "card",
      failure: "crashed",
      message: "Its offscreen window's renderer crashed while drawing it"
    })
    expect(sink.named("frame.rendered")[0]).toMatchObject({ outcome: "error" })
    expect(failed).toHaveBeenCalledOnce()
  })

  it("records what the render page threw after the guest drew, with the page's message and stack", async () => {
    const failed = vi.fn<() => void>()
    await expect(
      draw((watch) => {
        watch.rendered(frame())
        watch.threw({ error: "canvasHeight is broken", errorStack: "TypeError: canvasHeight is broken\n  at measure" })
        watch.end(undefined, true)
        throw new Error("canvasHeight is broken")
      }, failed)
    ).rejects.toThrow("canvasHeight is broken")
    expect(sink.named("frame.failed")[0]?.attributes).toMatchObject({
      failure: "render threw",
      message: "canvasHeight is broken",
      stack: "TypeError: canvasHeight is broken\n  at measure"
    })
    expect(failed).toHaveBeenCalledOnce()
  })
})
