import { describe, expect, it } from "vite-plus/test"
import { labelLook } from "./canvas-labels.ts"

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
    expect(labelLook("name", 0.01, 3000)).toEqual({ scale: 0.6, opacity: 1 })
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
    expect(labelLook("name", 0.01, 2400).opacity).toBe(1)
    expect(labelLook("name", 0.01, 2000).opacity).toBe(0)
    // The same board up close has room again.
    expect(labelLook("name", 1, 2000).opacity).toBe(1)
  })

  it("hides a narrow board's detail with its name, before detail would have faded", () => {
    // A 70-pixel component at 30% is 21 screen pixels wide, where detail alone would still show at a third.
    expect(labelLook("detail", 0.3).opacity).toBeCloseTo(1 / 3)
    expect(labelLook("name", 0.3, 70).opacity).toBe(0)
    expect(labelLook("detail", 0.3, 70).opacity).toBe(0)
    expect(labelLook("detail", 1, 70).opacity).toBe(1)
  })
})
