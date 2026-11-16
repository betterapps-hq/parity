import { describe, expect, it } from "vite-plus/test"
import { readSide, sideRules, sideShown, stepSide } from "./sides-writes.ts"
import { spacingTokens, zIndexTokens } from "./stand-in-tokens.ts"

const padding = sideRules.padding
const margin = sideRules.margin
const layer = sideRules.layer

describe("what's typed into a side", () => {
  it("works out maths with spaces as one value", () => {
    expect(readSide("16 + 4", "Top padding", padding, { number: 8 }, spacingTokens)).toEqual({ side: { number: 20 } })
    expect(readSide("(24 - 4) / 2", "Top padding", padding, undefined, spacingTokens)).toEqual({
      side: { number: 10 }
    })
    expect(readSide("+ 8", "Top padding", padding, { number: 8 }, spacingTokens)).toEqual({ side: { number: 16 } })
  })

  it("reads values with spaces between them as CSS's shorthand", () => {
    expect(readSide("8 16", "Top padding", padding, undefined, spacingTokens)).toEqual({
      shorthand: [{ number: 8 }, { number: 16 }, { number: 8 }, { number: 16 }]
    })
    expect(readSide("16 -8", "Top margin", margin, undefined, spacingTokens)).toEqual({
      shorthand: [{ number: 16 }, { number: -8 }, { number: 16 }, { number: -8 }]
    })
    expect(readSide("auto 1rem", "Top margin", margin, undefined, spacingTokens)).toEqual({
      shorthand: ["auto", { number: 16 }, "auto", { number: 16 }]
    })
  })

  it("refuses a shorthand part it can't read, naming it", () => {
    const reading = readSide("8 wide", "Top padding", padding, undefined, spacingTokens)
    expect("reason" in reading && reading.reason).toMatch(/^Can't read wide/)
  })
})

describe("what's typed into Layer order", () => {
  it("works from the order already there", () => {
    expect(readSide("+1", "Layer order", layer, { number: 10 }, zIndexTokens)).toEqual({ side: { number: 11 } })
    expect(readSide("*2", "Layer order", layer, { number: 10 }, zIndexTokens)).toEqual({ side: { number: 20 } })
    expect(readSide("(5)", "Layer order", layer, undefined, zIndexTokens)).toEqual({ side: { number: 5 } })
    expect(readSide("-5", "Layer order", layer, { number: 10 }, zIndexTokens)).toEqual({ side: { number: -5 } })
  })

  it("refuses what isn't a whole number in the app's maths", () => {
    for (const text of ["1.5", "1e3", "ten"]) {
      expect(readSide(text, "Layer order", layer, { number: 10 }, zIndexTokens)).toHaveProperty("reason")
    }
  })

  it("reads x as times, as the app's maths does, not as hexadecimal", () => {
    expect(readSide("0x10", "Layer order", layer, { number: 10 }, zIndexTokens)).toEqual({ side: { number: 0 } })
  })
})

describe("stepping a side", () => {
  it("stops a percentage at 0 where the side can't be negative", () => {
    expect(stepSide({ percent: 0 }, padding, false, false, undefined, spacingTokens)).toEqual({ percent: 0 })
    expect(stepSide({ percent: 5 }, padding, false, true, undefined, spacingTokens)).toEqual({ percent: 0 })
  })

  it("steps a percentage below 0 where the side takes negatives", () => {
    expect(stepSide({ percent: 0 }, margin, false, false, undefined, spacingTokens)).toEqual({ percent: -1 })
  })
})

describe("what a side shows", () => {
  it("shows a number, a percentage or a token's value with its unit", () => {
    expect(sideShown({ number: 13.5 }, spacingTokens, "px")).toEqual({ number: "13.5", unit: "px" })
    expect(sideShown({ percent: 10 }, spacingTokens, "px")).toEqual({ number: "10", unit: "%" })
    expect(sideShown({ token: "spacing-gutter" }, spacingTokens, "px")).toMatchObject({ unit: "px" })
    expect(sideShown({ token: "spacing-gone" }, spacingTokens, "px")).toEqual({ number: "spacing-gone" })
    expect(sideShown({ number: 10 }, zIndexTokens, undefined)).toEqual({ number: "10" })
    expect(sideShown("auto", spacingTokens, "px")).toEqual({ number: "Auto" })
  })
})
