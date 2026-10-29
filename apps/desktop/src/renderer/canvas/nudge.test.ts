import {
  type ContainerSpec,
  type DesignNode,
  defaultModeSettings,
  findNode,
  type NodeStyle,
  type NoteSpec
} from "@parity/core"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DesignStore } from "../design-store.ts"
import { SelectionStore } from "../selection.ts"
import {
  arrowOf,
  type Drawn,
  type Flow,
  flowOf,
  type FlowStyle,
  nudgeLayers,
  nudgeSelection,
  reorder,
  reorderStep,
  shiftInsets
} from "./nudge.ts"

const row: Flow = { axis: "row", reversed: false }
const column: Flow = { axis: "column", reversed: false }

const computed = (style: Partial<FlowStyle>): FlowStyle => ({
  display: "block",
  flexDirection: "row",
  gridTemplateColumns: "none",
  gridAutoFlow: "row",
  direction: "ltr",
  ...style
})

describe("reading a layout's flow", () => {
  it("knows the arrow keys", () => {
    expect(arrowOf("ArrowLeft")).toBe("left")
    expect(arrowOf("ArrowDown")).toBe("down")
    expect(arrowOf("Enter")).toBeUndefined()
  })

  it("reads rows and columns, reversed or not, from a flex box", () => {
    expect(flowOf(computed({ display: "flex", flexDirection: "row" }))).toEqual(row)
    expect(flowOf(computed({ display: "inline-flex", flexDirection: "row-reverse" }))).toEqual({
      axis: "row",
      reversed: true
    })
    expect(flowOf(computed({ display: "flex", flexDirection: "column" }))).toEqual(column)
    expect(flowOf(computed({ display: "flex", flexDirection: "column-reverse" }))).toEqual({
      axis: "column",
      reversed: true
    })
  })

  it("runs a row right to left in a right-to-left page", () => {
    expect(flowOf(computed({ display: "flex", flexDirection: "row", direction: "rtl" }))).toEqual({
      axis: "row",
      reversed: true
    })
    expect(flowOf(computed({ display: "flex", flexDirection: "row-reverse", direction: "rtl" }))).toEqual(row)
  })

  it("counts a grid's columns, as laid out or as written", () => {
    expect(flowOf(computed({ display: "grid", gridTemplateColumns: "120px 120px 120px" }))).toEqual({
      ...row,
      stride: 3
    })
    expect(flowOf(computed({ display: "grid", gridTemplateColumns: "[start] 50px [middle] 50px [end]" })).stride).toBe(
      2
    )
    expect(flowOf(computed({ display: "grid", gridTemplateColumns: "repeat(4, minmax(0px, 1fr))" })).stride).toBe(4)
    expect(flowOf(computed({ display: "grid", gridAutoFlow: "column" }))).toEqual(column)
  })

  it("stacks blocks in a column", () => {
    expect(flowOf(computed({ display: "block" }))).toEqual(column)
  })
})

describe("how far an arrow moves a layer in a layout", () => {
  it("moves one place along a row or column, and not across it", () => {
    expect(reorderStep(row, "left")).toBe(-1)
    expect(reorderStep(row, "right")).toBe(1)
    expect(reorderStep(row, "up")).toBeUndefined()
    expect(reorderStep(column, "up")).toBe(-1)
    expect(reorderStep(column, "down")).toBe(1)
    expect(reorderStep(column, "left")).toBeUndefined()
  })

  it("follows the layout's order on screen when it's reversed", () => {
    expect(reorderStep({ axis: "row", reversed: true }, "right")).toBe(-1)
    expect(reorderStep({ axis: "column", reversed: true }, "up")).toBe(1)
  })

  it("moves a row's worth of places up or down a grid", () => {
    const grid: Flow = { axis: "row", reversed: false, stride: 3 }
    expect(reorderStep(grid, "right")).toBe(1)
    expect(reorderStep(grid, "down")).toBe(3)
    expect(reorderStep(grid, "up")).toBe(-3)
  })
})

describe("reordering", () => {
  const children = (...ids: string[]) => ids.map((id) => ({ id, inFlow: !id.startsWith("x") }))

  it("moves a layer one place, and leaves one at the end where it is", () => {
    expect(reorder(children("a", "b", "c"), new Set(["a"]), 1)).toEqual(["b", "a", "c"])
    expect(reorder(children("a", "b", "c"), new Set(["c"]), 1)).toEqual(["a", "b", "c"])
    expect(reorder(children("a", "b", "c"), new Set(["a"]), -1)).toEqual(["a", "b", "c"])
  })

  it("moves several layers together, and stops them all at the end", () => {
    expect(reorder(children("a", "b", "c", "d"), new Set(["b", "c"]), 1)).toEqual(["a", "d", "b", "c"])
    expect(reorder(children("a", "b", "c", "d"), new Set(["a", "c"]), 1)).toEqual(["b", "a", "d", "c"])
    expect(reorder(children("a", "b", "c"), new Set(["b", "c"]), 1)).toEqual(["a", "b", "c"])
  })

  it("steps over absolutely placed and hidden layers, which keep their place in the list", () => {
    expect(reorder(children("a", "x1", "b", "c"), new Set(["a"]), 1)).toEqual(["b", "x1", "a", "c"])
  })

  it("moves a row down a grid only when there's a row below", () => {
    expect(reorder(children("a", "b", "c", "d", "e"), new Set(["a"]), 3)).toEqual(["b", "c", "d", "a", "e"])
    expect(reorder(children("a", "b", "c", "d", "e"), new Set(["c"]), 3)).toEqual(["a", "b", "c", "d", "e"])
    expect(reorder(children("a", "b", "c", "d", "e"), new Set(["e"]), -3)).toEqual(["a", "e", "b", "c", "d"])
  })
})

describe("moving an absolutely placed layer", () => {
  it("moves it by the sides it's placed from", () => {
    expect(shiftInsets({ top: 4, left: 2 }, 1, 0)).toEqual({ change: { left: 3 } })
    expect(shiftInsets({ top: 4, left: 2 }, 0, -10)).toEqual({ change: { top: -6 } })
    expect(shiftInsets({ bottom: 4, right: 2 }, 1, 1)).toEqual({ change: { right: 1, bottom: 3 } })
  })

  it("moves both sides of a layer stretched between them, so it keeps its size", () => {
    expect(shiftInsets({ left: 0, right: 0, top: 2 }, 1, 0)).toEqual({ change: { left: 1, right: -1 } })
  })

  it("moves a side set to a token, or not set, from where it's drawn", () => {
    const drawn = { top: 10, right: 71.5, bottom: 40, left: 2 }
    expect(shiftInsets({ top: "header", left: 2 }, 0, 1, drawn)).toEqual({ change: { top: 11 } })
    expect(shiftInsets({}, 1, 0, drawn)).toEqual({ change: { left: 3 } })
  })

  it("keeps an axis with a token when it isn't drawn, and an axis it doesn't move along", () => {
    expect(shiftInsets({ top: "header", left: 2 }, 0, 1)).toEqual({ change: {}, blocked: "top" })
    expect(shiftInsets({ top: "header", left: 2 }, 1, 0)).toEqual({ change: { left: 3 } })
    expect(shiftInsets({}, 1, 0)).toEqual({ change: { left: 1 } })
  })
})

const text = (id: string, extra: { style?: NodeStyle } = {}): DesignNode => ({ type: "text", id, text: id, ...extra })

function card(): ContainerSpec {
  return {
    id: "card",
    name: "Card",
    position: { x: 100, y: 200 },
    root: {
      type: "layout",
      id: "root",
      children: [
        { type: "layout", id: "actions", style: { direction: "row" }, children: [text("save"), text("cancel")] },
        text("title"),
        text("badge", { style: { position: "absolute", top: 2, left: 2 } }),
        text("body"),
        { type: "instance", id: "stat", design: "stat" }
      ]
    },
    states: [
      { id: "default", name: "Default" },
      { id: "loading", name: "Loading", overrides: { body: { hidden: true } } }
    ]
  }
}

const nothingDrawn: Drawn = { flow: () => undefined, insets: () => undefined }
const order = (container: ContainerSpec, parent = "root") =>
  (findNode(container.root, parent) as Extract<DesignNode, { type: "layout" }>).children.map((child) => child.id)

describe("nudging a design's layers", () => {
  const base = card().states[0]!

  it("reorders a layer along its layout, and leaves it across", () => {
    const right = nudgeLayers(card(), ["save"], base, "right", false, nothingDrawn).container
    expect(order(right, "actions")).toEqual(["cancel", "save"])
    const down = nudgeLayers(card(), ["save"], base, "down", false, nothingDrawn).container
    expect(order(down, "actions")).toEqual(["save", "cancel"])
    expect(order(nudgeLayers(card(), ["title"], base, "up", false, nothingDrawn).container)).toEqual([
      "title",
      "actions",
      "badge",
      "body",
      "stat"
    ])
  })

  it("moves one place with Shift too, and steps over absolutely placed layers", () => {
    // The badge is placed absolutely, so it keeps its place in the list while the title passes the body.
    const moved = nudgeLayers(card(), ["title"], base, "down", true, nothingDrawn).container
    expect(order(moved)).toEqual(["actions", "body", "badge", "title", "stat"])
  })

  it("steps over a layer the state hides", () => {
    const loading = card().states[1]!
    const moved = nudgeLayers(card(), ["title"], loading, "down", false, nothingDrawn).container
    expect(order(moved)).toEqual(["actions", "stat", "badge", "body", "title"])
  })

  it("follows the layout as the frame draws it, as a viewport can turn a row into a column", () => {
    const drawn: Drawn = { flow: (layer) => (layer === "save" ? column : undefined), insets: () => undefined }
    const moved = nudgeLayers(card(), ["save"], base, "down", false, drawn).container
    expect(order(moved, "actions")).toEqual(["cancel", "save"])
  })

  it("moves an absolutely placed layer a step, or ten with Shift", () => {
    const step = nudgeLayers(card(), ["badge"], base, "right", false, nothingDrawn).container
    expect(findNode(step.root, "badge")?.style).toEqual({ position: "absolute", top: 2, left: 3 })
    const ten = nudgeLayers(card(), ["badge"], base, "up", true, nothingDrawn).container
    expect(findNode(ten.root, "badge")?.style).toEqual({ position: "absolute", top: -8, left: 2 })
  })

  it("moves an absolutely placed layer in the state being edited only", () => {
    const loading = card().states[1]!
    const moved = nudgeLayers(card(), ["badge"], loading, "down", false, nothingDrawn).container
    expect(findNode(moved.root, "badge")?.style?.top).toBe(2)
    expect(moved.states[1]?.overrides?.badge).toEqual({ style: { top: 3 } })
  })

  it("names a token it couldn't move by", () => {
    const container = card()
    const badge = findNode(container.root, "badge")!
    badge.style = { position: "absolute", top: "header", left: 2 }
    expect(nudgeLayers(container, ["badge"], base, "down", false, nothingDrawn).blocked).toEqual({
      layer: "badge",
      side: "top",
      token: "header"
    })
  })

  it("leaves layers inside instances where they are", () => {
    const container = card()
    expect(nudgeLayers(container, ["stat/value"], base, "up", false, nothingDrawn).container).toBe(container)
  })
})

const note: NoteSpec = { id: "note-1", text: "Remember", position: { x: 0, y: 0 } }

function session() {
  const store = new DesignStore(
    [
      {
        path: "app.par",
        document: { version: 3, containers: [card(), { ...card(), id: "other", name: "Other" }], notes: [note] }
      }
    ],
    defaultModeSettings,
    "app.par",
    { saveDocument: async () => undefined, autosave: () => false }
  )
  return { store, selection: new SelectionStore() }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("nudging what's selected", () => {
  it("makes a run of presses one undo step, and a pause the start of another", () => {
    vi.useFakeTimers()
    const nudging = session()
    const { store, selection } = nudging
    selection.set({ design: "app.par#card", node: "badge" })
    const top = () => findNode(store.getEntry("app.par#card")!.container.root, "badge")?.style?.top
    for (let press = 0; press < 5; press++) {
      nudgeSelection(nudging, "down", false)
      vi.advanceTimersByTime(30)
    }
    expect(top()).toBe(7)
    vi.advanceTimersByTime(1500)
    nudgeSelection(nudging, "down", true)
    expect(top()).toBe(17)
    store.undo()
    expect(top()).toBe(7)
    store.undo()
    expect(top()).toBe(2)
    expect(store.getHistory().canUndo).toBe(false)
  })

  it("starts a new step when the selection changes", () => {
    vi.useFakeTimers()
    const nudging = session()
    const { store, selection } = nudging
    selection.set({ design: "app.par#card", node: "badge" })
    nudgeSelection(nudging, "down", false)
    selection.set({ design: "app.par#card", node: "title" })
    nudgeSelection(nudging, "down", false)
    store.undo()
    expect(order(store.getEntry("app.par#card")!.container)[1]).toBe("title")
    expect(store.getHistory().undoLabel).toBe("Nudge layer")
  })

  it("moves designs by 1px, or 10px with Shift, together as one step", () => {
    vi.useFakeTimers()
    const nudging = session()
    const { store, selection } = nudging
    selection.set({ design: "app.par#other", designs: ["app.par#card", "app.par#other"] })
    nudgeSelection(nudging, "left", false)
    nudgeSelection(nudging, "down", true)
    const positions = () => store.getEntries().map((entry) => entry.container.position)
    expect(positions()).toEqual([
      { x: 99, y: 210 },
      { x: 99, y: 210 }
    ])
    store.undo()
    expect(positions()).toEqual([
      { x: 100, y: 200 },
      { x: 100, y: 200 }
    ])
  })

  it("moves the design a mode column belongs to, and a text note", () => {
    const nudging = session()
    const { store, selection } = nudging
    selection.set({ design: "app.par#card", mode: "desktop" })
    nudgeSelection(nudging, "right", false)
    expect(store.getEntry("app.par#card")!.container.position).toEqual({ x: 101, y: 200 })
    selection.set({ note: "app.par#note-1" })
    nudgeSelection(nudging, "up", true)
    expect(store.getNotes()[0]!.note.position).toEqual({ x: 0, y: -10 })
  })
})
