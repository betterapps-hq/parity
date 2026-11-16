import { describe, expect, it } from "vite-plus/test"
import { layerOrderSide, stackingName, zIndexOf } from "./layer-order.ts"

describe("Layer order", () => {
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
