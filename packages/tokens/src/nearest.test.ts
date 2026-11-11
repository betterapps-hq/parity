import { describe, expect, it } from "vite-plus/test"
import { parseHex } from "./color.ts"
import { defaultValues } from "./kinds.ts"
import { type NearValue, nearestTokens, readNearValue } from "./nearest.ts"
import { spacingScale, type Token } from "./tokens.ts"

/** A token as the agent lists it, whose source can also be `keyword`. */
type Listed = Omit<Token, "source"> & { source: string }

/** A project as Tailwind v4 and shadcn write it: a few of the palette's blues, shadcn's theme, radii, type and spacing. */
const project: Listed[] = [
  { name: "color-blue-500", category: "color", source: "theme", values: { default: "oklch(62.3% 0.214 259.815)" } },
  { name: "color-blue-600", category: "color", source: "theme", values: { default: "oklch(54.6% 0.245 262.881)" } },
  { name: "color-blue-700", category: "color", source: "theme", values: { default: "oklch(48.8% 0.243 264.376)" } },
  { name: "color-white", category: "color", source: "theme", values: { default: "#fff" } },
  { name: "primary", category: "color", source: "semantic", values: { default: "var(--color-blue-600)" } },
  {
    name: "background",
    category: "color",
    source: "semantic",
    values: { default: "oklch(1 0 0)", dark: "oklch(0.145 0 0)" }
  },
  {
    name: "border",
    category: "color",
    source: "semantic",
    values: { default: "oklch(0.922 0 0)", dark: "oklch(1 0 0 / 10%)" }
  },
  { name: "sidebar-ring", category: "color", source: "semantic", values: { dark: "oklch(0.439 0 0)" } },
  { name: "chart-brand", category: "color", source: "semantic", values: { default: "var(--brand)" } },
  { name: "radius", category: "radius", source: "semantic", values: { default: "0.625rem" } },
  { name: "radius-sm", category: "radius", source: "semantic", values: { default: "calc(var(--radius) - 4px)" } },
  { name: "radius-md", category: "radius", source: "semantic", values: { default: "calc(var(--radius) - 2px)" } },
  { name: "radius-lg", category: "radius", source: "semantic", values: { default: "var(--radius)" } },
  { name: "radius-full", category: "radius", source: "keyword", values: { default: "calc(infinity * 1px)" } },
  { name: "text-xs", category: "font-size", source: "theme", values: { default: "0.75rem" } },
  { name: "text-sm", category: "font-size", source: "theme", values: { default: "0.875rem" } },
  { name: "text-base", category: "font-size", source: "theme", values: { default: "1rem" } },
  { name: "text-fluid", category: "font-size", source: "semantic", values: { default: "clamp(1rem, 2vw, 2rem)" } },
  { name: "spacing", category: "spacing", source: "theme", values: { default: "0.25rem" } },
  ...spacingScale.map((step): Listed => ({
    name: `spacing-${step}`,
    category: "spacing",
    source: "theme",
    values: { default: step === 0 ? "0" : `calc(var(--spacing) * ${step})` },
    derived: { from: "spacing", factor: step }
  }))
]

const lookup = defaultValues(project)

/** The nearest tokens' names and distances, from those of `categories`. */
function nearest(value: NearValue | undefined, categories: string[], count = 3): [string, number][] {
  const tokens = project.filter((token) => categories.includes(token.category))

  return nearestTokens(value!, tokens, lookup)
    .slice(0, count)
    .map(({ token, distance }) => [token.name, distance])
}

describe("the tokens nearest a value", () => {
  it("reads hex and oklch() as colors, and px, rem and em as lengths", () => {
    expect(readNearValue("#2f6fed")).toEqual({ color: parseHex("#2f6fed") })
    expect(readNearValue("oklch(0.5 0.2 260)")).toMatchObject({ color: { a: 1 } })
    expect(readNearValue("13px")).toEqual({ length: 13 })
    expect(readNearValue("0.8125rem")).toEqual({ length: 13 })
    expect(readNearValue("1em")).toEqual({ length: 16 })
  })

  it("doesn't read a value it can't measure", () => {
    for (const value of ["blue", "13", "var(--primary)", "50%", "rgb(47 111 237)"]) {
      expect(readNearValue(value)).toBeUndefined()
    }
  })

  it("lists the colors nearest a color first, through the tokens they refer to", () => {
    // #2f6fed sits between Tailwind's blue-500 and blue-600, nearer 500. primary is blue-600, and the project's own
    // token comes first when they're as near.
    expect(nearest(readNearValue("#2f6fed"), ["color"])).toEqual([
      ["color-blue-500", 0.046],
      ["primary", 0.052],
      ["color-blue-600", 0.052]
    ])
  })

  it("finds the same color written another way at no distance", () => {
    expect(nearest(readNearValue("#ffffff"), ["color"], 2)).toEqual([
      ["background", 0],
      ["color-white", 0]
    ])
  })

  it("counts a difference in alpha", () => {
    // White at 0x1a (about 10%) against opaque white.
    const translucent = nearestTokens(readNearValue("#ffffff1a")!, project, lookup)

    expect(translucent.find(({ token }) => token.name === "background")?.distance).toBe(0.898)
  })

  it("reads each token in the default theme, and one only a theme sets in that theme", () => {
    const black = nearestTokens(readNearValue("#0a0a0a")!, project, lookup)

    // sidebar-ring has only a dark value, read there; background is near black only in dark, so it's far.
    expect(black[0]?.token.name).toBe("sidebar-ring")
    expect(black.find(({ token }) => token.name === "background")?.distance).toBeGreaterThan(0.8)
  })

  it("leaves out colors it can't read, and everything that isn't a color", () => {
    const names = nearestTokens(readNearValue("#2f6fed")!, project, lookup).map(({ token }) => token.name)

    expect(names).not.toContain("chart-brand")
    expect(names).not.toContain("radius-md")
    expect(names).toHaveLength(8)
  })

  it("lists the lengths nearest a length, in pixels, with calc() and references worked out", () => {
    expect(nearest(readNearValue("13px"), ["spacing"])).toEqual([
      ["spacing-3", 1],
      ["spacing-3.5", 1],
      ["spacing-2.5", 3]
    ])
    expect(nearest(readNearValue("6px"), ["radius"])).toEqual([
      ["radius-sm", 0],
      ["radius-md", 2],
      ["radius", 4]
    ])
    expect(nearest(readNearValue("0.8rem"), ["font-size"])).toEqual([
      ["text-xs", 0.8],
      ["text-sm", 1.2],
      ["text-base", 3.2]
    ])
  })

  it("leaves out lengths it can't measure, such as clamp() and a keyword's infinity", () => {
    const names = nearestTokens(readNearValue("16px")!, project, lookup).map(({ token }) => token.name)

    expect(names).not.toContain("text-fluid")
    expect(names).not.toContain("radius-full")
    expect(names).not.toContain("primary")
  })
})
