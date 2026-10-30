import { describe, expect, it } from "vite-plus/test"
import type { PreviewKind } from "./kinds.ts"
import { compareNames, orderTokens, parsedLength, shadowReach } from "./token-order.ts"

/** Names in token order, for tokens of one kind given as `[name, value]`. */
function ordered(kind: PreviewKind, tokens: [string, string][]): string[] {
  return orderTokens(tokens, ([name, value]) => ({ name, kind, value })).map(([name]) => name)
}

describe("token order", () => {
  it("lists a picker's lengths smallest first, as the Tokens panel does", () => {
    expect(
      ordered("container", [
        ["container-2xl", "42rem"],
        ["container-2xs", "18rem"],
        ["container-3xl", "48rem"],
        ["container-3xs", "16rem"],
        ["container-lg", "32rem"]
      ])
    ).toEqual(["container-3xs", "container-2xs", "container-lg", "container-2xl", "container-3xl"])
  })

  it("puts none first, as nothing", () => {
    expect(
      ordered("blur", [
        ["chakra-blurs-4xl", "72px"],
        ["chakra-blurs-none", "none"],
        ["chakra-blurs-sm", "4px"]
      ])
    ).toEqual(["chakra-blurs-none", "chakra-blurs-sm", "chakra-blurs-4xl"])
    expect(
      ordered("shadow", [
        ["mui-shadows-24", "0px 11px 15px -7px rgba(0,0,0,0.2)"],
        ["mui-shadows-0", "none"],
        ["mui-shadows-1", "0px 2px 1px -1px rgba(0,0,0,0.2)"]
      ])
    ).toEqual(["mui-shadows-0", "mui-shadows-1", "mui-shadows-24"])
  })

  it("lists what it can't measure after the rest, by name", () => {
    expect(
      ordered("radius", [
        ["radius-lg", "var(--radius)"],
        ["radius-xs", "2px"],
        ["radius-md", "calc(var(--radius) - 2px)"]
      ])
    ).toEqual(["radius-xs", "radius-md", "radius-lg"])
  })

  it("can't measure a value that still holds a var(), whichever part holds it", () => {
    expect(
      ordered("shadow", [
        ["shadow-a", "0 var(--missing) black"],
        ["shadow-b", "0 4px 6px black"]
      ])
    ).toEqual(["shadow-b", "shadow-a"])
    expect(
      ordered("z-index", [
        ["z-a", "var(--layer)"],
        ["z-b", "10"]
      ])
    ).toEqual(["z-b", "z-a"])
    expect(
      ordered("animation", [
        ["animate-a", "spin var(--speed) 1s linear"],
        ["animate-b", "spin 2s linear"]
      ])
    ).toEqual(["animate-b", "animate-a"])
  })
})

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

  it("put size words before other words, so the order never runs in a circle", () => {
    // By size sm comes before lg, and alphabetically lg before normal and normal before sm.
    const names = ["text-sm", "text-lg", "text-normal"]
    expect(compareNames("text-sm", "text-lg")).toBeLessThan(0)
    expect(compareNames("text-lg", "text-normal")).toBeLessThan(0)
    expect(compareNames("text-sm", "text-normal")).toBeLessThan(0)
    for (const start of names.keys()) {
      const turned = [...names.slice(start), ...names.slice(0, start)]
      expect(sorted(turned)).toEqual(["text-sm", "text-lg", "text-normal"])
      expect(sorted(turned.toReversed())).toEqual(["text-sm", "text-lg", "text-normal"])
    }
  })

  it("break a tie between equal values, with a name that starts another first", () => {
    expect(
      ordered("radius", [
        ["radius-lg", "10px"],
        ["radius", "10px"]
      ])
    ).toEqual(["radius", "radius-lg"])
  })
})

describe("animations", () => {
  it("list by duration, those without one after by name", () => {
    expect(
      ordered("animation", [
        ["animate-pulse", "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"],
        ["animate-accordion-up", "accordion-up var(--tw-duration, 200ms) ease-out"],
        ["animate-spin", "spin 1s linear infinite"],
        ["animate-caret-blink", "caret-blink 1.25s ease-out infinite"]
      ])
    ).toEqual(["animate-spin", "animate-caret-blink", "animate-pulse", "animate-accordion-up"])
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

  it("measure calc() lengths with the measurer they're given, and order by them", () => {
    // A stand-in for the app's measurer, which asks the browser: it knows one calc().
    const length = (value: string) => (value === "calc(2px * 4)" ? 8 : parsedLength(value))
    // Plain parsing can't read calc(), so only the x offset counts.
    expect(shadowReach("0 calc(2px * 4) rgb(0 0 0 / 0.1)")).toBe(0)
    expect(shadowReach("0 calc(2px * 4) rgb(0 0 0 / 0.1)", length)).toBe(8)
    // A variable isn't handed to the measurer, which in the app would lay it out as nothing.
    expect(shadowReach("0 var(--y) rgb(0 0 0 / 0.1)", (value) => (value.startsWith("var(") ? 99 : 0))).toBe(0)
    const shadows: [string, string][] = [
      ["shadow-a", "0 calc(2px * 4) rgb(0 0 0 / 0.1)"],
      ["shadow-b", "0 4px rgb(0 0 0 / 0.1)"]
    ]
    expect(
      orderTokens(shadows, ([name, value]) => ({ name, kind: "shadow", value }), length).map(([name]) => name)
    ).toEqual(["shadow-b", "shadow-a"])
  })

  it("list smallest first, whatever they're named", () => {
    expect(
      ordered("shadow", [
        ["shadow-2xl", "0 25px 50px -12px rgb(0 0 0 / 0.25)"],
        ["shadow-lg", "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)"],
        ["shadow-md", "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)"],
        ["shadow-sm", "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)"],
        ["shadow-xl", "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"],
        ["shadow-xs", "0 1px 2px 0 rgb(0 0 0 / 0.05)"],
        ["shadow-2xs", "0 1px rgb(0 0 0 / 0.05)"]
      ])
    ).toEqual(["shadow-2xs", "shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl", "shadow-2xl"])
    expect(
      ordered("shadow", [
        ["shadow64", "0 0 8px rgba(0,0,0,0.12), 0 32px 64px rgba(0,0,0,0.14)"],
        ["shadow4", "0 0 2px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.14)"],
        ["shadow16", "0 0 2px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.14)"]
      ])
    ).toEqual(["shadow4", "shadow16", "shadow64"])
  })
})
