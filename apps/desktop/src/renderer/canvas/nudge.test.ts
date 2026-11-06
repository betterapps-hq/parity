import {
  type ContainerSpec,
  type DesignNode,
  defaultModeSettings,
  findNode,
  type NodeStyle,
  type NoteSpec
} from "@parity-app/core"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { DesignStore } from "../design-store.ts"
import { SelectionStore } from "../selection.ts"
import { nudgeSelection } from "./nudge.ts"

// The rules nudging follows, how far each arrow moves what, are `@parity-app/editor`'s, tested in move-resize.test.ts.
// These are the presses on the real stores: what's selected moving, 1px a press or 10px with Shift, and each run of
// presses as one undo step.

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

const order = (container: ContainerSpec, parent = "root") =>
  (findNode(container.root, parent) as Extract<DesignNode, { type: "layout" }>).children.map((child) => child.id)

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
  return { store, selection: new SelectionStore(), unit: 4 }
}

/** The badge's top, in pixels: 8 to begin with, 2 steps of 4px. */
function topPixels(store: DesignStore): number {
  return (findNode(store.getEntry("app.par#card")!.container.root, "badge")?.style?.top as number) * 4
}

afterEach(() => {
  vi.useRealTimers()
})

describe("nudging what's selected", () => {
  it("makes a run of presses one undo step, however long the pauses between them", () => {
    vi.useFakeTimers()
    const nudging = session()
    const { store, selection } = nudging
    selection.set({ design: "app.par#card", node: "badge" })
    const top = () => topPixels(store)
    for (let press = 0; press < 5; press++) {
      nudgeSelection(nudging, "down", false)
      vi.advanceTimersByTime(press % 2 === 0 ? 30 : 4000)
    }
    nudgeSelection(nudging, "down", true)
    expect(top()).toBe(23)
    store.undo()
    expect(top()).toBe(8)
    expect(store.getHistory().canUndo).toBe(false)
  })

  it("starts a new step after another edit or an undo between presses", () => {
    const nudging = session()
    const { store, selection } = nudging
    selection.set({ design: "app.par#card", node: "badge" })
    const top = () => topPixels(store)
    nudgeSelection(nudging, "down", false)
    store.updateContainer("app.par#card", "Rename", (container) => ({ ...container, name: "Profile" }))
    nudgeSelection(nudging, "down", false)
    expect(top()).toBe(10)
    store.undo()
    expect(top()).toBe(9)
    nudgeSelection(nudging, "down", true)
    store.undo()
    expect(top()).toBe(9)
    expect(store.getHistory().undoLabel).toBe("Rename")
  })

  it("leaves no step for a run that comes back where it began", () => {
    const nudging = session()
    const { store, selection } = nudging
    selection.set({ design: "app.par#card", node: "badge" })
    nudgeSelection(nudging, "down", false)
    nudgeSelection(nudging, "up", false)
    expect(store.getHistory().canUndo).toBe(false)
    expect(store.hasUnsaved()).toBe(false)
  })

  it("starts a new step when the selection changes, also back to what it was", () => {
    const nudging = session()
    const { store, selection } = nudging
    selection.set({ design: "app.par#card", node: "badge" })
    nudgeSelection(nudging, "down", false)
    selection.set({ design: "app.par#card", node: "title" })
    nudgeSelection(nudging, "down", false)
    store.undo()
    expect(order(store.getEntry("app.par#card")!.container)[1]).toBe("title")
    expect(store.getHistory().undoLabel).toBe("Nudge layer")
    store.redo()

    const top = () => topPixels(store)
    selection.set({ design: "app.par#card", node: "badge" })
    nudgeSelection(nudging, "down", false)
    // Away and back with no press between: the next press starts a run of its own.
    selection.set({ design: "app.par#card", node: "title" })
    selection.set({ design: "app.par#card", node: "badge" })
    nudgeSelection(nudging, "down", false)
    expect(top()).toBe(11)
    store.undo()
    expect(top()).toBe(10)
  })

  it("keeps a run going when the same layers are selected again, picked in another order", () => {
    const nudging = session()
    const { store, selection } = nudging
    const top = () => topPixels(store)
    selection.set({ design: "app.par#card", node: "badge", nodes: ["title", "badge"] })
    nudgeSelection(nudging, "down", false)
    // As syncing the canvas's selection can set it: the same layers, so the same run.
    selection.set({ design: "app.par#card", node: "title", nodes: ["badge", "title"] })
    nudgeSelection(nudging, "down", false)
    expect(top()).toBe(10)
    store.undo()
    expect(top()).toBe(8)
    expect(store.getHistory().canUndo).toBe(false)
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
