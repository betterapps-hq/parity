import { describe, expect, it } from "vite-plus/test"
import {
  areaSpaceAt,
  frameSize,
  insetsWithin,
  insideOf,
  scaleOf,
  scaleSides,
  toFrame,
  toScreen
} from "./frame-geometry.ts"

// The arithmetic behind a frame's geometry, from plain boxes. What it reads from a real frame is checked in Chrome, in
// frame-geometry-drawn.test.ts.

const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height
})

describe("the scale a box is drawn at", () => {
  it("is its drawn size over its laid out size", () => {
    expect(scaleOf(rect(40, 10, 416, 300), { width: 832, height: 600 })).toBe(0.5)
  })

  it("goes by the longer side, which is read the most exactly", () => {
    // A tall frame drawn a hair wider than its scale gives, as a width rounded to the pixel would be.
    expect(scaleOf(rect(0, 0, 100.3, 1000), { width: 200, height: 2000 })).toBe(0.5)
    expect(scaleOf(rect(0, 0, 1000, 100.3), { width: 2000, height: 200 })).toBe(0.5)
  })

  it("is the same whatever the camera's zoom and the frame's own scale multiply to", () => {
    for (const zoom of [0.1, 0.37, 1, 2.6]) {
      for (const own of [1, 0.4]) {
        const scale = zoom * own
        expect(scaleOf(rect(12, 7, 390 * scale, 844 * scale), { width: 390, height: 844 })).toBeCloseTo(scale, 12)
      }
    }
  })

  it("has none for a box that isn't drawn or wasn't laid out", () => {
    expect(scaleOf(rect(0, 0, 0, 0), { width: 832, height: 600 })).toBeUndefined()
    expect(scaleOf(rect(0, 0, 416, 300), { width: 0, height: 0 })).toBeUndefined()
    expect(scaleOf(rect(0, 0, 416, 300), undefined)).toBeUndefined()
  })

  it("has none for a box turned on its side or stretched unevenly, whose sides don't share one", () => {
    expect(scaleOf(rect(0, 0, 100, 400), { width: 400, height: 100 })).toBeUndefined()
    expect(scaleOf(rect(0, 0, 400, 50), { width: 400, height: 100 })).toBeUndefined()
  })

  it("still has one for a box with no height, such as an empty line", () => {
    expect(scaleOf(rect(0, 0, 200, 0), { width: 400, height: 0 })).toBe(0.5)
  })
})

describe("a box inside another's sides", () => {
  const sides = { left: 4, top: 8, right: 12, bottom: 16 }

  it("is in by each side at the box's scale", () => {
    expect(insideOf(rect(100, 50, 200, 100), sides, 0.5)).toEqual({ left: 102, top: 54, right: 294, bottom: 142 })
  })

  it("is never turned inside out by sides wider than the box", () => {
    expect(insideOf(rect(100, 50, 10, 10), sides, 1)).toEqual({ left: 104, top: 58, right: 104, bottom: 58 })
  })

  it("scales each side of a border or padding", () => {
    expect(scaleSides(sides, 0.25)).toEqual({ left: 1, top: 2, right: 3, bottom: 4 })
  })
})

describe("a box's insets within another", () => {
  it("are the distances between their sides, in pixels the given scale big", () => {
    const around = rect(100, 100, 400, 300)
    const placed = rect(110, 130, 50, 20)

    expect(insetsWithin(placed, around, 0.5)).toEqual({ left: 20, top: 60, right: 680, bottom: 500 })
  })

  it("are the same at every zoom and frame scale", () => {
    for (const scale of [0.04, 0.37, 1, 2.6]) {
      const around = rect(31, 17, 400 * scale, 300 * scale)
      const placed = rect(31 + 8 * scale, 17 + 12 * scale, 60 * scale, 20 * scale)
      const insets = insetsWithin(placed, around, scale)

      expect(insets.left).toBeCloseTo(8, 9)
      expect(insets.top).toBeCloseTo(12, 9)
      expect(insets.right).toBeCloseTo(332, 9)
      expect(insets.bottom).toBeCloseTo(268, 9)
    }
  })
})

describe("between screen pixels and a frame's own", () => {
  const frame = { rect: rect(200, 100, 416, 300), scale: 0.5 }

  it("takes a box on screen to the frame's pixels, from its corner", () => {
    expect(toFrame(frame, rect(210, 150, 60, 10))).toEqual({ x: 20, y: 100, w: 120, h: 20 })
  })

  it("takes a point in the frame back to the screen", () => {
    expect(toScreen(frame, { x: 20, y: 100 })).toEqual({ x: 210, y: 150 })
  })

  it("gives a box's size in the frame's pixels", () => {
    expect(frameSize(frame, rect(210, 150, 60, 10))).toEqual({ width: 120, height: 20 })
  })
})

describe("the overlay's pixels", () => {
  const space = areaSpaceAt({ left: 240, top: 48 })

  it("count from the canvas area's corner", () => {
    expect(space.box(rect(250, 60, 100, 40))).toEqual({ x: 10, y: 12, w: 100, h: 40 })
    expect(space.rect(rect(250, 60, 100, 40))).toEqual({ left: 10, top: 12, right: 110, bottom: 52 })
    expect(space.point({ x: 250, y: 60 })).toEqual({ x: 10, y: 12 })
  })
})
