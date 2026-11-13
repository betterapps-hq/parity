import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { ServeAnswer, WindowMethod, WindowMethods } from "../../shared/protocol.ts"
import type { DesignStore } from "../design-store.ts"
import { setWindowTelemetry } from "../report-error.ts"
import { serveAgents } from "./handlers.ts"

const mocks = vi.hoisted(() => ({
  reloadDocument: vi.fn<DesignStore["reloadDocument"]>(),
  warning: vi.fn<(title: string, options: { action: { onClick: () => void } }) => void>()
}))

vi.mock("sonner", () => ({ toast: { warning: mocks.warning } }))

vi.mock("../workspace.ts", () => ({
  workspace: {
    getTabs: () => [{ id: "tab", session: { id: "project", store: { reloadDocument: mocks.reloadDocument } } }]
  }
}))

vi.mock("../canvas/CanvasEditor.tsx", () => ({ canvasIdFor: (key: string) => key }))

vi.mock("../replay.ts", () => ({ reportIds: () => ({}) }))

vi.mock("./presence.ts", () => ({ presence: { push: () => undefined } }))

const sink = createTestSink()

type Serve = (method: WindowMethod, params: WindowMethods[WindowMethod]["params"]) => Promise<ServeAnswer>

/** Serves agents, and gives the function the service's requests reach. */
function serving(): Serve {
  let serve: Serve | undefined
  vi.stubGlobal("document", { hasFocus: () => false })
  vi.stubGlobal("window", {
    addEventListener: () => undefined,
    canvasHost: { serve: (answer: Serve) => (serve = answer) }
  })
  serveAgents()

  return serve!
}

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
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("a design file changed on disk", () => {
  const document = { name: "Card", designs: [] }
  // SAFETY: the handler passes `document` on to the store, which the test stands in for, without reading it.
  const changed = { projectId: "project", path: "src/Card.canvas.json", document } as never

  it("records nothing when there were no unsaved changes, so it loaded", async () => {
    mocks.reloadDocument.mockReturnValue(true)
    await serving()("project.fileChanged", changed)
    expect(sink.named("document.conflicted")).toEqual([])
  })

  it("records a conflict with unsaved changes, and loading from disk when the person chooses it", async () => {
    mocks.reloadDocument.mockReturnValue(false)
    await serving()("project.fileChanged", changed)
    expect(sink.named("document.conflicted").map((event) => event.attributes)).toEqual([
      { file: "src/Card.canvas.json" }
    ])
    expect(sink.named("document.loadedFromDisk")).toEqual([])

    mocks.warning.mock.calls[0]![1].action.onClick()
    expect(mocks.reloadDocument).toHaveBeenLastCalledWith("src/Card.canvas.json", document, true)
    expect(sink.named("document.loadedFromDisk").map((event) => event.attributes)).toEqual([
      { file: "src/Card.canvas.json" }
    ])
  })
})
