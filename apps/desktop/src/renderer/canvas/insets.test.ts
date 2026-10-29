import { describe, expect, it } from "vitest"
import { type DrawnSteps, resizeInsets, shiftInsets } from "./insets.ts"

/** Where a layer's sides are drawn, in steps. */
const drawn = (sides: Partial<DrawnSteps> = {}): DrawnSteps => ({ top: 0, right: 0, bottom: 0, left: 0, ...sides })

describe("moving an absolutely placed layer", () => {
  it("moves it by the sides it's placed from", () => {
    expect(shiftInsets({ top: 4, left: 2 }, 1, 0)).toEqual({ change: { left: 3 } })
    expect(shiftInsets({ top: 4, left: 2 }, 0, -10)).toEqual({ change: { top: -6 } })
    expect(shiftInsets({ bottom: 4, right: 2 }, 1, 1)).toEqual({ change: { right: 1, bottom: 3 } })
  })

  it("moves both sides of a layer stretched between them, so it keeps its size", () => {
    expect(shiftInsets({ left: 0, right: 0, top: 2 }, 1, 0)).toEqual({ change: { left: 1, right: -1 } })
    // Calendar's Review slot, dragged six steps right and four down.
    expect(shiftInsets({ top: 40, left: 0, right: 0, height: 16 }, 6, 4, drawn({ top: 40 }))).toEqual({
      change: { left: 6, right: -6, top: 44 }
    })
  })

  it("keeps negative insets, and lets them go negative", () => {
    expect(shiftInsets({ left: -4, top: -2 }, 1, 1)).toEqual({ change: { left: -3, top: -1 } })
    expect(shiftInsets({ left: 1 }, -3, 0)).toEqual({ change: { left: -2 } })
  })

  it("moves in half steps", () => {
    expect(shiftInsets({ left: 1.5 }, 0.5, 0)).toEqual({ change: { left: 2 } })
  })

  it("moves a side set to a token, or not set, from where it's drawn", () => {
    const at = { top: 10, right: 71.5, bottom: 40, left: 2 }
    expect(shiftInsets({ top: "header", left: 2 }, 0, 1, at)).toEqual({ change: { top: 11 } })
    expect(shiftInsets({}, 1, 0, at)).toEqual({ change: { left: 3 } })
    // A token on one side of a stretched layer, and a negative number on the other.
    expect(shiftInsets({ left: -2, right: "gutter" }, 4, 0, drawn({ right: 6 }))).toEqual({
      change: { left: 2, right: 2 }
    })
  })

  it("keeps an axis with a token when it isn't drawn, and an axis it doesn't move along", () => {
    expect(shiftInsets({ top: "header", left: 2 }, 0, 1)).toEqual({ change: {}, blocked: "top" })
    expect(shiftInsets({ top: "header", left: 2 }, 1, 0)).toEqual({ change: { left: 3 } })
    expect(shiftInsets({}, 1, 0)).toEqual({ change: { left: 1 } })
  })
})

// Steps of 4px, as Tailwind's default spacing.
const unit = 4

describe("resizing an absolutely placed layer", () => {
  it("moves the left inset with the left handle, keeping the right edge where it was", () => {
    // 100px wide at left 10; the left handle dragged 20px left.
    expect(resizeInsets({ left: 10 }, drawn({ left: 10 }), "x", false, -20, 100, unit)).toEqual({
      size: 30,
      insets: { left: 5 }
    })
  })

  it("moves the top inset with the top handle, and keeps it negative", () => {
    expect(resizeInsets({ top: -2 }, drawn({ top: -2 }), "y", false, 8, 40, unit)).toEqual({
      size: 8,
      insets: { top: 0 }
    })
    expect(resizeInsets({ top: -2 }, drawn({ top: -2 }), "y", false, -8, 40, unit)).toEqual({
      size: 12,
      insets: { top: -4 }
    })
  })

  it("moves a token inset from where it's drawn", () => {
    expect(resizeInsets({ left: "gutter" }, drawn({ left: 6 }), "x", false, 8, 100, unit)).toEqual({
      size: 23,
      insets: { left: 8 }
    })
  })

  it("keeps a token inset that doesn't move", () => {
    // The left handle moved too little to change the size, so the left side stays where it is.
    expect(resizeInsets({ left: "gutter" }, drawn({ left: 6 }), "x", false, 1, 100, unit)).toEqual({
      size: 25,
      insets: {}
    })
  })

  it("leaves the insets alone when the far handle grows a layer placed from the near side", () => {
    expect(resizeInsets({ left: "gutter", top: 2 }, drawn({ left: 6 }), "x", true, 20, 100, unit)).toEqual({
      size: 30,
      insets: {}
    })
  })

  it("resizes a layer placed from both sides by the dragged side's inset alone", () => {
    expect(resizeInsets({ left: 0, right: 0 }, drawn(), "x", false, 12, 300, unit)).toEqual({ insets: { left: 3 } })
    expect(resizeInsets({ left: 0, right: 0 }, drawn(), "x", true, 12, 300, unit)).toEqual({ insets: { right: -3 } })
  })

  it("keeps a layer placed from the right where it is", () => {
    // The right handle moves the right inset as the layer grows; the left handle only sizes it.
    expect(resizeInsets({ right: 4 }, drawn({ right: 4 }), "x", true, 20, 100, unit)).toEqual({
      size: 30,
      insets: { right: -1 }
    })
    expect(resizeInsets({ right: 4 }, drawn({ right: 4 }), "x", false, -20, 100, unit)).toEqual({
      size: 30,
      insets: {}
    })
  })

  it("places a layer with both sides and its own size from the near side", () => {
    expect(resizeInsets({ left: 2, right: 2, width: 20 }, drawn({ left: 2 }), "x", false, -8, 80, unit)).toEqual({
      size: 22,
      insets: { left: 0 }
    })
  })
})
