import { describe, expect, it } from "vite-plus/test"
import {
  distancesBetween,
  lockedEdgeMoves,
  resizedBox,
  resizeEdges,
  type SnapBox,
  snapBox,
  snapLayer,
  snaps
} from "./snap.ts"

/** Two designs on the canvas: a sign-in page, and a dashboard to its right. */
const signIn: SnapBox = { x: 0, y: 0, w: 400, h: 300 }
const dashboard: SnapBox = { x: 500, y: 0, w: 600, h: 400 }

/** A card 200 by 100 being dragged with its top left at a point. */
const card = (x: number, y: number): SnapBox => ({ x, y, w: 200, h: 100 })

describe("snapping a design to the designs around it", () => {
  it("locks its left to another's left when it comes within 8 screen pixels", () => {
    expect(snapBox(card(6, 500), [signIn], 1)).toMatchObject({ x: 0, y: 500 })
  })

  it("moves freely farther away than that", () => {
    expect(snapBox(card(9, 500), [signIn], 1)).toEqual({ x: 9, y: 500, guides: [] })
  })

  it("counts the distance on screen, so it's farther on the page zoomed out", () => {
    // 12 page pixels away is 6 on screen at half size, and 24 at double.
    expect(snapBox(card(12, 500), [signIn], 0.5)).toMatchObject({ x: 0 })
    expect(snapBox(card(12, 500), [signIn], 2)).toMatchObject({ x: 12 })
  })

  it("lines up centres and ends with centres and ends", () => {
    // Its centre, 97 + 100, to the sign-in page's, 200.
    expect(snapBox(card(97, 500), [signIn], 1)).toMatchObject({ x: 100 })
    // Its right, 497, to the dashboard's left, 500.
    expect(snapBox(card(297, 500), [dashboard], 1)).toMatchObject({ x: 300 })
    // Its middle, 150 + 50, to the dashboard's, 200.
    expect(snapBox(card(1200, 145), [dashboard], 1)).toMatchObject({ x: 1200, y: 150 })
  })

  it("locks along each axis separately", () => {
    // Its left, 403, to the sign-in page's right, 400; its top, 296, to the sign-in page's bottom, 300.
    expect(snapBox(card(403, 296), [signIn, dashboard], 1)).toMatchObject({ x: 400, y: 300 })
  })

  it("takes the nearest line, though a farther one comes first", () => {
    const near: SnapBox = { x: 0, y: 0, w: 100, h: 100 }
    const nearer: SnapBox = { x: 308, y: 0, w: 100, h: 100 }
    // Its left, 106, is 6 from the first box's right; its right, 306, is 2 from the second's left.
    expect(snapBox(card(106, 500), [near, nearer], 1)).toMatchObject({ x: 108 })
  })

  it("of lines just as near, takes the first box's", () => {
    const left: SnapBox = { x: 0, y: 0, w: 100, h: 100 }
    const right: SnapBox = { x: 10, y: 200, w: 100, h: 100 }
    // Left 5 is 5 from both 0 and 10.
    expect(snapBox(card(5, 500), [left, right], 1)).toMatchObject({ x: 0 })
    expect(snapBox(card(5, 500), [right, left], 1)).toMatchObject({ x: 10 })
  })

  it("draws a guide along each axis it locked, spanning both boxes", () => {
    const snapped = snapBox(card(403, 296), [signIn], 1)
    expect(snapped.guides).toEqual([
      // A vertical line at the sign-in page's right, from its top to the card's bottom.
      { axis: "x", from: { x: 400, y: 0 }, to: { x: 400, y: 400 } },
      // A horizontal line at its bottom, from its left to the card's right.
      { axis: "y", from: { x: 0, y: 300 }, to: { x: 600, y: 300 } }
    ])
  })

  it("snaps to nothing with nothing around it", () => {
    expect(snapBox(card(3, 4), [], 1)).toEqual({ x: 3, y: 4, guides: [] })
  })
})

/** A panel 400 by 300 with a badge in it, and a chip 100 by 20 being dragged with its top left at a point. */
const panel: SnapBox = { x: 0, y: 0, w: 400, h: 300 }
const badge: SnapBox = { x: 40, y: 40, w: 80, h: 40 }
const chip = (x: number, y: number): SnapBox => ({ x, y, w: 100, h: 20 })
const inPanel = { siblings: [badge], parent: panel }

describe("snapping a layer to its siblings and its parent", () => {
  it("locks its left to a sibling's left within 8 screen pixels, with a guide and the gap between them", () => {
    expect(snapLayer(chip(45, 200), inPanel, 1)).toEqual({
      box: { x: 40, y: 200, w: 100, h: 20 },
      locked: { x: true, y: false },
      // A vertical line at the badge's left, from its top to the chip's bottom.
      guides: [{ axis: "x", from: { x: 40, y: 40 }, to: { x: 40, y: 220 } }],
      // The gap from the badge's bottom to the chip's top, across the middle of where they overlap.
      distances: [{ from: { x: 80, y: 80 }, to: { x: 80, y: 200 }, length: 120 }],
      spacing: []
    })
  })

  it("locks its centre to its parent's, measuring its four insets", () => {
    const snapped = snapLayer(chip(147, 143), inPanel, 1)
    // Its centre, 197 by 153, to the panel's, 200 by 150.
    expect(snapped.box).toEqual({ x: 150, y: 140, w: 100, h: 20 })
    expect(snapped.guides).toEqual([
      { axis: "x", from: { x: 200, y: 0 }, to: { x: 200, y: 300 } },
      { axis: "y", from: { x: 0, y: 150 }, to: { x: 400, y: 150 } }
    ])
    expect(snapped.distances.map((distance) => distance.length)).toEqual([150, 150, 140, 140])
  })

  it("counts the distance on screen, so it's farther in the design zoomed out", () => {
    // 12 pixels of the design from the badge's left is 12 on screen at 100%, 6 at 50%.
    expect(snapLayer(chip(52, 200), inPanel, 1).box.x).toBe(52)
    expect(snapLayer(chip(52, 200), inPanel, 0.5).box.x).toBe(40)
    // 5 pixels is 10 on screen at 200%.
    expect(snapLayer(chip(45, 200), inPanel, 1).box.x).toBe(40)
    expect(snapLayer(chip(45, 200), inPanel, 2).box.x).toBe(45)
  })

  it("moves freely with nothing near", () => {
    expect(snapLayer(chip(52, 200), inPanel, 1)).toEqual({
      box: chip(52, 200),
      locked: { x: false, y: false },
      guides: [],
      distances: [],
      spacing: []
    })
  })
})

describe("snapping a layer's edges as it's resized", () => {
  // The chip's right edge, 116, is 4 from the badge's right, 120; its left, 43, is 3 from the badge's left, 40.
  const resized: SnapBox = { x: 43, y: 200, w: 73, h: 20 }

  it("locks only the edge the handle drags", () => {
    const snapped = snapLayer(resized, inPanel, 1, { x: "end" })
    expect(snapped.box).toEqual({ x: 43, y: 200, w: 77, h: 20 })
    expect(lockedEdgeMoves(resized, snapped, { x: "end" })).toEqual({ x: 4 })
    const left = snapLayer(resized, inPanel, 1, { x: "start" })
    expect(left.box).toEqual({ x: 40, y: 200, w: 76, h: 20 })
    expect(lockedEdgeMoves(resized, left, { x: "start" })).toEqual({ x: -3 })
  })

  it("leaves an axis the handle doesn't drag alone", () => {
    // Its top, 143, is 7 from the panel's middle, but the right handle only changes the width.
    const snapped = snapLayer({ ...resized, y: 143 }, inPanel, 1, { x: "end" })
    expect(snapped.box.y).toBe(143)
    expect(snapped.locked.y).toBe(false)
  })

  it("moves the edges a handle drags", () => {
    expect(resizeEdges("ne")).toEqual({ x: "end", y: "start" })
    expect(resizeEdges("w")).toEqual({ x: "start" })
    expect(resizedBox(resized, { x: "end", y: "start" }, { x: 5, y: -4 })).toEqual({ x: 43, y: 196, w: 78, h: 24 })
  })
})

/** Cards 60 by 40 in a row 600 wide, their tops at 100. */
const row: SnapBox = { x: 0, y: 0, w: 600, h: 300 }
const tile = (x: number, y = 100): SnapBox => ({ x, y, w: 60, h: 40 })

describe("spacing a layer evenly with its siblings", () => {
  it("takes the same gap after a run, marking each gap", () => {
    // Two cards 40 apart; a third with its left at 203 goes to 200, 40 after the second.
    const snapped = snapLayer(tile(203), { siblings: [tile(0), tile(100)], parent: row }, 1)
    expect(snapped.box).toEqual(tile(200))
    expect(snapped.locked.x).toBe(true)
    expect(snapped.spacing).toEqual([
      {
        axis: "x",
        gap: 40,
        gaps: [
          {
            start: [
              { x: 60, y: 100 },
              { x: 60, y: 140 }
            ],
            end: [
              { x: 100, y: 100 },
              { x: 100, y: 140 }
            ]
          },
          {
            start: [
              { x: 160, y: 100 },
              { x: 160, y: 140 }
            ],
            end: [
              { x: 200, y: 100 },
              { x: 200, y: 140 }
            ]
          }
        ]
      }
    ])
  })

  it("goes in the middle between two", () => {
    const snapped = snapLayer(tile(97), { siblings: [tile(0), tile(200)], parent: row }, 1)
    expect(snapped.box.x).toBe(100)
    expect(snapped.spacing[0]).toMatchObject({ axis: "x", gap: 40 })
    expect(snapped.spacing[0]!.gaps.map((gap) => [gap.start[0].x, gap.end[0].x])).toEqual([
      [60, 100],
      [160, 200]
    ])
  })

  it("takes the same gap before a run", () => {
    const snapped = snapLayer(tile(102), { siblings: [tile(200), tile(300)], parent: row }, 1)
    expect(snapped.box.x).toBe(100)
    expect(snapped.spacing[0]!.gaps.map((gap) => [gap.start[0].x, gap.end[0].x])).toEqual([
      [160, 200],
      [260, 300]
    ])
  })

  it("lines up instead when a line is nearer, and shows both when they come to the same place", () => {
    // A card above the row with its left at 201 is 2 away; the even spacing at 200 is 3.
    const nearer = snapLayer(tile(203), { siblings: [tile(0), tile(100), tile(201, 0)], parent: row }, 1)
    expect(nearer.box.x).toBe(201)
    expect(nearer.spacing).toEqual([])
    const both = snapLayer(tile(203), { siblings: [tile(0), tile(100), tile(200, 0)], parent: row }, 1)
    expect(both.box.x).toBe(200)
    expect(both.spacing).toHaveLength(1)
    expect(both.guides).toContainEqual({ axis: "x", from: { x: 200, y: 0 }, to: { x: 200, y: 140 } })
  })

  it("needs three, beside each other across the axis", () => {
    expect(snapLayer(tile(103), { siblings: [tile(0)], parent: row }, 1).spacing).toEqual([])
    // Below the row, a card doesn't space itself with it.
    const below = snapLayer(tile(203, 200), { siblings: [tile(0), tile(100)], parent: row }, 1)
    expect(below.box).toEqual(tile(203, 200))
    expect(below.spacing).toEqual([])
  })
})

describe("distances between boxes", () => {
  it("measures the gaps between boxes apart, and the insets of one inside another", () => {
    expect(distancesBetween({ x: 0, y: 0, w: 10, h: 10 }, { x: 30, y: 0, w: 10, h: 10 })).toEqual([
      { from: { x: 10, y: 5 }, to: { x: 30, y: 5 }, length: 20 }
    ])
    expect(distancesBetween({ x: 10, y: 10, w: 10, h: 10 }, { x: 0, y: 0, w: 40, h: 30 })).toHaveLength(4)
  })
})

describe("moving freely", () => {
  it("snaps with snapping on, unless Ctrl or Cmd is held", () => {
    expect(snaps({ ctrlKey: false, metaKey: false }, true)).toBe(true)
    expect(snaps({ ctrlKey: true, metaKey: false }, true)).toBe(false)
    expect(snaps({ ctrlKey: false, metaKey: true }, true)).toBe(false)
    expect(snaps({ ctrlKey: false, metaKey: false }, false)).toBe(false)
  })
})
