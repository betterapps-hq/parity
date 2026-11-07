import { Component } from "react"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

const sentry = vi.hoisted(() => ({ captureException: vi.fn<(error: unknown, hint: unknown) => void>() }))
vi.mock("@sentry/electron/renderer", () => sentry)

const { reactErrorHandlers } = await import("./telemetry.ts")

/** Stands in for `ErrorBoundary`: React hands the handlers the boundary that caught, and its props name it. */
class Boundary extends Component<{ name: string }> {}

describe("React errors sent to Sentry (PAR-620, PAR-667)", () => {
  beforeEach(() => {
    sentry.captureException.mockClear()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  it("tags an error a boundary caught with the boundary's name, as handled", () => {
    const error = new Error("Layers broke")
    reactErrorHandlers.onCaughtError(error, {
      componentStack: "\n    at LayerTree",
      errorBoundary: new Boundary({ name: "left.layers" })
    })
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      mechanism: { type: "react", handled: true },
      captureContext: {
        contexts: { react: { componentStack: "\n    at LayerTree" } },
        tags: { boundary: "left.layers" }
      }
    })
  })

  it("sends an error nothing caught without a boundary tag, as unhandled", () => {
    reactErrorHandlers.onUncaughtError(new Error("The window broke"), { componentStack: "\n    at App" })
    expect(sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      mechanism: { type: "react", handled: false },
      captureContext: { contexts: { react: { componentStack: "\n    at App" } } }
    })
  })
})
