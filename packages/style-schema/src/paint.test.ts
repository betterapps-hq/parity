import { describe, expect, it } from "vite-plus/test"
import { type GradientPaint, gradientCss, readGradient } from "./paint.ts"

describe("readGradient", () => {
  it("reads back what gradientCss writes", () => {
    const paints: GradientPaint[] = [
      {
        type: "linear",
        angle: 90,
        interpolation: "oklch",
        stops: [
          { color: { token: "color-primary" }, position: 0, hint: 30 },
          { color: { value: "#fff" }, position: 100 }
        ]
      },
      {
        type: "radial",
        center: [20, 80],
        repeat: true,
        stops: [
          { color: { value: "red" }, position: 0 },
          { color: { value: "oklch(0.7 0.1 200)" }, position: 10 }
        ]
      },
      {
        type: "conic",
        angle: 45,
        center: [50, 50],
        interpolation: "srgb",
        stops: [
          { color: { value: "red" }, position: 0 },
          { color: { value: "blue" }, position: 100 }
        ]
      }
    ]

    for (const paint of paints) {
      expect(readGradient(gradientCss(paint))).toEqual(paint)
    }
  })

  it("reads a named direction and spreads stops without places, as CSS does", () => {
    expect(readGradient("linear-gradient(to right, red, oklch(0.7 0.1 200), blue)")).toEqual({
      type: "linear",
      angle: 90,
      stops: [
        { color: { value: "red" }, position: 0 },
        { color: { value: "oklch(0.7 0.1 200)" }, position: 50 },
        { color: { value: "blue" }, position: 100 }
      ]
    })
  })

  it("leaves the angle unset where it isn't written", () => {
    expect(readGradient("linear-gradient(red, blue)")).not.toHaveProperty("angle")
  })

  it("can't read what isn't a gradient of two stops or more", () => {
    expect(readGradient("url(/a.png)")).toMatchObject({ code: "unreadable" })
    expect(readGradient("linear-gradient(red)")).toMatchObject({ code: "arguments" })
  })
})
