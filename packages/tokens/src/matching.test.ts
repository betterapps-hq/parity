import type { DescribedTokens } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { matchDescribed } from "./matching.ts"
import type { Token } from "./tokens.ts"

const token = (name: string): Token => ({ name, category: "color", source: "semantic", values: { default: "red" } })

const nova: DescribedTokens = {
  name: "Nova",
  manifest: "nova.lib.par",
  tokens: [
    { path: "color.primary", values: { default: "red" }, description: "The brand color" },
    { path: "color.surface.raised", values: { default: "white" } },
    { path: "spacing.md", values: { default: "12px" }, parity: { var: "nova-space-md" } },
    { path: "spacing.lg", values: { default: "16px" }, parity: { var: "nova-space-lg" } },
    { path: "radius.pill", values: { default: "999px" } }
  ]
}

describe("matchDescribed", () => {
  it("matches a token by the custom property its extension names, else by its path", () => {
    const tokens = ["primary", "color-surface-raised", "nova-space-md", "spacing-lg"].map(token)
    const { byName, unmatched } = matchDescribed([nova], tokens)
    expect([...byName.keys()]).toEqual(["primary", "color-surface-raised", "nova-space-md"])
    expect(byName.get("primary")).toMatchObject({
      path: "color.primary",
      library: "Nova",
      description: "The brand color"
    })
    // A token that names its custom property doesn't fall back to its path.
    expect(unmatched.map((described) => described.path)).toEqual(["spacing.lg", "radius.pill"])
  })

  it("matches nothing without described tokens", () => {
    expect(matchDescribed(undefined, [token("primary")])).toEqual({ byName: new Map(), unmatched: [] })
  })
})
