import type { Token } from "@parity-app/tokens"
import { describe, expect, it } from "vite-plus/test"
import { layerOrderSide, stackingName, zIndexOf, projectZIndexTokens } from "./layer-order.ts"

const token = (name: string, value: string): Token => ({
  name,
  category: "other",
  source: "theme",
  values: { default: value }
})

describe("Layer order", () => {
  it("offers the project's z-index tokens in the order they stack, with what each comes to", () => {
    const tokens = [
      token("z-modal", "50"),
      token("z-raised", "10"),
      token("z-top", "var(--z-modal)"),
      token("gutter", "2")
    ]

    expect(projectZIndexTokens(tokens).map((each) => [each.name, each.px])).toEqual([
      ["z-raised", 10],
      ["z-modal", 50],
      ["z-top", 50]
    ])
  })

  it("shows a number, a token or Auto, and stores what's chosen", () => {
    expect(layerOrderSide({ step: 10 })).toEqual({ number: 10 })
    expect(layerOrderSide({ token: "z-overlay" })).toEqual({ token: "z-overlay" })
    expect(layerOrderSide(undefined)).toBeUndefined()

    expect(zIndexOf({ number: -5 })).toEqual({ step: -5 })
    expect(zIndexOf({ token: "z-overlay" })).toEqual({ token: "z-overlay" })
    expect(zIndexOf("auto")).toBeUndefined()
    expect(zIndexOf(undefined)).toBeUndefined()
  })

  it("names the stacking context it orders within", () => {
    expect(stackingName({ id: "pricing", name: "Pricing", because: "opacity" })).toBe(
      "Pricing, a stacking context because it's see-through"
    )
    expect(stackingName({ id: "main", name: "Main", because: "root" })).toBe("Main, the design's root")
    expect(stackingName(undefined)).toBe("its stacking context")
  })
})
