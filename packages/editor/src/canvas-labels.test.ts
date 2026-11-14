import { describe, expect, it } from "vite-plus/test"
import { labelLook, stateLabelSpace, titleReach, titleTop } from "./canvas-labels.ts"

describe("labelLook", () => {
  it("keeps every label at screen size up close", () => {
    for (const zoom of [0.4, 1, 3]) {
      expect(labelLook("name", zoom)).toEqual({ scale: 1, opacity: 1 })
      expect(labelLook("detail", zoom)).toEqual({ scale: 1, opacity: 1 })
    }
  })

  it("shrinks names with the canvas past 40%, down to 60%, and shows them at any zoom while there's room", () => {
    expect(labelLook("name", 0.3).scale).toBeCloseTo(0.75)
    expect(labelLook("name", 0.1)).toEqual({ scale: 0.6, opacity: 1 })
    // A 3,000-pixel board is 30 screen pixels wide at 1%.
    expect(labelLook("name", 0.01, { width: 3000 })).toEqual({ scale: 0.6, opacity: 1 })
  })

  it("fades detail out as it shrinks, gone at 25%", () => {
    const halfway = labelLook("detail", 0.325)
    expect(halfway.scale).toBeCloseTo(0.8125)
    expect(halfway.opacity).toBeCloseTo(0.5)
    expect(labelLook("detail", 0.25).opacity).toBe(0)
    expect(labelLook("detail", 0.05).opacity).toBe(0)
  })

  it("hides a label once what it labels is narrower than 24 screen pixels", () => {
    // 2,400 pixels at 1% is 24 on screen: still room. 2,000 is 20: none.
    expect(labelLook("name", 0.01, { width: 2400 }).opacity).toBe(1)
    expect(labelLook("name", 0.01, { width: 2000 }).opacity).toBe(0)
    // The same board up close has room again.
    expect(labelLook("name", 1, { width: 2000 }).opacity).toBe(1)
  })

  it("hides a narrow board's detail with its name, before detail would have faded", () => {
    // A 70-pixel component at 30% is 21 screen pixels wide, where detail alone would still show at a third.
    expect(labelLook("detail", 0.3).opacity).toBeCloseTo(1 / 3)
    expect(labelLook("name", 0.3, { width: 70 }).opacity).toBe(0)
    expect(labelLook("detail", 0.3, { width: 70 }).opacity).toBe(0)
    expect(labelLook("detail", 1, { width: 70 }).opacity).toBe(1)
  })

  it("shrinks a state's label as a title does, beside a row tall enough to hold it", () => {
    // A row of the every-state grid 600 pixels tall, on a board 1,400 wide, is 30 by 70 on screen at 5%.
    const tall = { width: 1400, height: 600 }
    expect(labelLook("name", 0.05, tall)).toEqual(labelLook("name", 0.05, { width: 1400 }))
    expect(labelLook("name", 0.05, tall)).toEqual({ scale: 0.6, opacity: 1 })
    expect(labelLook("name", 0.25, tall).scale).toBeCloseTo(0.625)
  })

  it("measures a state label's space from its top to the next row's label", () => {
    // Button's second row: an 80-pixel frame, its label beside the frame's top. The next row's label starts past the
    // dashed line, with 90 pixels either side of it on the canvas at 40% and further out, and the line 2.5.
    expect(stateLabelSpace(80, false)).toBe(80 + 90 + 2.5 + 90)
    // The first row's label starts at the top of the caption band above its frames, 90 tall there.
    expect(stateLabelSpace(80, true)).toBe(90 + 80 + 182.5)
  })

  it("hides a state's label without the space for it on screen, so rows' labels don't pile up", () => {
    // Button's second row has 262.5 pixels for its label: 13 on screen at 5%, though the board is wide enough for a
    // title.
    const row = { width: 809, height: stateLabelSpace(80, false) }
    expect(labelLook("name", 0.05, { width: 809 }).opacity).toBe(1)
    expect(labelLook("name", 0.05, row).opacity).toBe(0)
    // At 25% it's 66, room enough.
    expect(labelLook("name", 0.25, row).opacity).toBe(1)
    // On a board too narrow for its title, a state's label goes too, however tall its row.
    expect(labelLook("name", 0.25, { width: 74, height: 600 }).opacity).toBe(0)
  })
})

describe("titleReach", () => {
  // At 10% a name draws at 60%, so a title is 42 × 0.6 = 25.2 screen pixels tall: 252 pixels of the canvas.
  const zoom = 0.1
  const scale = 0.6
  const board = { x: 0, y: 0, w: 200, h: 800 }

  it("runs a title to the next board level with it, short of 8 screen pixels", () => {
    const right = { x: 1000, y: 0, w: 400, h: 400 }
    expect(titleReach(board, [right], zoom, scale)).toBe(1000 - 80)
  })

  it("takes the nearest board to the right", () => {
    const near = { x: 600, y: 100, w: 100, h: 100 }
    const far = { x: 1000, y: 0, w: 400, h: 400 }
    expect(titleReach(board, [far, near], zoom, scale)).toBe(600 - 80)
  })

  it("stops before another board's title, though that board starts below this one's top", () => {
    // 200 down, its title starts at -52, level with this one's, which spans -252 to 0.
    const level = { x: 600, y: 200, w: 100, h: 100 }
    expect(titleReach(board, [level], zoom, scale)).toBe(600 - 80)
  })

  it("ignores boards to its left, above or below its title", () => {
    const left = { x: -500, y: 0, w: 400, h: 400 }
    const above = { x: 600, y: -900, w: 100, h: 400 }
    const below = { x: 600, y: 300, w: 100, h: 100 }
    expect(titleReach(board, [left, above, below], zoom, scale)).toBeUndefined()
  })

  it("is never narrower than the board, even with one overlapping it", () => {
    const overlapping = { x: 150, y: 0, w: 400, h: 400 }
    expect(titleReach(board, [overlapping], zoom, scale)).toBe(200)
  })

  it("takes more of the canvas for its band zoomed further out", () => {
    // 600 down, at 10% its title clears this one; at 4% the band is 42 × 0.6 / 0.04 = 630, and the two are level.
    const lower = { x: 600, y: 600, w: 100, h: 100 }
    expect(titleReach(board, [lower], 0.1, scale)).toBeUndefined()
    expect(titleReach(board, [lower], 0.04, scale)).toBe(600 - 200)
  })
})

describe("titleTop", () => {
  it("puts a title 42 screen pixels above its board up close", () => {
    expect(titleTop({ y: 1000 }, 1)).toBe(958)
  })

  it("takes more of the canvas zoomed out, as the name shrinks less than the canvas", () => {
    // At 10% a name draws at 60%: 25.2 screen pixels, 252 of the canvas.
    expect(titleTop({ y: 1000 }, 0.1)).toBeCloseTo(748)
  })
})
