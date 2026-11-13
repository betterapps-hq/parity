import { describe, expect, it } from "vite-plus/test"
import type { Token } from "./tokens.ts"
import { tokenValue } from "./values.ts"

const token = (name: string, values: Record<string, string>, derived?: Token["derived"]) =>
  [name, { values, derived }] as const

const tokens = new Map([
  token("spacing", { default: "0.25rem", compact: "3px" }),
  token("spacing-10", { default: "calc(var(--spacing) * 10)" }, { from: "spacing", factor: 10 }),
  token("spacing-1.5", { default: "calc(var(--spacing) * 1.5)" }, { from: "spacing", factor: 1.5 }),
  token("primary", { default: "#2563eb", dark: "#60a5fa" }),
  token("ring", { default: "var(--primary)" }),
  token("gap", { default: "clamp(4px, 1vw, 8px)" }),
  token("gap-2", { default: "calc(var(--gap) * 2)" }, { from: "gap", factor: 2 }),
  token("loop-a", { default: "var(--loop-b)" }),
  token("loop-b", { default: "var(--loop-a)" })
])

describe("tokenValue", () => {
  it("gives a plain token its value in the theme, or its root value where the theme sets none", () => {
    expect(tokenValue(tokens, "primary")).toBe("#2563eb")
    expect(tokenValue(tokens, "primary", "dark")).toBe("#60a5fa")
    expect(tokenValue(tokens, "primary", "print")).toBe("#2563eb")
  })

  it("fills in the tokens a value refers to, in the same theme", () => {
    expect(tokenValue(tokens, "ring")).toBe("#2563eb")
    expect(tokenValue(tokens, "ring", "dark")).toBe("#60a5fa")
  })

  it("gives a step of a scale its base times its factor, in rounded pixels", () => {
    expect(tokenValue(tokens, "spacing-10")).toBe("40px")
    expect(tokenValue(tokens, "spacing-1.5", "compact")).toBe("4.5px")
  })

  it("gives a step whose base it can't measure as calc() of the base, or pixels when given a measurer that can", () => {
    expect(tokenValue(tokens, "gap-2")).toBe("calc(clamp(4px, 1vw, 8px) * 2)")
    expect(tokenValue(tokens, "gap-2", "default", () => 6)).toBe("12px")
  })

  it("gives nothing for a token there isn't, and leaves a reference to one as written", () => {
    expect(tokenValue(tokens, "missing")).toBeUndefined()
    expect(tokenValue(new Map([token("card", { default: "var(--missing, 4px) var(--none)" })]), "card")).toBe(
      "4px var(--none)"
    )
  })

  it("ends a loop instead of following it forever", () => {
    expect(tokenValue(tokens, "loop-a")).toMatch(/^var\(--loop-[ab]\)$/)
  })
})
