import { describe, expect, it } from "vite-plus/test"
import { carriedShift, type SortBox, sortLayout } from "./sort-layout.ts"

// Three 28px rows with a 4px gap, as the list fields' rows are.
const rows: SortBox[] = [
  { top: 0, height: 28 },
  { top: 32, height: 28 },
  { top: 64, height: 28 }
]

// A row, a row with a note under it, and a row.
const withNote: SortBox[] = [
  { top: 0, height: 28 },
  { top: 32, height: 60 },
  { top: 96, height: 28 }
]

describe("where a lifted entry lands", () => {
  it("stays put until it covers half the next entry", () => {
    expect(sortLayout(rows, 0, 17)).toEqual({ to: 0, offsets: [0, 0, 0], landing: 0 })
  })

  it("takes the place of the entry it covers half of, which moves back by its height and the gap", () => {
    expect(sortLayout(rows, 0, 19)).toEqual({ to: 1, offsets: [0, -32, 0], landing: 32 })
  })

  it("passes every entry it covers half of, carried up", () => {
    expect(sortLayout(rows, 2, -40)).toMatchObject({ to: 1, offsets: [0, 32, 0] })
    expect(sortLayout(rows, 2, -52)).toEqual({ to: 0, offsets: [32, 32, 0], landing: -64 })
  })

  it("changes places with a short entry above it, though it's taller", () => {
    // Its top past the first row's middle, the first row moves down its 60px and the gap.
    expect(sortLayout(withNote, 1, -20)).toEqual({ to: 0, offsets: [64, 0, 0], landing: -32 })
  })

  it("lines up with the bottom of the place it takes, carried down past a taller one", () => {
    expect(sortLayout(withNote, 0, 50)).toEqual({ to: 1, offsets: [0, -32, 0], landing: 64 })
  })
})

describe("how far a lifted entry is drawn", () => {
  it("follows the pointer within the list", () => {
    expect(carriedShift(rows, 1, -20, 21)).toBe(-20)
  })

  it("gives less and less past either end, never as far as its give", () => {
    const pastTheEnd = carriedShift(rows, 2, 40, 21)
    const farPastTheEnd = carriedShift(rows, 2, 400, 21)

    expect(pastTheEnd).toBeGreaterThan(0)
    expect(pastTheEnd).toBeLessThan(40)
    expect(farPastTheEnd).toBeGreaterThan(pastTheEnd)
    expect(farPastTheEnd).toBeLessThan(21)
    expect(carriedShift(rows, 0, -400, 21)).toBeGreaterThan(-21)
  })
})
