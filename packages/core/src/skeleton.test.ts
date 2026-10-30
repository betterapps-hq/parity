import { describe, expect, it } from "vite-plus/test"
import { type DrawnBox, frameSkeleton } from "./skeleton.ts"

const frame = { width: 400, height: 300 }

describe("frameSkeleton", () => {
  it("takes the background from a surface covering the frame, and draws the rest over it", () => {
    const skeleton = frameSkeleton(frame, [
      { kind: "surface", x: 0, y: 0, width: 400, height: 300, color: "rgb(255, 255, 255)" },
      { kind: "surface", x: 20, y: 20, width: 200, height: 100, color: "rgb(245, 245, 245)", radius: 8 }
    ])
    expect(skeleton.background).toBe("rgb(255, 255, 255)")
    expect(skeleton.layers).toHaveLength(1)
    expect(skeleton.layers[0]).toMatchObject({ fill: "rgb(245, 245, 245)", opacity: 1 })
    expect(skeleton.layers[0]!.path).toBe(
      "M28 20h184a8 8 0 0 1 8 8v84a8 8 0 0 1 -8 8h-184a8 8 0 0 1 -8 -8v-84a8 8 0 0 1 8 -8Z"
    )
  })

  it("draws a line of text as a rounded bar in its color, faded, through the middle of the line", () => {
    const [bar] = frameSkeleton(frame, [
      { kind: "text", x: 10, y: 10, width: 100, height: 20, color: "rgb(10, 10, 10)" }
    ]).layers
    expect(bar).toMatchObject({ fill: "rgb(10, 10, 10)", opacity: 0.35 })
    expect(bar!.path).toBe("M16 14h88a6 6 0 0 1 6 6v0a6 6 0 0 1 -6 6h-88a6 6 0 0 1 -6 -6v0a6 6 0 0 1 6 -6Z")
  })

  it("outlines a surface with only a border, and leaves out one with neither", () => {
    const { layers } = frameSkeleton(frame, [
      { kind: "surface", x: 10, y: 10, width: 100, height: 40, border: "rgb(229, 229, 229)" },
      { kind: "surface", x: 10, y: 60, width: 100, height: 40 }
    ])
    expect(layers).toEqual([{ path: "M10 10h100v40h-100Z", stroke: "rgb(229, 229, 229)", opacity: 1 }])
  })

  it("leaves out what's too thin to show and clips what reaches past the frame", () => {
    const { layers } = frameSkeleton(frame, [
      { kind: "surface", x: 10, y: 10, width: 200, height: 1, color: "red" },
      { kind: "surface", x: 350, y: 250, width: 100, height: 100, color: "blue" },
      { kind: "surface", x: 500, y: 10, width: 50, height: 50, color: "green" }
    ])
    expect(layers).toEqual([{ path: "M350 250h50v50h-50Z", fill: "blue", opacity: 1 }])
  })

  it("draws boxes drawn alike in one path", () => {
    const { layers } = frameSkeleton(frame, [
      { kind: "surface", x: 10, y: 10, width: 50, height: 50, color: "white" },
      { kind: "surface", x: 100, y: 10, width: 50, height: 50, color: "gray" },
      { kind: "surface", x: 200, y: 10, width: 50, height: 50, color: "white" }
    ])
    expect(layers.map((layer) => layer.fill)).toEqual(["white", "gray"])
    expect(layers[0]!.path).toBe("M10 10h50v50h-50ZM200 10h50v50h-50Z")
  })

  it("keeps a box in front of one drawn before it that it overlaps", () => {
    // A white card on a gray section, after a white header: the card can't join the header's path, which is drawn
    // before the section.
    const { layers } = frameSkeleton(frame, [
      { kind: "surface", x: 0, y: 0, width: 400, height: 40, color: "white" },
      { kind: "surface", x: 0, y: 50, width: 400, height: 200, color: "gray" },
      { kind: "surface", x: 20, y: 70, width: 100, height: 100, color: "white" }
    ])
    expect(layers.map((layer) => layer.fill)).toEqual(["white", "gray", "white"])
  })

  it("keeps the largest boxes when there are too many, in the order they're drawn", () => {
    const drawn: DrawnBox[] = [
      { kind: "surface", x: 0, y: 0, width: 10, height: 10, color: "a" },
      { kind: "surface", x: 0, y: 20, width: 100, height: 100, color: "b" },
      { kind: "surface", x: 0, y: 130, width: 50, height: 50, color: "c" }
    ]
    const { layers } = frameSkeleton(frame, drawn, { most: 2 })
    expect(layers.map((layer) => layer.fill)).toEqual(["b", "c"])
  })

  it("draws nothing for a frame that draws nothing", () => {
    expect(frameSkeleton(frame, [])).toEqual({ width: 400, height: 300, layers: [] })
  })
})
