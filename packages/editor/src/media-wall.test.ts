import { describe, expect, it } from "vite-plus/test"
import { packWall, tallnessOf } from "./media-wall.ts"

const layout = { across: 2, gap: 8, usual: 116 }

describe("tallnessOf", () => {
  it("follows the picture's own proportions", () => {
    expect(tallnessOf({ width: 1200, height: 800 })).toBeCloseTo(2 / 3)
    expect(tallnessOf({ width: 400, height: 400 })).toBe(1)
  })

  it("keeps a panorama and a long screenshot from taking the wall", () => {
    expect(tallnessOf({ width: 6000, height: 1000 })).toBe(0.5)
    expect(tallnessOf({ width: 800, height: 6000 })).toBe(1.4)
  })

  it("takes a photo's proportions when the size isn't known", () => {
    expect(tallnessOf(undefined)).toBe(0.75)
    expect(tallnessOf({ width: 0, height: 0 })).toBe(0.75)
  })
})

describe("packWall", () => {
  const pack = (tallnesses: number[]) => packWall(tallnesses, (tall) => tall, layout)

  it("puts each picture in whichever column is shortest, the first on a tie", () => {
    const { spots } = pack([1, 0.5, 0.5, 1])

    expect(spots.map((spot) => spot.column)).toEqual([0, 1, 1, 0])
  })

  it("says what's above each picture, in tile widths and gaps", () => {
    const { spots } = pack([1, 0.5, 0.5])

    expect(spots.map((spot) => spot.above)).toEqual([
      { widths: 0, gaps: 0 },
      { widths: 0, gaps: 0 },
      { widths: 0.5, gaps: 1 }
    ])
  })

  it("is as long as its longest column, without the gap under the last picture", () => {
    expect(pack([1, 0.5, 0.5]).height).toEqual({ widths: 1, gaps: 1 })
    expect(pack([]).height).toEqual({ widths: 0, gaps: 0 })
  })

  it("never moves the pictures before a new one", () => {
    const before = pack([1, 0.5, 0.75]).spots
    const after = pack([1, 0.5, 0.75, 1.4]).spots

    expect(after.slice(0, 3)).toEqual(before)
  })

  it("weighs gaps with widths, so many short pictures count as taller than their widths alone", () => {
    // Column 0 holds one picture 1 wide; column 1 two of 0.48, which with their gap run longer than it.
    const { spots } = pack([1, 0.48, 0.48, 0.5])

    expect(spots.at(-1)?.column).toBe(0)
  })
})
