import { describe, expect, it } from "vite-plus/test"
import { parseHex } from "./color.ts"
import { type ContrastFrame, contrastFix, contrastRatio } from "./contrast.ts"

const color = (hex: string) => parseHex(hex)!

/** shadcn's neutral theme, as hex, in light and dark. */
const light = {
  foreground: "#0a0a0a",
  "muted-foreground": "#737373",
  primary: "#171717",
  destructive: "#e7000b",
  "neutral-500": "#737373",
  "neutral-600": "#525252",
  "neutral-400": "#a1a1a1"
}

const dark = {
  foreground: "#fafafa",
  "muted-foreground": "#a1a1a1",
  primary: "#e5e5e5",
  destructive: "#ff6467",
  "neutral-500": "#737373",
  "neutral-600": "#525252",
  "neutral-400": "#a1a1a1"
}

const frame = (foreground: string, background: string, tokens: Record<string, string>, required = 4.5) =>
  ({ foreground, background, required, tokens }) satisfies ContrastFrame

describe("contrastRatio", () => {
  it("matches WCAG's ratios", () => {
    expect(contrastRatio(color("#000"), color("#fff"))).toBeCloseTo(21)
    expect(contrastRatio(color("#fff"), color("#fff"))).toBeCloseTo(1)
    expect(contrastRatio(color("#737373"), color("#f5f5f5"))).toBeCloseTo(4.35, 2)
  })

  it("lays a translucent text color over its background first", () => {
    // Black at half strength on white is #808080.
    expect(contrastRatio(color("#00000080"), color("#fff"))).toBeCloseTo(
      contrastRatio(color("#7f7f7f"), color("#fff")),
      1
    )
  })
})

describe("contrastFix", () => {
  it("suggests the token closest to the failing color that passes", () => {
    const fix = contrastFix([frame("#737373", "#f5f5f5", light)], { current: "muted-foreground" })
    expect(fix).toEqual({ token: "neutral-600", ratios: [7.16] })
  })

  it("never suggests the token the text already uses, or one that fails", () => {
    const fix = contrastFix([frame("#737373", "#f5f5f5", light)], { current: "neutral-600" })
    // muted-foreground and neutral-500 are the failing color itself; foreground and primary pass.
    expect(fix?.token).toBe("primary")
  })

  it("passes in every frame given, including the ones that already pass", () => {
    // Dark passes now, at #a1a1a1 on #171717. neutral-600 would pass in light but fail in dark.
    const fix = contrastFix([frame("#737373", "#f5f5f5", light), frame("#a1a1a1", "#171717", dark)], {
      current: "muted-foreground"
    })

    expect(fix?.token).toBe("primary")
    expect(fix?.ratios).toEqual([16.44, 14.23])
  })

  it("tries preferred tokens first, so a themed color stays themed", () => {
    const fix = contrastFix([frame("#737373", "#f5f5f5", light)], {
      current: "muted-foreground",
      preferred: new Set(["foreground", "muted-foreground", "primary", "destructive"])
    })

    expect(fix?.token).toBe("primary")
  })

  it("falls back to the rest when no preferred token passes", () => {
    const fix = contrastFix([frame("#737373", "#f5f5f5", light)], { preferred: new Set(["destructive"]) })
    expect(fix?.token).toBe("neutral-600")
  })

  it("asks less of large text", () => {
    const fix = contrastFix([frame("#a1a1a1", "#ffffff", light, 3)], { current: "neutral-400" })
    // neutral-500 reaches 4.74, enough for large text and closer than neutral-600.
    expect(fix?.token).toBe("muted-foreground")
  })

  it("suggests nothing when no token passes everywhere", () => {
    expect(contrastFix([frame("#777777", "#777777", { gray: "#787878" })])).toBeUndefined()
    expect(contrastFix([])).toBeUndefined()
  })

  it("skips tokens without a color in every frame", () => {
    const fix = contrastFix([frame("#737373", "#ffffff", { ink: "#000000" }), frame("#737373", "#ffffff", {})])
    expect(fix).toBeUndefined()
  })

  it("weighs a token's own transparency against the background", () => {
    // Black at 10% on white is barely there, so it fails; black at 80% passes.
    const fix = contrastFix([frame("#999999", "#ffffff", { faint: "#0000001a", strong: "#000000cc" })])
    expect(fix?.token).toBe("strong")
  })
})
