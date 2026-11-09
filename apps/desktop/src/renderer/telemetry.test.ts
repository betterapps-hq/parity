import { Component } from "react"
import { beforeEach, describe, expect, it, vi } from "vite-plus/test"

const eventId = "0123456789abcdef0123456789abcdef"
const sentry = vi.hoisted(() => ({ captureException: vi.fn<(error: unknown, hint: unknown) => string>() }))

vi.mock("@sentry/electron/renderer", () => sentry)

const { caughtEventId, reactErrorHandlers } = await import("./telemetry.ts")

/** Stands in for `ErrorBoundary`: React hands the handlers the boundary that caught, and its props name it. */
class Boundary extends Component<{ name: string }> {}

describe("React errors sent to Sentry (PAR-620, PAR-667)", () => {
  beforeEach(() => {
    sentry.captureException.mockClear().mockReturnValue(eventId)
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

  it("keeps the event of an error a boundary caught, for a report from its fallback (PAR-704)", () => {
    const caught = new Error("Layers broke")
    reactErrorHandlers.onCaughtError(caught, {
      componentStack: "",
      errorBoundary: new Boundary({ name: "left.layers" })
    })
    expect(caughtEventId(caught)).toBe(eventId)
    const uncaught = new Error("The window broke")
    reactErrorHandlers.onUncaughtError(uncaught, { componentStack: "" })
    expect(caughtEventId(uncaught)).toBeUndefined()
    expect(caughtEventId("a thrown string")).toBeUndefined()
  })
})
