import type { Token } from "@parity/core"
import { describe, expect, it } from "vitest"
import {
  noTokenEdits,
  sameTokenValues,
  tokenDifferences,
  tokensWithEdits,
  tokenWrites,
  withTokenEdits
} from "./token-edits.ts"

const primary = { name: "primary", theme: "default", original: "black" }

describe("token edits", () => {
  it("keep a token's latest value with the original from its first edit", () => {
    const first = withTokenEdits(noTokenEdits, [{ ...primary, value: "red" }])
    const second = withTokenEdits(first, [{ ...primary, value: "blue", original: "red" }])
    expect(second.get("primary default")).toEqual({ ...primary, value: "blue" })
    expect(first.get("primary default")?.value).toBe("red")
  })

  it("write only what differs from what's saved, and the original once an edit is undone past a save", () => {
    const saved = withTokenEdits(noTokenEdits, [{ ...primary, value: "red" }])
    const current = withTokenEdits(saved, [{ name: "radius", theme: "default", value: "1rem", original: "0.5rem" }])
    expect(tokenWrites(current, saved)).toEqual([{ name: "radius", theme: "default", value: "1rem" }])
    expect(tokenWrites(noTokenEdits, saved)).toEqual([{ name: "primary", theme: "default", value: "black" }])
    expect(sameTokenValues(withTokenEdits(noTokenEdits, [{ ...primary, value: "black" }]), noTokenEdits)).toBe(true)
  })

  it("say a value a theme didn't have is taken out again, and have nothing to write for it", () => {
    const dark = withTokenEdits(noTokenEdits, [{ name: "radius", theme: "dark", value: "1rem" }])
    expect(tokenDifferences(dark, noTokenEdits)).toEqual([{ name: "radius", theme: "dark", value: undefined }])
    expect(tokenWrites(noTokenEdits, dark)).toEqual([])
  })

  it("apply over the project's tokens for the Tokens panel", () => {
    const tokens: Token[] = [
      { name: "primary", category: "color", source: "semantic", values: { default: "black", dark: "white" } },
      { name: "radius", category: "radius", source: "semantic", values: { default: "0.5rem" } }
    ]
    const edited = tokensWithEdits(tokens, withTokenEdits(noTokenEdits, [{ ...primary, value: "red" }]))
    expect(edited[0]?.values).toEqual({ default: "red", dark: "white" })
    expect(edited[1]).toBe(tokens[1])
  })
})
