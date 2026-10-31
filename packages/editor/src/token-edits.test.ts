import type { Token, TokenChange } from "@parity-app/tokens"
import { describe, expect, it } from "vite-plus/test"
import {
  noTokenEdits,
  sameTokenValues,
  tokenDifferences,
  type TokenEdits,
  tokensWithEdits,
  tokenWrites,
  withTokenEdits,
  withTokenOverrides
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

  describe("as overrides for frames drawn elsewhere", () => {
    const loaded: Token[] = [
      { name: "primary", category: "color", source: "semantic", values: { default: "black" } },
      { name: "radius", category: "radius", source: "semantic", values: { default: "0.5rem" } }
    ]
    /** The overrides after the canvas goes from one set of edits to the next, as the token store follows them. */
    const follow = (overrides: readonly TokenChange[], from: TokenEdits, to: TokenEdits, baseline = loaded) =>
      withTokenOverrides(overrides, tokenDifferences(from, to), baseline)

    it("hold only the values that differ from the stylesheet as it loaded", () => {
      const edits = withTokenEdits(noTokenEdits, [
        { ...primary, value: "red" },
        { name: "radius", theme: "dark", value: "1rem" }
      ])
      const edited = follow([], noTokenEdits, edits)
      expect(edited).toEqual([
        { name: "primary", theme: "default", value: "red" },
        { name: "radius", theme: "dark", value: "1rem" }
      ])
      const back = withTokenEdits(edits, [{ ...primary, value: "black" }])
      expect(follow(edited, edits, back)).toEqual([{ name: "radius", theme: "dark", value: "1rem" }])
      // Undone, a value a theme didn't have leaves nothing behind.
      expect(follow(edited, edits, noTokenEdits)).toEqual([])
      expect(follow(edited, edits, edits)).toBe(edited)
    })

    it("keep a value undone after a guest loaded again with it saved", () => {
      const edits = withTokenEdits(noTokenEdits, [
        { ...primary, value: "red" },
        { name: "radius", theme: "dark", value: "1rem" }
      ])
      // Saved, then the guest loads again: its stylesheet has the edits, so a new store starts with nothing to override.
      const saved: Token[] = [
        { ...loaded[0]!, values: { default: "red" } },
        { ...loaded[1]!, values: { default: "0.5rem", dark: "1rem" } }
      ]
      const reloaded = follow([], noTokenEdits, edits, saved)
      expect(reloaded).toEqual([])
      // Undoing puts black back and takes the dark radius out on the canvas; frames drawn elsewhere must do the same.
      expect(follow(reloaded, edits, noTokenEdits, saved)).toEqual([
        { name: "primary", theme: "default", value: "black" },
        { name: "radius", theme: "dark", value: "" }
      ])
    })
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
