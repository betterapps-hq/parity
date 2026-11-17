import { describe, expect, it } from "vite-plus/test"
import { createMeasure, type MeasuredFrame, type MeasurePort, pickFrame, sameBox } from "./canvas-measure.ts"
import type { DrawnAt } from "./canvas-surface.ts"

const at = (x: number, y: number, width = 100, height = 100): DrawnAt => ({
  box: { x, y, width, height },
  radius: 8,
  size: { width: width * 2, height: height * 2 }
})

function frame(options: Partial<MeasuredFrame> & { box: DrawnAt; nodes?: Record<string, DrawnAt> }): MeasuredFrame {
  const { box, nodes = {} } = options

  return {
    mode: options.mode,
    state: options.state,
    primary: options.primary ?? false,
    asleep: options.asleep ?? false,
    measure: () => box,
    node: (id) => nodes[id],
    contains: (point) =>
      point.x >= box.box.x &&
      point.x <= box.box.x + box.box.width &&
      point.y >= box.box.y &&
      point.y <= box.box.y + box.box.height,
    nodesAt: (point) =>
      Object.entries(nodes)
        .filter(([, node]) => point.x >= node.box.x && point.x <= node.box.x + node.box.width)
        .map(([id]) => id)
  }
}

function fakePort(overrides: Partial<MeasurePort> = {}) {
  const frames: Record<string, MeasuredFrame[]> = {}
  const callbacks = new Set<() => void>()

  const port: MeasurePort = {
    board: (design) => (design === "home" ? at(0, 0, 400, 300) : undefined),
    boardDrawn: () => true,
    frames: (design) => frames[design] ?? [],
    designAt: (point) => (point.x < 400 && point.y < 300 ? "home" : undefined),
    pageToScreen: (point) => ({ x: point.x * 2, y: point.y * 2 }),
    screenToPage: (point) => ({ x: point.x / 2, y: point.y / 2 }),
    frame: (callback) => {
      callbacks.add(callback)

      return () => callbacks.delete(callback)
    },
    ...overrides
  }

  return {
    port,
    frames,
    tick: () => {
      const due = [...callbacks]
      callbacks.clear()
      due.forEach((callback) => callback())
    }
  }
}

describe("choosing a frame", () => {
  const frames = [
    { mode: "light", state: "base", primary: true },
    { mode: "dark", state: "base", primary: false },
    { mode: "dark", state: "hover", primary: false }
  ]

  it("takes the state and mode, then the mode, then the primary frame", () => {
    expect(pickFrame(frames, { mode: "dark", state: "hover" })).toBe(frames[2])
    expect(pickFrame(frames, { mode: "dark", state: "pressed" })).toBe(frames[1])
    expect(pickFrame(frames, { mode: "sepia", state: "hover" })).toBe(frames[0])
    expect(pickFrame(frames)).toBe(frames[0])
    expect(pickFrame([], { mode: "dark" })).toBeUndefined()
  })
})

describe("boxes", () => {
  it("measures a board, a frame and a node, and says when one isn't there", () => {
    const { port, frames } = fakePort()
    frames.home = [frame({ box: at(20, 40), primary: true, nodes: { title: at(30, 50, 40, 10) } })]
    const measure = createMeasure(port)
    expect(measure.box({ design: "home" }, { in: "board" })).toMatchObject({ kind: "drawn", box: { width: 400 } })
    expect(measure.box({ design: "home" })).toEqual({ kind: "drawn", ...at(20, 40) })
    expect(measure.box({ design: "home", node: "title" })).toEqual({ kind: "drawn", ...at(30, 50, 40, 10) })
    expect(measure.box({ design: "home", node: "gone" })).toEqual({ kind: "missing" })
    expect(measure.box({ design: "away" })).toEqual({ kind: "missing" })
  })

  it("points at a sleeping frame, or a culled board, rather than its nodes", () => {
    const { port, frames } = fakePort()
    frames.home = [frame({ box: at(20, 40), asleep: true, nodes: { title: at(30, 50) } })]
    expect(createMeasure(port).box({ design: "home", node: "title" })).toEqual({
      kind: "asleep",
      frame: at(20, 40).box
    })
    const culled = fakePort({ boardDrawn: () => false })
    expect(createMeasure(culled.port).box({ design: "home" })).toEqual({
      kind: "asleep",
      frame: at(0, 0, 400, 300).box
    })
  })

  it("tells listeners when a box changes, once a frame, and stops when disposed", () => {
    const { port, frames, tick } = fakePort()
    frames.home = [frame({ box: at(20, 40), primary: true })]
    const measure = createMeasure(port)
    const told: unknown[] = []
    const watch = measure.onBoxChange({ design: "home" }, (box) => told.push(box))
    tick()
    expect(told).toEqual([])
    frames.home = [frame({ box: at(60, 40), primary: true })]
    tick()
    tick()
    expect(told).toEqual([{ kind: "drawn", ...at(60, 40) }])
    frames.home = []
    watch.dispose()
    tick()
    expect(told).toHaveLength(1)
  })

  it("compares results within a hundredth", () => {
    expect(sameBox({ kind: "drawn", ...at(0, 0) }, { kind: "drawn", ...at(0.001, 0) })).toBe(true)
    expect(sameBox({ kind: "missing" }, { kind: "asleep", frame: at(0, 0).box })).toBe(false)
  })
})

describe("hits", () => {
  it("finds the design under a point, and the deepest node there", () => {
    const { port, frames } = fakePort()
    frames.home = [
      frame({
        box: at(20, 40, 200, 200),
        primary: true,
        nodes: { card: at(30, 50, 100, 100), title: at(40, 60, 20, 10) }
      })
    ]
    const measure = createMeasure(port)
    expect(measure.hit({ x: 50, y: 70 })).toEqual({ design: "home", node: "title" })
    expect(measure.hit({ x: 300, y: 20 })).toEqual({ design: "home" })
    expect(measure.hit({ x: 900, y: 900 })).toBeUndefined()
    expect(measure.screenToPage(measure.pageToScreen({ x: 3, y: 4 }))).toEqual({ x: 3, y: 4 })
  })
})
