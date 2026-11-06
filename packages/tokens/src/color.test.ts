import { describe, expect, it } from "vite-plus/test"
import {
  colorDistance,
  formatColorLike,
  formatHex,
  formatOklch,
  hsbToRgba,
  hslToRgba,
  nearestColor,
  oklchToRgba,
  parseColor,
  parseHex,
  parseOklch,
  rgb255ToRgba,
  rgbaToHsb,
  rgbaToHsl,
  rgbaToOklch,
  rgbaToRgb255,
  sameColorDistance
} from "./color.ts"

const hex = (value: string) => parseHex(value)!

describe("hue, saturation and brightness", () => {
  it("reads pure red, a blue and a gray as the picker shows them", () => {
    expect(rgbaToHsb(hex("#ff0000"))).toEqual({ h: 0, s: 100, b: 100 })
    const blue = rgbaToHsb(hex("#3b82f6"))
    expect(Math.round(blue.h)).toBe(217)
    expect(Math.round(blue.s)).toBe(76)
    expect(Math.round(blue.b)).toBe(96)
    // A gray has no hue to show, so the strip stays at red rather than jumping.
    expect(rgbaToHsb(hex("#737373"))).toEqual({ h: 0, s: 0, b: expect.closeTo(45.1, 1) })
  })

  it("gives back the same hex after a trip through the square and strip", () => {
    for (const value of ["#3b82f6", "#e7000b", "#009689", "#fafafa", "#000000", "#ffb900"]) {
      expect(formatHex(hsbToRgba(rgbaToHsb(hex(value))))).toBe(value)
    }
  })

  it("wraps the hue past 360 and keeps alpha", () => {
    expect(formatHex(hsbToRgba({ h: 360, s: 100, b: 100 }))).toBe("#ff0000")
    expect(formatHex(hsbToRgba({ h: 120, s: 100, b: 100 }, 0.5))).toBe("#00ff0080")
  })
})

describe("oklch()", () => {
  it("reads shadcn's neutral theme as the hex the browser shows", () => {
    expect(formatHex(parseOklch("oklch(1 0 0)")!)).toBe("#ffffff")
    expect(formatHex(parseOklch("oklch(0.205 0 0)")!)).toBe("#171717")
    expect(formatHex(parseOklch("oklch(0.556 0 0)")!)).toBe("#737373")
  })

  it("reads lightness and alpha as percentages, and none as 0", () => {
    const white = { r: expect.closeTo(1, 5), g: expect.closeTo(1, 5), b: expect.closeTo(1, 5) }
    expect(parseOklch("oklch(100% 0 none / 10%)")).toEqual({ ...white, a: expect.closeTo(0.1, 5) })
    expect(parseOklch("oklch(1 0 0 / 0.5)")!.a).toBe(0.5)
  })

  it("brings a color outside sRGB into it", () => {
    const vivid = parseOklch("oklch(0.7 0.4 150)")!
    for (const channel of [vivid.r, vivid.g, vivid.b]) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(1)
    }
  })

  it("doesn't read a color it can't be sure of", () => {
    expect(parseOklch("oklch(0.5 0.1)")).toBeUndefined()
    expect(parseOklch("oklch(a b c)")).toBeUndefined()
    expect(parseOklch("rgb(0 0 0)")).toBeUndefined()
  })

  it("writes a gray with no hue, as shadcn does, and a translucent color with its alpha", () => {
    expect(formatOklch(hex("#737373"))).toBe("oklch(0.556 0 0)")
    expect(formatOklch(hex("#ffffff"))).toBe("oklch(1 0 0)")
    expect(formatOklch({ ...hex("#000000"), a: 0.25 })).toBe("oklch(0 0 0 / 0.25)")
  })

  it("writes a color as oklch() without visibly changing it", () => {
    // Three decimals, as shadcn's themes write them, can move a channel by one step of 255, which no one can see.
    for (const value of ["#3b82f6", "#e7000b", "#009689", "#ffb900"]) {
      const written = parseOklch(formatOklch(hex(value)))!
      expect(colorDistance(written, hex(value))).toBeLessThan(sameColorDistance / 10)
    }
  })
})

describe("the picker's other models", () => {
  it("reads a blue the way RGB, HSL and OKLCH fields show it", () => {
    const blue = hex("#3b82f6")
    const rgb = rgbaToRgb255(blue)
    expect([rgb.r, rgb.g, rgb.b].map(Math.round)).toEqual([59, 130, 246])
    const hsl = rgbaToHsl(blue)
    expect([hsl.h, hsl.s, hsl.l].map(Math.round)).toEqual([217, 91, 60])
    const oklch = rgbaToOklch(blue)
    expect(oklch.l).toBeCloseTo(0.623, 3)
    expect(oklch.c).toBeCloseTo(0.188, 3)
    expect(oklch.h).toBeCloseTo(259.8, 1)
  })

  it("gives back the same hex from each model's fields", () => {
    for (const value of ["#3b82f6", "#e7000b", "#009689", "#fafafa", "#000000", "#737373"]) {
      const color = hex(value)
      expect(formatHex(rgb255ToRgba(rgbaToRgb255(color)))).toBe(value)
      expect(formatHex(hslToRgba(rgbaToHsl(color)))).toBe(value)
      expect(formatHex(oklchToRgba(rgbaToOklch(color)))).toBe(value)
    }
  })

  it("keeps a gray's hue at 0 in HSL and OKLCH, as in HSB", () => {
    expect(rgbaToHsl(hex("#737373")).h).toBe(0)
    expect(rgbaToOklch(hex("#737373"))).toEqual({ l: expect.closeTo(0.556, 3), c: 0, h: 0 })
  })

  it("carries alpha through, and keeps channels typed past their range inside it", () => {
    expect(hslToRgba({ h: 0, s: 100, l: 50 }, 0.5)).toEqual({ r: 1, g: 0, b: 0, a: 0.5 })
    expect(rgb255ToRgba({ r: 300, g: -5, b: 128 }, 2)).toEqual({ r: 1, g: 0, b: expect.closeTo(0.502, 3), a: 1 })
  })
})

describe("a token's color", () => {
  it("reads hex and oklch(), and leaves var() and names to the browser", () => {
    expect(parseColor("#171717")).toEqual(parseHex("#171717"))
    expect(formatHex(parseColor("oklch(0.205 0 0)")!)).toBe("#171717")
    expect(parseColor("var(--neutral-900)")).toBeUndefined()
    expect(parseColor("rebeccapurple")).toBeUndefined()
  })

  it("is written the way the token was, so a theme in oklch() stays in it", () => {
    const blue = hex("#3b82f6")
    expect(formatColorLike(blue, "oklch(0.205 0 0)")).toMatch(/^oklch\(/)
    expect(formatColorLike(blue, "#171717")).toBe("#3b82f6")
    expect(formatColorLike(blue, undefined)).toBe("#3b82f6")
  })
})

describe("the nearest token", () => {
  /** shadcn's neutral theme, written as its own CSS is. */
  const neutral = {
    background: "oklch(1 0 0)",
    foreground: "oklch(0.145 0 0)",
    primary: "oklch(0.205 0 0)",
    "muted-foreground": "oklch(0.556 0 0)",
    destructive: "oklch(0.577 0.245 27.325)",
    border: "oklch(0.922 0 0)",
    "chart-2": "oklch(0.6 0.118 184.704)",
    ring: "var(--neutral-400)"
  }

  it("answers a red with destructive and a teal with chart-2", () => {
    expect(nearestColor(hex("#dc2626"), neutral)?.name).toBe("destructive")
    expect(nearestColor(hex("#0f9d8f"), neutral)?.name).toBe("chart-2")
  })

  it("says a token's own color is the same color", () => {
    const nearest = nearestColor(parseColor(neutral["muted-foreground"])!, neutral)!
    expect(nearest.name).toBe("muted-foreground")
    expect(nearest.distance).toBeLessThan(sameColorDistance)
  })

  it("counts alpha, so an opaque color isn't answered with a see-through token", () => {
    const tokens = { overlay: "oklch(0 0 0 / 0.5)", ink: "#111111" }
    expect(nearestColor(hex("#000000"), tokens)?.name).toBe("ink")
  })

  it("breaks a tie by name, whatever order the tokens come in", () => {
    expect(nearestColor(hex("#ffffff"), { card: "#ffffff", background: "#ffffff" })?.name).toBe("background")
  })

  it("has no answer when no token can be read", () => {
    expect(nearestColor(hex("#ffffff"), { ring: "var(--neutral-400)" })).toBeUndefined()
  })
})
