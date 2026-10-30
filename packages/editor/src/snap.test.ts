import { describe, expect, it } from "vite-plus/test"
import { type SnapBox, snapBox } from "./snap.ts"

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
