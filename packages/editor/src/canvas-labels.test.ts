import { describe, expect, it } from "vite-plus/test"
import { labelLook, stateLabelSpace } from "./canvas-labels.ts"

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
    // Button's second row: the dashed line and 48 pixels above an 80-pixel frame, its label 48 pixels in. The next
    // row's label starts 48 below the row, past the next line and 48 more.
    expect(stateLabelSpace(129, 48)).toBe(80 + 1 + 48 + 1 + 48)
    // The first row starts with its captions, and its label at its top.
    expect(stateLabelSpace(116, 0)).toBe(116 + 97)
  })

  it("hides a state's label without the space for it on screen, so rows' labels don't pile up", () => {
    // Button's second row has 178 pixels for its label: 9 on screen at 5%, though the board is wide enough for a title.
    const row = { width: 809, height: stateLabelSpace(129, 48) }
    expect(labelLook("name", 0.05, { width: 809 }).opacity).toBe(1)
    expect(labelLook("name", 0.05, row).opacity).toBe(0)
    // At 25% it's 44, room enough.
    expect(labelLook("name", 0.25, row).opacity).toBe(1)
    // On a board too narrow for its title, a state's label goes too, however tall its row.
    expect(labelLook("name", 0.25, { width: 74, height: 600 }).opacity).toBe(0)
  })
})
