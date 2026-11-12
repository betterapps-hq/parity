import type { Token } from "@parity-app/tokens"
import { describe, expect, it } from "vite-plus/test"
import { weightTokens } from "./controls/tokens.ts"
import { projectTokenSets } from "./token-sets.ts"

function token(name: string, category: Token["category"], value: string, derived?: Token["derived"]): Token {
  const made: Token = { name, category, source: "theme", values: { default: value } }

  if (derived) {
    made.derived = derived
  }

  return made
}

const tokens: Token[] = [
  token("primary", "color", "#171717"),
  token("radius-lg", "radius", "10px"),
  token("spacing", "spacing", "4px"),
  token("spacing-4", "spacing", "16px", { from: "spacing", factor: 4 }),
  token("container-sm", "container", "384px"),
  token("text-xl", "font-size", "20px"),
  token("text-xl--line-height", "font-size", "calc(1.75 / 1.25)"),
  token("font-semibold", "font-weight", "600"),
  token("leading-tight", "leading", "1.25"),
  token("tracking-wide", "tracking", "0.025em"),
  token("font-sans", "font", '"Geist", sans-serif')
]

describe("the project's tokens as the controls offer them", () => {
  const sets = projectTokenSets(tokens)

  it("keeps each token's real name, the one the style holds", () => {
    expect(sets.color.map((each) => each.name)).toEqual(["primary"])
    expect(sets.container.map((each) => [each.name, each.px])).toEqual([["container-sm", 384]])
    expect(sets.tracking.map((each) => [each.name, each.em])).toEqual([["tracking-wide", 0.025]])
    expect(sets.leading.map((each) => [each.name, each.multiple])).toEqual([["leading-tight", 1.25]])
  })

  it("leaves out the spacing scale's base and steps, which the fields hold as pixels", () => {
    expect(sets.spacing).toEqual([])
  })

  it("offers Full as a radius, as the framework writes it without a token", () => {
    expect(sets.radius.map((each) => [each.name, each.px])).toEqual([
      ["radius-lg", 10],
      ["radius-full", 9999]
    ])
  })

  it("pairs each text size with its line height", () => {
    expect(sets.size.find((each) => each.name === "text-xl")).toMatchObject({ px: 20, lineHeight: 28 })
  })

  it("names weights in words, and falls back to the hundreds without weight tokens", () => {
    expect(sets.weight).toEqual([expect.objectContaining({ name: "font-semibold", weight: 600, label: "Semibold" })])
    expect(projectTokenSets([]).weight).toBe(weightTokens)
  })

  it("names a font by its first family", () => {
    expect(sets.font[0]).toMatchObject({ name: "font-sans", detail: "Geist" })
  })

  it("offers nothing the style can't hold yet", () => {
    expect([sets.blur, sets.duration, sets.zIndex, sets.opacity]).toEqual([[], [], [], []])
  })
})
