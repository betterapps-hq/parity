import { describe, expect, it } from "vitest"
import { type Bounds, freeSpotBeside } from "./free-space.ts"

const at = (x: number, y: number, w: number, h: number): Bounds => ({ minX: x, minY: y, maxX: x + w, maxY: y + h })

describe("placing a duplicate design", () => {
  it("goes just to the right of the original when that's free", () => {
    const dashboard = at(0, 0, 2700, 1400)
    expect(freeSpotBeside(dashboard, [dashboard])).toEqual({ x: 2860, y: 0 })
  })

  it("goes past the next design in the row instead of on top of it", () => {
    // The example's Dashboard, with Projects 176px to its right.
    const dashboard = at(0, 5793, 2729, 1400)
    const projects = at(2905, 5793, 2700, 1300)
    const spot = freeSpotBeside(dashboard, [dashboard, projects])
    expect(spot).toEqual({ x: 5765, y: 5793 })
    expect(spot.x).toBeGreaterThanOrEqual(projects.maxX + 160)
  })

  it("keeps going past a run of designs, and through gaps too narrow for it", () => {
    const original = at(0, 0, 1000, 800)
    const others = [at(1200, 0, 600, 400), at(2000, 300, 900, 900), at(3100, 0, 500, 500)]
    expect(freeSpotBeside(original, [original, ...others])).toEqual({ x: 3760, y: 0 })
  })

  it("fits in a gap wide enough for it", () => {
    const original = at(0, 0, 1000, 800)
    const others = [at(1200, 0, 600, 400), at(3200, 0, 500, 500)]
    expect(freeSpotBeside(original, [original, ...others])).toEqual({ x: 1960, y: 0 })
  })

  it("ignores designs well above or below the row", () => {
    const original = at(0, 1000, 1000, 800)
    const others = [at(1200, 0, 600, 800), at(1200, 1960, 600, 800)]
    expect(freeSpotBeside(original, [original, ...others])).toEqual({ x: 1160, y: 1000 })
  })

  it("keeps clear of a design whose title would touch the copy's", () => {
    // Just under the gap below the copy's row.
    const original = at(0, 1000, 1000, 800)
    const below = at(1200, 1900, 600, 800)
    expect(freeSpotBeside(original, [original, below])).toEqual({ x: 1960, y: 1000 })
  })
})
