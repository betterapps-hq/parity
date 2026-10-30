import { describe, expect, it } from "vite-plus/test"
import { barLength } from "./token-previews.tsx"

describe("a spacing bar", () => {
  it("is drawn at its true size up to 16 pixels short of its room", () => {
    expect(barLength(8, 36)).toEqual({ solid: 8, squeezed: 0 })
    expect(barLength(20, 36)).toEqual({ solid: 20, squeezed: 0 })
    expect(barLength(150, 166)).toEqual({ solid: 150, squeezed: 0 })
  })

  it("squeezes what's past the knee into the last 16 pixels, ending at the room for 384 pixels", () => {
    const { solid, squeezed } = barLength(96, 36)
    expect(solid).toBe(20)
    expect(squeezed).toBeGreaterThan(0)
    expect(squeezed).toBeLessThan(16)
    expect(barLength(384, 36)).toEqual({ solid: 20, squeezed: 16 })
    expect(barLength(1000, 36)).toEqual({ solid: 20, squeezed: 16 })
  })

  it("always ends further along for a longer length", () => {
    const ends = [0, 4, 16, 20, 24, 32, 48, 64, 96, 128, 192, 256, 320, 384].map((length) => {
      const { solid, squeezed } = barLength(length, 36)
      return solid + squeezed
    })
    expect(ends).toEqual(ends.toSorted((a, b) => a - b))
    expect(new Set(ends.slice(1)).size).toBe(ends.length - 1)
  })

  it("draws a length it can't measure as the shortest bar, and keeps a squeezed tail within a small room", () => {
    expect(barLength(Number.NaN, 36)).toEqual({ solid: 1, squeezed: 0 })
    const { solid, squeezed } = barLength(100, 12)
    expect(solid + squeezed).toBeLessThanOrEqual(12)
  })
})
