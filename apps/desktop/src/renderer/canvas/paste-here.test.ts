import { type ContainerSpec, type DesignNode, findNode, nodeIds, type NodeStyle } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import type { Rect } from "./drop-slot.ts"
import { type HereLayout, pasteHere } from "./paste-here.ts"

const text = (id: string, style?: NodeStyle): DesignNode => ({
  type: "text",
  id,
  text: id,
  ...(style ? { style } : {})
})
const box = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  right: left + width,
  bottom: top + height
})

/**
 * The dashboard's four stat cards in a row, and a day of a calendar: an absolutely placed Events layout holding
 * absolutely placed slots, as the example's Calendar does.
 */
function dashboard(): ContainerSpec {
  return {
    id: "dashboard",
    name: "Dashboard",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "root",
      children: [
        {
          type: "layout",
          id: "stats",
          style: { direction: "row", gap: 4 },
          children: [text("revenue"), text("issues"), text("users"), text("uptime")]
        },
        {
          type: "layout",
          id: "day",
          children: [
            text("hours"),
            {
              type: "layout",
              id: "events",
              style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 17 },
              children: [
                {
                  type: "layout",
                  id: "review",
                  style: { position: "absolute", top: 40, left: 0, right: 0 },
                  children: []
                }
              ]
            }
          ]
        },
        { type: "layout", id: "footer", children: [] }
      ]
    },
    states: [
      { id: "default", name: "Default" },
      // A state that places the stat cards' row absolutely, as a state can.
      { id: "floating", name: "Floating", overrides: { stats: { style: { position: "absolute", top: 2, left: 2 } } } }
    ]
  }
}

const base = dashboard().states[0]!
const floating = dashboard().states[1]!
const card: DesignNode = {
  type: "layout",
  id: "card",
  style: { padding: 4 },
  children: [text("card-title")]
}
const badge = text("badge", { position: "absolute", top: 1, right: 2, width: 6 })

/** The stat cards' row as a frame drawn at full size draws it, each card 100px wide with 16px between them. */
const stats = (point: { x: number; y: number }, extra: Partial<HereLayout> = {}): HereLayout => ({
  layout: "stats",
  children: [0, 1, 2, 3].map((index) => ({ index, box: box(100 + index * 116, 200, 100, 60) })),
  flow: { direction: "row", wraps: false },
  box: box(100, 200, 448, 60),
  point,
  origin: { x: 100, y: 200 },
  scale: 1,
  unit: 4,
  ...extra
})

/** Calendar's Events, 400 by 600 on screen at half the frame's size, its inside starting at (60, 80). */
const events = (point: { x: number; y: number }): HereLayout => ({
  layout: "events",
  children: [{ index: 0, box: box(60, 100, 400, 32) }],
  flow: { direction: "column", wraps: false },
  box: box(60, 80, 400, 600),
  point,
  origin: { x: 60, y: 80 },
  scale: 0.5,
  unit: 4
})

const children = (container: ContainerSpec, id: string) => {
  const node = findNode(container.root, id)
  return node?.type === "layout" ? node.children.map((child) => child.id) : []
}

describe("paste here", () => {
  it("puts layers in the slot under the pointer, in a row", () => {
    // Just past the middle of Issues: after it, before Users.
    const { container, copies } = pasteHere(dashboard(), [card], stats({ x: 280, y: 230 }), base)
    expect(children(container, "stats")).toEqual(["revenue", "issues", copies[0], "users", "uptime"])
    expect(findNode(container.root, copies[0]!)?.style).toEqual({ padding: 4 })
  })

  it("puts them first before the first card's middle, and last past the last card", () => {
    const first = pasteHere(dashboard(), [card], stats({ x: 120, y: 210 }), base)
    expect(children(first.container, "stats")[0]).toBe(first.copies[0])
    const last = pasteHere(dashboard(), [card], stats({ x: 540, y: 250 }), base)
    expect(children(last.container, "stats").at(-1)).toBe(last.copies[0])
  })

  it("keeps several copies together, in the order they were copied", () => {
    const { container, copies } = pasteHere(dashboard(), [card, text("note")], stats({ x: 160, y: 230 }), base)
    expect(copies).toHaveLength(2)
    expect(children(container, "stats")).toEqual(["revenue", ...copies, "issues", "users", "uptime"])
  })

  it("gives the copies fresh ids, so the same layers paste twice", () => {
    const once = pasteHere(dashboard(), [card], stats({ x: 160, y: 230 }), base)
    const twice = pasteHere(once.container, [card], stats({ x: 160, y: 230 }), base)
    expect(nodeIds(dashboard().root).has(once.copies[0]!)).toBe(false)
    expect(twice.copies[0]).not.toBe(once.copies[0])
    expect(findNode(twice.container.root, twice.copies[0]!)).toBeDefined()
  })

  it("leaves a hidden card out of the slots, so a copy after it goes after it", () => {
    // Users isn't drawn: the pointer past Issues's middle goes before Uptime, after the hidden Users.
    const drawn = stats({ x: 280, y: 230 }).children.filter((child) => child.index !== 2)
    const { container, copies } = pasteHere(dashboard(), [card], stats({ x: 400, y: 230 }, { children: drawn }), base)
    expect(children(container, "stats")).toEqual(["revenue", "issues", "users", copies[0], "uptime"])
  })

  it("puts a copy into an empty layout", () => {
    const footer = { ...stats({ x: 300, y: 500 }), layout: "footer", children: [], box: box(100, 480, 448, 40) }
    const { container, copies } = pasteHere(dashboard(), [card], footer, base)
    expect(children(container, "footer")).toEqual(copies)
    expect(findNode(container.root, copies[0]!)?.style).toEqual({ padding: 4 })
  })

  it("puts layers in an absolutely placed layout at the pointer, on top of what's in it", () => {
    // 100px right of its inside and 200px down, on screen at half size: 200 and 400 frame pixels, 50 and 100 steps.
    const { container, copies } = pasteHere(dashboard(), [card], events({ x: 160, y: 280 }), base)
    expect(children(container, "events")).toEqual(["review", copies[0]])
    expect(findNode(container.root, copies[0]!)?.style).toEqual({
      padding: 4,
      position: "absolute",
      left: 50,
      top: 100
    })
  })

  it("places them in half steps, as dragging does", () => {
    // 7px and 5px on screen at half size are 14 and 10 frame pixels: 3.5 and 2.5 steps.
    const { container, copies } = pasteHere(dashboard(), [text("note")], events({ x: 67, y: 85 }), base)
    expect(findNode(container.root, copies[0]!)?.style).toEqual({ position: "absolute", left: 3.5, top: 2.5 })
  })

  it("replaces a copy's own insets with the pointer's", () => {
    const { container, copies } = pasteHere(dashboard(), [badge], events({ x: 160, y: 280 }), base)
    expect(findNode(container.root, copies[0]!)?.style).toEqual({ position: "absolute", width: 6, left: 50, top: 100 })
  })

  it("puts a copy that's absolutely placed itself in the slot, at the pointer", () => {
    const { container, copies } = pasteHere(dashboard(), [badge], stats({ x: 280, y: 230 }), base)
    expect(children(container, "stats")).toEqual(["revenue", "issues", copies[0], "users", "uptime"])
    // 180px and 30px from the row's inside at full size: 45 and 7.5 steps.
    expect(findNode(container.root, copies[0]!)?.style).toEqual({ position: "absolute", width: 6, left: 45, top: 7.5 })
  })

  it("reads whether the layout is absolutely placed from the state shown", () => {
    const { container, copies } = pasteHere(dashboard(), [card], stats({ x: 280, y: 230 }), floating)
    expect(children(container, "stats")).toEqual(["revenue", "issues", "users", "uptime", copies[0]])
    expect(findNode(container.root, copies[0]!)?.style).toMatchObject({ position: "absolute", left: 45, top: 7.5 })
  })

  it("pastes nothing into what isn't one of the design's layouts", () => {
    const into = (layout: string) => pasteHere(dashboard(), [card], { ...stats({ x: 280, y: 230 }), layout }, base)
    expect(into("revenue").copies).toEqual([])
    expect(into("gone").copies).toEqual([])
    expect(into("revenue").container).toEqual(dashboard())
  })
})
