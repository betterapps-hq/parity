import {
  type ContainerSpec,
  type DesignNode,
  defaultModeSettings,
  findNode,
  lengthSteps,
  type NodeStyle,
  type NoteSpec,
  type ReferenceSpec
} from "@parity-app/core"
import {
  containerEntries,
  containerEntry,
  noteEntries,
  type ProjectDoc,
  referenceEntries,
  updateContainer
} from "@parity-app/multiplayer"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { openTestSession } from "../doc-fixtures.ts"
import { SelectionStore } from "../selection.ts"
import { nudgeSelection } from "./nudge.ts"

// The rules nudging follows, how far each arrow moves what, are `@parity-app/editor`'s, tested in move-resize.test.ts.
// These are the presses on a real document and selection: what's selected moving, 1px a press or 10px with Shift, and each run of
// presses as one undo step.

const text = (id: string, extra: { style?: NodeStyle } = {}): DesignNode => ({ type: "text", id, text: id, ...extra })

function card(): ContainerSpec {
  return {
    id: "card",
    name: "Card",
    // A component, since only a component or a story has states.
    kind: "component",
    position: { x: 100, y: 200 },
    root: {
      type: "layout",
      id: "root",
      children: [
        { type: "layout", id: "actions", style: { flexDirection: "row" }, children: [text("save"), text("cancel")] },
        text("title"),
        text("badge", { style: { position: "absolute", top: { step: 2 }, left: { step: 2 } } }),
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
  // SAFETY: the tests ask only for parents that are layouts.
  (findNode(container.root, parent) as Extract<DesignNode, { type: "layout" }>).children.map((child) => child.id)

const note: NoteSpec = { id: "note-1", text: "Remember", position: { x: 0, y: 0 } }

const reference: ReferenceSpec = {
  id: "ref-1",
  connector: "mobbin",
  sourceId: "screen-1",
  app: "Ledgerly",
  platform: "web",
  link: "https://mobbin.com/screens/1",
  image: { url: "https://images.example/1.png" },
  position: { x: 2000, y: 0 }
}

function session() {
  const designs = openTestSession(
    [
      {
        path: "app.par",
        document: {
          version: 4,
          containers: [card(), { ...card(), id: "other", name: "Other" }],
          notes: [note],
          references: [reference]
        }
      }
    ],
    { modes: defaultModeSettings, main: "app.par" }
  )

  return { doc: designs.doc, saver: designs.saver, selection: new SelectionStore(), unit: 4 }
}

/** The badge's top, in pixels: 8 to begin with, 2 steps of 4px. */
function topPixels(doc: ProjectDoc): number {
  // The badge is placed in steps by the example and by every nudge.
  return lengthSteps(findNode(doc.design("app.par#card")!.root, "badge")?.style?.top)! * 4
}

afterEach(() => {
  vi.useRealTimers()
})

describe("nudging what's selected", () => {
  it("makes a run of presses one undo step, however long the pauses between them", () => {
    vi.useFakeTimers()
    const nudging = session()
    const { doc, selection } = nudging
    selection.set({ design: "app.par#card", node: "badge" })
    const top = () => topPixels(doc)

    for (let press = 0; press < 5; press++) {
      nudgeSelection(nudging, "down", false)
      vi.advanceTimersByTime(press % 2 === 0 ? 30 : 4000)
    }

    nudgeSelection(nudging, "down", true)
    expect(top()).toBe(23)
    doc.undo()
    expect(top()).toBe(8)
    expect(doc.history().canUndo).toBe(false)
  })

  it("starts a new step after another edit or an undo between presses", () => {
    const nudging = session()
    const { doc, selection } = nudging
    selection.set({ design: "app.par#card", node: "badge" })
    const top = () => topPixels(doc)
    nudgeSelection(nudging, "down", false)
    updateContainer(doc, "app.par#card", "Rename", (container) => ({ ...container, name: "Profile" }))
    nudgeSelection(nudging, "down", false)
    expect(top()).toBe(10)
    doc.undo()
    expect(top()).toBe(9)
    nudgeSelection(nudging, "down", true)
    doc.undo()
    expect(top()).toBe(9)
    expect(doc.history().undo[0]).toBe("Rename")
  })

  it("leaves no step for a run that comes back where it began", () => {
    const nudging = session()
    const { doc, saver, selection } = nudging
    selection.set({ design: "app.par#card", node: "badge" })
    nudgeSelection(nudging, "down", false)
    nudgeSelection(nudging, "up", false)
    expect(doc.history().canUndo).toBe(false)
    expect(saver.hasUnsaved()).toBe(false)
  })

  it("starts a new step when the selection changes, also back to what it was", () => {
    const nudging = session()
    const { doc, selection } = nudging
    selection.set({ design: "app.par#card", node: "badge" })
    nudgeSelection(nudging, "down", false)
    selection.set({ design: "app.par#card", node: "title" })
    nudgeSelection(nudging, "down", false)
    doc.undo()
    expect(order(doc.design("app.par#card")!)[1]).toBe("title")
    expect(doc.history().undo[0]).toBe("Nudge layer")
    doc.redo()

    const top = () => topPixels(doc)
    selection.set({ design: "app.par#card", node: "badge" })
    nudgeSelection(nudging, "down", false)
    // Away and back with no press between: the next press starts a run of its own.
    selection.set({ design: "app.par#card", node: "title" })
    selection.set({ design: "app.par#card", node: "badge" })
    nudgeSelection(nudging, "down", false)
    expect(top()).toBe(11)
    doc.undo()
    expect(top()).toBe(10)
  })

  it("keeps a run going when the same layers are selected again, picked in another order", () => {
    const nudging = session()
    const { doc, selection } = nudging
    const top = () => topPixels(doc)
    selection.set({ design: "app.par#card", node: "badge", nodes: ["title", "badge"] })
    nudgeSelection(nudging, "down", false)
    // As syncing the canvas's selection can set it: the same layers, so the same run.
    selection.set({ design: "app.par#card", node: "title", nodes: ["badge", "title"] })
    nudgeSelection(nudging, "down", false)
    expect(top()).toBe(10)
    doc.undo()
    expect(top()).toBe(8)
    expect(doc.history().canUndo).toBe(false)
  })

  it("moves designs by 1px, or 10px with Shift, together as one step", () => {
    vi.useFakeTimers()
    const nudging = session()
    const { doc, selection } = nudging
    selection.set({ design: "app.par#other", designs: ["app.par#card", "app.par#other"] })
    nudgeSelection(nudging, "left", false)
    nudgeSelection(nudging, "down", true)
    const positions = () => containerEntries(doc).map((entry) => entry.container.position)
    expect(positions()).toEqual([
      { x: 99, y: 210 },
      { x: 99, y: 210 }
    ])
    doc.undo()
    expect(positions()).toEqual([
      { x: 100, y: 200 },
      { x: 100, y: 200 }
    ])
  })

  it("moves the design a mode column belongs to, and a text note", () => {
    const nudging = session()
    const { doc, selection } = nudging
    selection.set({ design: "app.par#card", mode: "desktop" })
    nudgeSelection(nudging, "right", false)
    expect(containerEntry(doc, "app.par#card")!.container.position).toEqual({ x: 101, y: 200 })
    selection.set({ note: "app.par#note-1" })
    nudgeSelection(nudging, "up", true)
    expect(noteEntries(doc)[0]!.note.position).toEqual({ x: 0, y: -10 })
  })

  it("moves a reference, as one step to undo", () => {
    const nudging = session()
    const { doc, selection } = nudging
    selection.set({ reference: "app.par#ref-1" })
    nudgeSelection(nudging, "left", false)
    nudgeSelection(nudging, "down", true)
    expect(referenceEntries(doc)[0]!.reference.position).toEqual({ x: 1999, y: 10 })
    doc.undo()
    expect(referenceEntries(doc)[0]!.reference.position).toEqual({ x: 2000, y: 0 })
  })
})
