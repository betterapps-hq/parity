import { describe, expect, it } from "vitest"
import { labelLook } from "./labels.ts"

describe("labelLook", () => {
  it("keeps every label at screen size up close", () => {
    for (const zoom of [0.4, 1, 3]) {
      expect(labelLook("name", zoom)).toEqual({ scale: 1, opacity: 1 })
      expect(labelLook("detail", zoom)).toEqual({ scale: 1, opacity: 1 })
    }
  })

  it("shrinks names with the canvas past 40%, down to 60%, and always shows them", () => {
    expect(labelLook("name", 0.3).scale).toBeCloseTo(0.75)
    expect(labelLook("name", 0.1)).toEqual({ scale: 0.6, opacity: 1 })
  })

  it("fades detail out as it shrinks, gone at 25%", () => {
    const halfway = labelLook("detail", 0.325)
    expect(halfway.scale).toBeCloseTo(0.8125)
    expect(halfway.opacity).toBeCloseTo(0.5)
    expect(labelLook("detail", 0.25).opacity).toBe(0)
    expect(labelLook("detail", 0.05).opacity).toBe(0)
  })
})
