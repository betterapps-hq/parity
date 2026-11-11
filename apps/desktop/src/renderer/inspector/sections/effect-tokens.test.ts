import type { Token } from "@parity-app/tokens"
import { describe, expect, it } from "vite-plus/test"
import { effectTokenSets, shadowLayers } from "./effect-tokens.ts"

/** Pixels in px or rem, NaN for anything else, as the browser would measure them. */
const length = (value: string) => {
  const match = /^(-?[\d.]+)(px|rem)$/.exec(value)

  if (!match) {
    return Number.NaN
  }

  return Number(match[1]) * (match[2] === "rem" ? 16 : 1)
}

/** Colors as the browser reads them, for the ones these tests use. */
const color = (value: string) => (value === "rgb(0 0 0 / 0.1)" ? "#0000001a" : value)

const token = (name: string, category: Token["category"], value: string): Token => ({
  name,
  category,
  source: "theme",
  values: { default: value }
})

describe("shadowLayers", () => {
  it("reads each layer's numbers, inset and color, as a plain color", () => {
    expect(shadowLayers("0 1px 3px 0 rgb(0 0 0 / 0.1), inset 0 -1px 0 0 #ffffff", length, color)).toEqual([
      { x: 0, y: 1, blur: 3, spread: 0, color: "#0000001a" },
      { x: 0, y: -1, blur: 0, spread: 0, color: "#ffffff", inset: true }
    ])
  })

  it("reads nothing from what isn't a shadow", () => {
    expect(shadowLayers("none", length, color)).toEqual([])
  })
})

describe("effectTokenSets", () => {
  it("offers the project's colors, shadows by kind, and blurs", () => {
    const sets = effectTokenSets(
      [
        token("primary", "color", "#2563eb"),
        token("shadow-sm", "shadow", "0 1px 2px 0 rgb(0 0 0 / 0.05)"),
        token("inset-shadow-xs", "shadow", "inset 0 1px 1px rgb(0 0 0 / 0.05)"),
        token("drop-shadow-md", "shadow", "0 3px 3px rgb(0 0 0 / 0.12)"),
        token("blur-sm", "blur", "8px"),
        token("radius-lg", "radius", "0.5rem")
      ],
      length,
      color
    )

    expect(sets.color.map(({ name, hex }) => [name, hex])).toEqual([["primary", "#2563eb"]])
    expect(sets.shadow.map(({ name, layers }) => [name, layers.length])).toEqual([["shadow-sm", 1]])
    expect(sets.insetShadow.map(({ name }) => name)).toEqual(["inset-shadow-xs"])
    expect(sets.dropShadow.map(({ name }) => name)).toEqual(["drop-shadow-md"])
    expect(sets.blur.map(({ name, px }) => [name, px])).toEqual([["blur-sm", 8]])
  })
})
