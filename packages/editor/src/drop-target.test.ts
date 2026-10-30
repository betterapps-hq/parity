import type { DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import type { Flow, Rect } from "./drop-slot.ts"
import { type DropQuery, dropTargetAt, type FrameLayout, frameLayout, type MeasuredLayer } from "./drop-target.ts"

const box = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  right: left + width,
  bottom: top + height
})
const column: Flow = { direction: "column", wraps: false }
const row: Flow = { direction: "row", wraps: false }
const grid: Flow = { direction: "row", wraps: true }

/**
 * The dashboard's stats as a frame 832px wide draws them at full size: four cards 188px wide with 16px between, in a
 * four-column grid inside 16px of padding, and a panel under them. They're instances of a stat card there; as layouts,
 * each could take a drop itself.
 */
const cards = ["revenue", "users", "issues", "uptime"]
const cardBox = (index: number) => box(16 + index * 204, 16, 188, 100)
const panelBox = box(16, 132, 800, 80)

function board(kind: "instance" | "layout"): DesignNode {
  const card = (id: string): DesignNode =>
    kind === "instance"
      ? { type: "instance", id, design: "stat-card" }
      : { type: "layout", id, children: [{ type: "text", id: `${id}-label`, text: id }] }
  return {
    type: "layout",
    id: "root",
    children: [
      { type: "layout", id: "stats", style: { display: "grid", columns: 4 }, children: cards.map(card) },
      { type: "layout", id: "panel", children: [{ type: "text", id: "panel-label", text: "Panel" }] }
    ]
  }
}

/** The board measured as the canvas measures it when a drag begins, parents before children. */
function measured(kind: "instance" | "layout"): FrameLayout {
  const layers: MeasuredLayer[] = [
    { id: "root", box: box(0, 0, 832, 228), flow: column },
    { id: "stats", box: box(16, 16, 800, 100), flow: grid },
    ...cards.flatMap((id, index): MeasuredLayer[] => {
      const at = cardBox(index)
      if (kind === "instance") return [{ id, box: at }]
      return [
        { id, box: at, flow: column },
        { id: `${id}-label`, box: box(at.left + 13, at.top + 13, 50, 18) }
      ]
    }),
    { id: "panel", box: panelBox, flow: row },
    { id: "panel-label", box: box(17, 133, 40, 18) }
  ]
  return frameLayout({ left: 0, top: 0, width: 832 }, layers)
}

/** Where `ids`, dragged in the board, would land with the pointer at a point, the frame drawn where it was measured. */
function dropAt(
  kind: "instance" | "layout",
  ids: string[],
  point: { x: number; y: number },
  query?: Partial<DropQuery>
) {
  return dropTargetAt({
    layout: measured(kind),
    frame: { left: 0, top: 0, width: 832 },
    design: "board",
    root: board(kind),
    point,
    source: "board",
    ids,
    ...query
  })
}

describe("reordering stat cards in a grid", () => {
  const issues = cardBox(2)
  const uptime = cardBox(3)

  it("lands a card dragged right past the middle of the next but one after it", () => {
    // Users, dragged right past the middle of Open issues, a little above the cards' middle. Index 3 is before Uptime:
    // Revenue, Issues, Users, Uptime.
    const point = { x: issues.left + 188 * 0.8, y: issues.top + 30 }
    expect(dropAt("instance", ["users"], point)?.target).toEqual({ design: "board", parent: "stats", index: 3 })
  })

  it("lands a card dragged left past the middle of the first before it", () => {
    const revenue = cardBox(0)
    const point = { x: revenue.left + 188 * 0.3, y: revenue.bottom - 10 }
    expect(dropAt("instance", ["issues"], point)?.target).toMatchObject({ parent: "stats", index: 0 })
  })

  it("marks the slot where the layout was, and gives the layout's children", () => {
    const found = dropAt("instance", ["users"], { x: issues.left + 188 * 0.8, y: issues.top + 30 })
    expect(found?.line).toEqual({ x: uptime.left - 2, y: uptime.top, w: 2, h: 100 })
    expect(found?.siblings).toEqual(cards)
  })

  it("follows the camera: the same place in the frame is the same slot", () => {
    const point = { x: issues.left + 188 * 0.8, y: issues.top + 30 }
    // The camera zooms out to half and pans.
    const frame = { left: 40, top: 25, width: 416 }
    const found = dropAt("instance", ["users"], { x: 40 + point.x / 2, y: 25 + point.y / 2 }, { frame })
    expect(found?.target).toMatchObject({ parent: "stats", index: 3 })
    expect(found?.line).toEqual({ x: 40 + (uptime.left - 2) / 2, y: 25 + uptime.top / 2, w: 1, h: 50 })
  })
})

describe("dragging a card beside cards that are layouts", () => {
  const users = cardBox(1)
  const issues = cardBox(2)

  it("stays in its own slot while the pointer is where it was", () => {
    // A little right of Users' middle, where Open issues' middle is once it slides into Users' place.
    const point = { x: users.left + 94 + 10, y: users.top + 50 }
    expect(dropAt("layout", ["users"], point)?.target).toMatchObject({ parent: "stats", index: 2 })
  })

  it("changes places with a neighbour it's dragged over, rather than going into it", () => {
    expect(dropAt("layout", ["users"], { x: issues.left + 188 * 0.8, y: issues.top + 50 })?.target).toMatchObject({
      parent: "stats",
      index: 3
    })
    // Over the text inside it, too.
    expect(dropAt("layout", ["users"], { x: issues.left + 20, y: issues.top + 20 })?.target).toMatchObject({
      parent: "stats",
      index: 2
    })
  })

  it("still goes into a layout outside its own", () => {
    const point = { x: panelBox.left + 400, y: panelBox.top + 40 }
    expect(dropAt("layout", ["users"], point)?.target).toEqual({ design: "board", parent: "panel", index: 1 })
  })

  it("goes into a card in another design, which isn't its own layout there", () => {
    const found = dropAt("layout", ["users"], { x: issues.left + 188 * 0.8, y: issues.top + 50 }, { source: "other" })
    expect(found?.target).toEqual({ design: "board", parent: "issues", index: 1 })
  })

  it("counts the dragged card as a slot in another design", () => {
    // Users isn't moving within this design, so it's a slot like the others.
    const found = dropAt("layout", ["users"], { x: users.left + 20, y: users.top + 80 }, { source: "other" })
    expect(found?.target).toMatchObject({ parent: "users", index: 1 })
    const between = dropAt("instance", ["users"], { x: issues.left + 30, y: issues.top + 50 }, { source: "other" })
    expect(between?.target).toMatchObject({ parent: "stats", index: 2 })
  })
})

describe("what can't take a drop", () => {
  it("leaves out children that aren't drawn, and a layer after them goes after them", () => {
    const layout = frameLayout({ left: 0, top: 0, width: 400 }, [
      { id: "row", box: box(0, 0, 400, 100), flow: row },
      { id: "first", box: box(0, 0, 100, 100) },
      // Hidden in this state: an empty box at the frame's corner.
      { id: "hidden", box: box(0, 0, 0, 0) },
      { id: "last", box: box(100, 0, 100, 100) }
    ])
    expect(layout.layers.map((layer) => layer.id)).toEqual(["row", "first", "last"])
    const root: DesignNode = {
      type: "layout",
      id: "row",
      children: ["first", "hidden", "last"].map((id) => ({ type: "text", id, text: id }))
    }
    const found = dropTargetAt({
      layout,
      frame: layout.frame,
      design: "board",
      root,
      point: { x: 300, y: 50 },
      source: "other",
      ids: ["moved"]
    })
    expect(found?.target).toMatchObject({ parent: "row", index: 3 })
  })

  it("keeps a layer measured without a box out, and a layout's flow only when it's drawn", () => {
    const layout = frameLayout({ left: 0, top: 0, width: 100 }, [
      { id: "shown", box: box(0, 0, 100, 100), flow: row },
      { id: "unmeasured", box: undefined, flow: column },
      { id: "collapsed", box: box(0, 0, 0, 0), flow: column }
    ])
    expect([...layout.boxes.keys()]).toEqual(["shown"])
    expect([...layout.flows.keys()]).toEqual(["shown"])
  })

  it("finds nothing when the layout under the pointer wasn't measured", () => {
    const layout = frameLayout({ left: 0, top: 0, width: 832 }, [{ id: "root", box: box(0, 0, 832, 228) }])
    const found = dropAt("instance", ["users"], { x: 100, y: 50 }, { layout })
    expect(found).toBeUndefined()
  })

  it("finds nothing in a design whose root isn't a layout", () => {
    const root: DesignNode = { type: "instance", id: "card", design: "stat-card" }
    expect(dropAt("instance", ["users"], { x: 100, y: 50 }, { root })).toBeUndefined()
  })
})
