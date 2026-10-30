import type { Token } from "@parity-app/tokens"
import { describe, expect, it } from "vite-plus/test"
import { comesTo, inTokenOrder } from "./token-values.ts"

const token = (name: string, category: Token["category"], value: string, extra: Partial<Token> = {}): Token => ({
  name,
  category,
  source: "theme",
  values: { default: value },
  ...extra
})

const names = (tokens: Token[]) => tokens.map((each) => each.name)

describe("the shared token order", () => {
  it("reads a token's kind from the DTCG type a .lib.par gives it, as the Tokens panel does", () => {
    const tokens = [
      token("elevation-low", "other", "0 1px 2px rgb(0 0 0 / 0.1)"),
      token("elevation-high", "other", "0 8px 16px rgb(0 0 0 / 0.1)"),
      token("elevation-mid", "other", "0 4px 8px rgb(0 0 0 / 0.1)")
    ]
    // Without a type, these are plain numbers, which can't be measured, so they list by name.
    expect(names(inTokenOrder(tokens))).toEqual(["elevation-high", "elevation-low", "elevation-mid"])
    const described = [
      {
        name: "Acme",
        manifest: "acme.lib.par",
        tokens: ["low", "mid", "high"].map((step) => ({ path: `elevation.${step}`, type: "shadow", values: {} }))
      }
    ]
    expect(names(inTokenOrder(tokens, described))).toEqual(["elevation-low", "elevation-mid", "elevation-high"])
  })

  it("reads what a value comes to, references and derived steps filled in", () => {
    const tokens = [
      token("spacing", "spacing", "0.25rem"),
      token("spacing-10", "spacing", "calc(var(--spacing) * 10)", { derived: { from: "spacing", factor: 10 } }),
      token("spacing-gutter", "spacing", "var(--spacing-wide)"),
      token("spacing-wide", "spacing", "24px")
    ]
    const byName = new Map(tokens.map((each) => [each.name, each]))
    expect(comesTo(byName, "spacing-10")).toBe("40px")
    expect(comesTo(byName, "spacing-gutter")).toBe("24px")
    expect(names(inTokenOrder(tokens))).toEqual(["spacing", "spacing-gutter", "spacing-wide", "spacing-10"])
  })

  it("lists a value still holding a var() after the rest, without asking the measurer", () => {
    const tokens = [
      token("radius-a", "radius", "calc(var(--missing) - 2px)"),
      token("radius-b", "radius", "8px"),
      token("radius-c", "radius", "var(--missing)")
    ]
    // A stand-in for the browser, which lays out what it can't resolve as nothing.
    const asked: string[] = []
    const browser = (value: string) => {
      asked.push(value)
      return value.includes("var(") ? 0 : Number.parseFloat(value)
    }
    expect(names(inTokenOrder(tokens, undefined, browser))).toEqual(["radius-b", "radius-a", "radius-c"])
    expect(asked).toEqual(["8px"])
  })
})
