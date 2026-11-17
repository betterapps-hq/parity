import type { DocChange } from "@parity-app/multiplayer"
import { palette } from "@parity-app/presence-colors"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { setWindowTelemetry } from "../report-error.ts"
import { preview, type PreviewChange, type PreviewSurface } from "./drag-preview.ts"
import { placedBoards } from "./placed-boards.ts"
import { clock } from "./test-clock.ts"

const sink = createTestSink()
let timers = clock()
let frames: (() => void)[] = []
let listeners = new Set<(change: PreviewChange) => void>()

/** Draws the frame an update asked for. */
function drawFrame() {
  const waiting = frames
  frames = []
  waiting.forEach((draw) => draw())
}

/** Someone else's write to a design's position, as the room delivers it. */
function written(design: string, origin: DocChange["origin"] = "remote") {
  const change: PreviewChange = {
    origin,
    designs: { added: [], removed: [], renamed: [], changed: [{ design, fields: ["position"] }] },
    layers: { added: [], removed: [], moved: [], changed: [] }
  }

  listeners.forEach((listener) => listener(change))
}

const surface: PreviewSurface = {
  tab: "tab",
  // SAFETY: a board's preview reads no frames, so neither the canvas area nor the document's designs.
  area: {} as HTMLElement,
  // SAFETY: as above.
  doc: {} as PreviewSurface["doc"],
  // A canvas without boards drawn finds none to lift.
  editor: { pageToScreen: (point) => point, getContainer: () => ({ querySelector: () => null }) },
  writes: {
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    }
  }
}

const jonas = { color: palette(1), label: "Jonas Weber", extension: "multiplayer" }

beforeEach(() => {
  timers = clock()
  frames = []
  listeners = new Set()
  vi.stubGlobal("CSS", { escape: (value: string) => value })
  vi.stubGlobal("performance", { now: timers.now })
  vi.stubGlobal("window", {
    setTimeout: (run: () => void, ms: number) => timers.set(run, ms),
    clearTimeout: (timer: number) => timers.clear(timer),
    requestAnimationFrame: (draw: () => void) => frames.push(draw),
    cancelAnimationFrame: () => undefined,
    matchMedia: () => ({ matches: true })
  })
  vi.spyOn(Math, "random").mockReturnValue(0.05)
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
  vi.restoreAllMocks()
})

describe("preview of a board", () => {
  it("moves the board with their pointer once a frame, without writing, and settles on their write", () => {
    const shown = preview(surface, [{ target: { design: "pricing" }, at: { x: 330, y: 40 } }], jonas)
    expect(placedBoards.at("tab", "pricing")).toEqual({ x: 330, y: 40 })
    shown.update([{ target: { design: "pricing" }, at: { x: 320, y: 90 } }])
    shown.update([{ target: { design: "pricing" }, at: { x: 316, y: 196 } }])
    expect(placedBoards.at("tab", "pricing")).toEqual({ x: 330, y: 40 })
    drawFrame()
    expect(placedBoards.at("tab", "pricing")).toEqual({ x: 316, y: 196 })

    shown.settleOnWrite()
    // This person's own edit, or someone's write to another board, isn't the drop.
    written("pricing", "edit")
    written("home")
    expect(placedBoards.at("tab", "pricing")).toEqual({ x: 316, y: 196 })
    timers.tick(400)
    written("pricing")
    expect(placedBoards.at("tab", "pricing")).toBeUndefined()
    expect(sink.named("dragPreview.settled").map((event) => event.attributes)).toEqual([
      { extension: "multiplayer", kind: "board", items: 1, how: "write", durationMs: 400, concurrent: 1 }
    ])
  })

  it("settles at once on a write that came after its last move, before it was told to settle", () => {
    const shown = preview(surface, [{ target: { design: "pricing" }, at: { x: 330, y: 40 } }], jonas)
    written("pricing")
    shown.update([{ target: { design: "pricing" }, at: { x: 316, y: 196 } }])
    expect(placedBoards.at("tab", "pricing")).toEqual({ x: 330, y: 40 })

    // The drop's write, in a batch ahead of the drag's end.
    written("pricing")
    shown.settleOnWrite()
    expect(placedBoards.at("tab", "pricing")).toBeUndefined()
    expect(sink.named("dragPreview.settled").map((event) => event.attributes.how)).toEqual(["write"])
  })

  it("puts the board back where the document has it when no write comes within 2 s", () => {
    const shown = preview(surface, [{ target: { design: "pricing" }, at: { x: 330, y: 40 } }], jonas)
    shown.settleOnWrite()
    timers.tick(1999)
    expect(placedBoards.at("tab", "pricing")).toEqual({ x: 330, y: 40 })
    timers.tick(1)
    expect(placedBoards.at("tab", "pricing")).toBeUndefined()
    expect(sink.named("dragPreview.settled").map((event) => event.attributes.how)).toEqual(["timeout"])
  })

  it("shows two people's boards at once, each ending on its own", () => {
    const mia = preview(surface, [{ target: { design: "home" }, at: { x: 0, y: 0 } }], jonas)
    const priya = preview(surface, [{ target: { design: "pricing" }, at: { x: 5, y: 5 } }], { color: palette(2) })

    expect(placedBoards.at("tab", "home")).toEqual({ x: 0, y: 0 })
    expect(placedBoards.at("tab", "pricing")).toEqual({ x: 5, y: 5 })
    mia.cancel()
    expect(placedBoards.at("tab", "home")).toBeUndefined()
    expect(placedBoards.at("tab", "pricing")).toEqual({ x: 5, y: 5 })
    priya[Symbol.dispose]()
    expect(placedBoards.at("tab", "pricing")).toBeUndefined()
    expect(sink.named("dragPreview.settled").map(({ attributes }) => [attributes.how, attributes.concurrent])).toEqual([
      ["cancel", 2],
      ["disposed", 1]
    ])
  })
})
