import { describe, expect, it } from "vite-plus/test"
import { type Flow, flowOf, type Rect, type SlotChild, slotAt } from "./drop-slot.ts"

const box = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  right: left + width,
  bottom: top + height
})

/** Children laid out in a grid of `columns`, each `size` square with `gap` between, in order, from 0,0. */
function grid(count: number, columns: number, size = 100, gap = 10): SlotChild[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    box: box((index % columns) * (size + gap), Math.floor(index / columns) * (size + gap), size, size)
  }))
}

const without = (children: SlotChild[], ...moving: number[]) =>
  children.filter((child) => !moving.includes(child.index))
const gridFlow: Flow = { direction: "row", wraps: true }
const area = (children: SlotChild[]): Rect => ({
  left: 0,
  top: 0,
  right: Math.max(...children.map((child) => child.box.right)),
  bottom: Math.max(...children.map((child) => child.box.bottom))
})

/** The order a move gives, as `moveNodes` makes it: the moved child goes before what was at `index`. */
function reorder(names: string[], moving: number, index: number): string[] {
  const moved = names[moving]!
  const rest = names.filter((_, at) => at !== moving)
  const before = names.slice(0, index).filter((_, at) => at !== moving).length
  rest.splice(before, 0, moved)
  return rest
}

describe("reordering in a grid", () => {
  // The dashboard's stat cards: four in a four-column grid.
  const cards = grid(4, 4)
  const names = ["Revenue", "Users", "Issues", "Uptime"]
  const drop = (moving: number, point: { x: number; y: number }) =>
    slotAt(without(cards, moving), point, gridFlow, area(cards), cards.length)

  it("puts a card dragged right past the middle of the next but one after it", () => {
    // Users, dragged past the middle of Open issues, a little above the cards' middle.
    const { index } = drop(1, { x: 220 + 60, y: 40 })
    expect(reorder(names, 1, index)).toEqual(["Revenue", "Issues", "Users", "Uptime"])
  })

  it("lands the same anywhere up or down the row", () => {
    for (const y of [2, 40, 50, 60, 98]) expect(drop(1, { x: 280, y }).index).toBe(3)
  })

  it("puts a card dragged left past the middle of the first before it", () => {
    const { index } = drop(2, { x: 40, y: 50 })
    expect(reorder(names, 2, index)).toEqual(["Issues", "Revenue", "Users", "Uptime"])
  })

  it("leaves a card where it is short of a neighbour's middle", () => {
    expect(reorder(names, 1, drop(1, { x: 230, y: 50 }).index)).toEqual(names)
    expect(reorder(names, 1, drop(1, { x: 60, y: 50 }).index)).toEqual(names)
  })

  it("goes last past the middle of the last card", () => {
    expect(reorder(names, 0, drop(0, { x: 400, y: 50 }).index)).toEqual(["Users", "Issues", "Uptime", "Revenue"])
  })

  it("marks the slot with a line beside the card it goes before", () => {
    expect(drop(1, { x: 280, y: 40 }).line).toEqual({ x: 328, y: 0, w: 2, h: 100 })
  })
})

describe("reordering across a grid's rows", () => {
  // Six cards in three columns: 0 1 2 on the first row, 3 4 5 on the second.
  const cards = grid(6, 3)
  const drop = (moving: number, point: { x: number; y: number }) =>
    slotAt(without(cards, moving), point, gridFlow, area(cards), cards.length)

  it("lands on the row under the pointer, going down", () => {
    // Card 0 to past the middle of card 4.
    expect(drop(0, { x: 180, y: 150 }).index).toBe(5)
    // Before card 3, at the start of the second row.
    expect(drop(0, { x: 20, y: 150 }).index).toBe(3)
  })

  it("lands on the row under the pointer, going up", () => {
    // Card 5 to before card 1.
    expect(drop(5, { x: 120, y: 30 }).index).toBe(1)
    // After the first row's last card is before the second row's first.
    expect(drop(5, { x: 320, y: 30 }).index).toBe(3)
  })

  it("takes the nearer row when the pointer is in the gap between rows", () => {
    expect(drop(0, { x: 180, y: 103 }).index).toBe(2)
    expect(drop(0, { x: 180, y: 108 }).index).toBe(5)
  })

  it("takes the first row above them all, and the end below them all", () => {
    expect(drop(5, { x: 50, y: -40 }).index).toBe(1)
    expect(drop(0, { x: 50, y: 400 }).index).toBe(6)
  })

  it("keeps a card on the row that moving it empties", () => {
    // Four cards in three columns: the fourth alone on the second row.
    const four = grid(4, 3)
    expect(slotAt(without(four, 3), { x: 50, y: 150 }, gridFlow, area(four), 4).index).toBe(4)
  })
})

describe("reordering in a wrapping row", () => {
  // Chips of different widths, wrapping after the third.
  const chips: SlotChild[] = [
    { index: 0, box: box(0, 0, 80, 30) },
    { index: 1, box: box(90, 0, 120, 30) },
    { index: 2, box: box(220, 0, 60, 30) },
    { index: 3, box: box(0, 40, 140, 30) },
    { index: 4, box: box(150, 40, 50, 30) }
  ]
  const wrap: Flow = { direction: "row", wraps: true }
  const drop = (moving: number, point: { x: number; y: number }) =>
    slotAt(without(chips, moving), point, wrap, area(chips), chips.length)

  it("lands in the line under the pointer, in both directions", () => {
    expect(drop(0, { x: 160, y: 55 }).index).toBe(4)
    expect(drop(4, { x: 100, y: 15 }).index).toBe(1)
  })

  it("marks a line's end after its last chip", () => {
    expect(drop(4, { x: 300, y: 15 })).toEqual({ index: 3, line: { x: 281, y: 0, w: 2, h: 30 } })
  })

  it("keeps lines apart that are centred and narrower than the one above", () => {
    const centred: SlotChild[] = [
      { index: 0, box: box(25, 0, 250, 30) },
      { index: 1, box: box(125, 40, 50, 30) },
      { index: 2, box: box(0, 80, 300, 30) }
    ]
    expect(slotAt(centred, { x: 130, y: 55 }, wrap, box(0, 0, 300, 110), 3).index).toBe(1)
  })
})

describe("reordering along one line", () => {
  const row: Flow = { direction: "row", wraps: false }
  const column: Flow = { direction: "column", wraps: false }
  const items = [
    { index: 0, box: box(0, 0, 60, 30) },
    { index: 1, box: box(70, 0, 120, 30) }
  ]

  it("goes by the middles along a row, wherever the pointer is across it", () => {
    expect(slotAt(items, { x: 140, y: 200 }, row, box(0, 0, 200, 30), 2).index).toBe(2)
    expect(slotAt(items, { x: 120, y: -50 }, row, box(0, 0, 200, 30), 2).index).toBe(1)
  })

  it("goes by the middles down a column, with the line across the layout", () => {
    const stacked = [
      { index: 0, box: box(0, 0, 100, 30) },
      { index: 1, box: box(0, 40, 100, 30) }
    ]
    expect(slotAt(stacked, { x: 500, y: 50 }, column, box(-10, -10, 120, 90), 2)).toEqual({
      index: 1,
      line: { x: -6, y: 38, w: 112, h: 2 }
    })
  })

  it("marks the start of an empty layout", () => {
    expect(slotAt([], { x: 50, y: 50 }, row, box(10, 20, 100, 60), 0)).toEqual({
      index: 0,
      line: { x: 14, y: 24, w: 2, h: 52 }
    })
  })
})

describe("a layout's flow", () => {
  const style = { display: "flex", flexDirection: "row", flexWrap: "nowrap", gridAutoFlow: "row" }

  it("reads a grid as rows that wrap, or columns when it flows by columns", () => {
    expect(flowOf({ ...style, display: "grid" })).toEqual({ direction: "row", wraps: true })
    expect(flowOf({ ...style, display: "grid", gridAutoFlow: "column dense" })).toEqual({
      direction: "column",
      wraps: true
    })
  })

  it("reads a flex box's direction and wrapping", () => {
    expect(flowOf(style)).toEqual({ direction: "row", wraps: false })
    expect(flowOf({ ...style, flexDirection: "column", flexWrap: "wrap" })).toEqual({
      direction: "column",
      wraps: true
    })
  })

  it("reads anything else as a column", () => {
    expect(flowOf({ ...style, display: "block" })).toEqual({ direction: "column", wraps: false })
  })
})
