import { describe, expect, it } from "vite-plus/test"
import { barLength, compareNames, inScaleOrder, type PreviewToken, shadowReach } from "./token-previews.tsx"

describe("names", () => {
  const sorted = (names: string[]) => names.toSorted(compareNames)

  it("order numbers by value", () => {
    expect(sorted(["chart-10", "chart-2", "chart-1"])).toEqual(["chart-1", "chart-2", "chart-10"])
    expect(sorted(["shadow16", "shadow4", "shadow64", "shadow8"])).toEqual([
      "shadow4",
      "shadow8",
      "shadow16",
      "shadow64"
    ])
    expect(sorted(["spacing-1.5", "spacing-0.5", "spacing-10", "spacing-1"])).toEqual([
      "spacing-0.5",
      "spacing-1",
      "spacing-1.5",
      "spacing-10"
    ])
  })

  it("order size words smallest first, whichever library writes them", () => {
    expect(
      sorted(["radius-xl", "radius-sm", "radius-2xl", "radius-xs", "radius-md", "radius-lg", "radius-2xs"])
    ).toEqual(["radius-2xs", "radius-xs", "radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-2xl"])
    expect(
      sorted(["spacingHorizontalXXL", "spacingHorizontalS", "spacingHorizontalXXS", "spacingHorizontalM"])
    ).toEqual(["spacingHorizontalXXS", "spacingHorizontalS", "spacingHorizontalM", "spacingHorizontalXXL"])
    expect(sorted(["borderRadiusXLarge", "borderRadiusSmall", "borderRadiusLarge", "borderRadiusMedium"])).toEqual([
      "borderRadiusSmall",
      "borderRadiusMedium",
      "borderRadiusLarge",
      "borderRadiusXLarge"
    ])
  })

  it("break a tie between equal values, with a name that starts another first", () => {
    const radius = (name: string): PreviewToken => ({ name, kind: "radius", values: { default: "10px" } })
    expect(inScaleOrder([radius("radius-lg"), radius("radius")], (each) => each).map((each) => each.name)).toEqual([
      "radius",
      "radius-lg"
    ])
  })
})

describe("animations", () => {
  it("list by duration, those without one after by name", () => {
    const animation = (name: string, value: string): PreviewToken => ({
      name,
      kind: "animation",
      values: { default: value }
    })
    const animations = [
      animation("animate-pulse", "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"),
      animation("animate-accordion-up", "accordion-up var(--tw-duration, 200ms) ease-out"),
      animation("animate-spin", "spin 1s linear infinite"),
      animation("animate-caret-blink", "caret-blink 1.25s ease-out infinite")
    ]
    expect(inScaleOrder(animations, (each) => each).map((each) => each.name)).toEqual([
      "animate-spin",
      "animate-caret-blink",
      "animate-pulse",
      "animate-accordion-up"
    ])
  })
})

describe("shadows", () => {
  it("measure how far they reach past their box, from their furthest layer", () => {
    expect(shadowReach("0 1px rgb(0 0 0 / 0.05)")).toBe(1)
    expect(shadowReach("0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)")).toBe(9)
    expect(shadowReach("inset 0 2px 4px 0 rgb(0 0 0 / 0.05)")).toBe(6)
    expect(shadowReach("0 0 2px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.14)")).toBe(24)
    expect(shadowReach("0 0.5rem 1rem oklch(0 0 0 / 20%)")).toBe(24)
    expect(shadowReach("var(--shadow-offset) var(--shadow-color)")).toBeUndefined()
  })

  it("list smallest first, whatever they're named", () => {
    const shadow = (name: string, value: string): PreviewToken => ({ name, kind: "shadow", values: { default: value } })
    const shadows = [
      shadow("shadow-2xl", "0 25px 50px -12px rgb(0 0 0 / 0.25)"),
      shadow("shadow-lg", "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)"),
      shadow("shadow-md", "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)"),
      shadow("shadow-sm", "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)"),
      shadow("shadow-xl", "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"),
      shadow("shadow-xs", "0 1px 2px 0 rgb(0 0 0 / 0.05)"),
      shadow("shadow-2xs", "0 1px rgb(0 0 0 / 0.05)")
    ]
    expect(inScaleOrder(shadows, (each) => each).map((each) => each.name)).toEqual([
      "shadow-2xs",
      "shadow-xs",
      "shadow-sm",
      "shadow-md",
      "shadow-lg",
      "shadow-xl",
      "shadow-2xl"
    ])
    const fluent = [
      shadow("shadow64", "0 0 8px rgba(0,0,0,0.12), 0 32px 64px rgba(0,0,0,0.14)"),
      shadow("shadow4", "0 0 2px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.14)"),
      shadow("shadow16", "0 0 2px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.14)")
    ]
    expect(inScaleOrder(fluent, (each) => each).map((each) => each.name)).toEqual(["shadow4", "shadow16", "shadow64"])
  })
})

describe("a spacing bar", () => {
  it("is drawn at its true size up to 16 pixels short of its room", () => {
    expect(barLength(8, 36)).toEqual({ solid: 8, squeezed: 0 })
    expect(barLength(20, 36)).toEqual({ solid: 20, squeezed: 0 })
    expect(barLength(150, 166)).toEqual({ solid: 150, squeezed: 0 })
  })

  it("squeezes what's past the knee into the last 16 pixels, ending at the room for 384 pixels", () => {
    const { solid, squeezed } = barLength(96, 36)
    expect(solid).toBe(20)
    expect(squeezed).toBeGreaterThan(0)
    expect(squeezed).toBeLessThan(16)
    expect(barLength(384, 36)).toEqual({ solid: 20, squeezed: 16 })
    expect(barLength(1000, 36)).toEqual({ solid: 20, squeezed: 16 })
  })

  it("always ends further along for a longer length", () => {
    const ends = [0, 4, 16, 20, 24, 32, 48, 64, 96, 128, 192, 256, 320, 384].map((length) => {
      const { solid, squeezed } = barLength(length, 36)
      return solid + squeezed
    })
    expect(ends).toEqual(ends.toSorted((a, b) => a - b))
    expect(new Set(ends.slice(1)).size).toBe(ends.length - 1)
  })

  it("draws a length it can't measure as the shortest bar, and keeps a squeezed tail within a small room", () => {
    expect(barLength(Number.NaN, 36)).toEqual({ solid: 1, squeezed: 0 })
    const { solid, squeezed } = barLength(100, 12)
    expect(solid + squeezed).toBeLessThanOrEqual(12)
  })
})
