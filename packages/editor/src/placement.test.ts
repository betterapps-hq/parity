import { describe, expect, it } from "vite-plus/test"
import { aboveEverything, type Bounds, freeSpotBeside, rightOfEverything } from "./placement.ts"

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

describe("placing a new design", () => {
  it("goes to the right of every design's box, top-aligned with the topmost design", () => {
    const designs = [
      { position: { x: 0, y: 200 }, bounds: at(0, 180, 1280, 900) },
      { position: { x: 1500, y: -40 }, bounds: at(1500, -60, 1300, 800) }
    ]
    expect(rightOfEverything(designs)).toEqual({ x: 3040, y: -40 })
    expect(rightOfEverything(designs, 100)).toEqual({ x: 2900, y: -40 })
  })

  it("counts a design the canvas hasn't drawn as 1400px wide, and rounds to whole pixels", () => {
    expect(rightOfEverything([{ position: { x: 100.4, y: 30 } }])).toEqual({ x: 1740, y: 30 })
  })

  it("starts beside the origin on an empty canvas", () => {
    expect(rightOfEverything([])).toEqual({ x: 240, y: 0 })
  })
})

describe("placing a component made from layers", () => {
  it("goes 640px above the topmost design, lined up with the one it came from", () => {
    const designs = [
      { position: { x: 0, y: 0 }, bounds: at(0, -20.4, 1280, 900) },
      { position: { x: 1500, y: 300 }, bounds: at(1500, 300, 1300, 800) }
    ]
    expect(aboveEverything({ x: 1500, y: 300 }, designs)).toEqual({ x: 1500, y: -660 })
  })

  it("goes by a design's position when the canvas hasn't drawn it", () => {
    expect(aboveEverything({ x: 40, y: 500 }, [{ position: { x: 0, y: 100 } }])).toEqual({ x: 40, y: -540 })
  })

  it("goes above the design it came from on an otherwise empty canvas", () => {
    expect(aboveEverything({ x: 40, y: 500 }, [])).toEqual({ x: 40, y: -140 })
  })
})
