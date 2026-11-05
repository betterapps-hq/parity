import { describe, expect, it } from "vite-plus/test"
import { redlineLabel } from "./Redline.tsx"

describe("redlineLabel", () => {
  it("puts a horizontal line's label below it, centred, clear of the line", () => {
    const label = redlineLabel({ x1: 100, y1: 50, x2: 300, y2: 50, px: 200, steps: 50 })
    expect(label).toEqual({ left: 200, top: 59, transform: "translateX(-50%)" })
  })

  it("puts a vertical line's label to its right, centred, clear of the line", () => {
    const label = redlineLabel({ x1: 40, y1: 300, x2: 40, y2: 100, px: 200, steps: 50 })
    expect(label).toEqual({ left: 49, top: 200, transform: "translateY(-50%)" })
  })

  it("keeps the label off a line only a few pixels long", () => {
    const across = redlineLabel({ x1: 128, y1: 75, x2: 132, y2: 75, px: 4, steps: 1 })
    expect(across.top).toBeGreaterThan(76)
    const down = redlineLabel({ x1: 130, y1: 74, x2: 130, y2: 76, px: 2, steps: 0.5 })
    expect(down.left).toBeGreaterThan(131)
  })
})
