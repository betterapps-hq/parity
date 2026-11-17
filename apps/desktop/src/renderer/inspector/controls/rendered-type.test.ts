import { describe, expect, it } from "vite-plus/test"
import { renderedType, stackFont } from "./rendered-type.ts"

describe("a layer's rendered type", () => {
  it("reads each value as the canvas computes it", () => {
    expect(
      renderedType({
        fontFamily: '"Inter Variable", sans-serif',
        fontSize: "18px",
        fontWeight: "600",
        lineHeight: "27px",
        letterSpacing: "-0.45px"
      })
    ).toEqual({
      font: { stack: '"Inter Variable", sans-serif' },
      size: { px: 18 },
      weight: { value: 600 },
      lineHeight: { px: 27 },
      letterSpacing: { px: -0.45 }
    })
  })

  it("reads `normal` line height as Auto and `normal` letter spacing as none", () => {
    const type = renderedType({
      fontFamily: "serif",
      fontSize: "16px",
      fontWeight: "400",
      lineHeight: "normal",
      letterSpacing: "normal"
    })

    expect(type.lineHeight).toEqual({ keyword: "normal" })
    expect(type.letterSpacing).toEqual({ em: 0 })
  })

  it("names a stack's font by its first family, unquoted, whether or not it's a known font", () => {
    expect(stackFont("Georgia, serif").weights).toEqual([400, 700])
    expect(stackFont('"Brand Sans", system-ui, sans-serif')).toMatchObject({
      name: "Brand Sans",
      stack: '"Brand Sans", system-ui, sans-serif'
    })
  })
})
