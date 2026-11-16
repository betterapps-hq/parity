import type { Padding } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { sizeTokens } from "./controls/stand-in-tokens.ts"
import { leadingToken, lengthToken, trackingToken } from "./controls/tokens.ts"
import {
  eachLength,
  eachSideOf,
  fontSizeOf,
  leadingOf,
  lengthOf,
  optionOf,
  paddingOf,
  radiusOf,
  sideOf,
  sizeOf,
  sizeShown,
  trackingOf,
  weightOf
} from "./style-values.ts"

const unit = 4

describe("lengths between the style's steps and the controls' pixels", () => {
  it("shows steps as pixels and tokens by name", () => {
    expect(sideOf({ step: 4 }, unit)).toEqual({ number: 16 })
    expect(sideOf({ token: "container-sm" }, unit)).toEqual({ token: "container-sm" })
    expect(sideOf(undefined, unit)).toBeUndefined()
  })

  it("writes pixels back as the steps they were, even off the scale", () => {
    expect(lengthOf({ number: 281 }, unit)).toEqual({ step: 70.25 })
    expect(lengthOf({ number: 10 }, 3)).toEqual({ step: 3.3333 })
    expect(lengthOf({ token: "container-sm" }, unit)).toEqual({ token: "container-sm" })
  })

  it("writes Auto and percentages out, and reads them back", () => {
    expect(lengthOf("auto", unit)).toEqual({ keyword: "auto" })
    expect(lengthOf({ percent: 50 }, unit)).toEqual({ value: "50%" })
    expect(sideOf({ keyword: "auto" }, unit)).toBe("auto")
    expect(sideOf({ value: "50%" }, unit)).toEqual({ percent: 50 })
    expect(sideOf({ expr: "clamp(1rem, 2vw, 2rem)" }, unit)).toBeUndefined()
  })

  it("keeps Fill and Hug, and turns pixels into steps", () => {
    expect(sizeShown({ step: 24 }, unit)).toBe(96)
    expect(sizeShown({ size: "fill" }, unit)).toBe("fill")
    expect(sizeShown({ value: "50%" }, unit)).toEqual({ percent: 50 })
    expect(sizeOf(96, unit)).toBe(24)
    expect(sizeOf({ token: "container-md" }, unit)).toBe("container-md")
    expect(sizeOf({ percent: 50 }, unit)).toBeUndefined()
  })
})

describe("padding from the box model", () => {
  it("changes only the sides an edit reached, in the shortest form", () => {
    expect(paddingOf([{ step: 2 }, { step: 4 }], [{ number: 40 }, undefined, undefined, undefined], [0], unit)).toEqual(
      [{ step: 10 }, { step: 4 }, { step: 2 }, { step: 4 }]
    )
    expect(
      paddingOf({ step: 2 }, [{ number: 12 }, { number: 12 }, { number: 12 }, { number: 12 }], [0, 1, 2, 3], unit)
    ).toEqual({ step: 3 })
  })

  it("keeps each layer's other sides when several are edited", () => {
    const sides = [undefined, { number: 8 }, undefined, undefined] as const

    expect(paddingOf({ step: 4 }, [...sides], [1], unit)).toEqual([{ step: 4 }, { step: 2 }, { step: 4 }, { step: 4 }])
    expect(paddingOf([{ step: 1 }, { step: 3 }], [...sides], [1], unit)).toEqual([
      { step: 1 },
      { step: 2 },
      { step: 1 },
      { step: 3 }
    ])
  })

  it("unsets padding that was never set when nothing is typed", () => {
    expect(paddingOf(undefined, [undefined, undefined, undefined, undefined], [0], unit)).toBeUndefined()
  })
})

describe("an edit worked out from each layer's own length, as Mixed+8 is", () => {
  const spacing = [lengthToken("spacing", "spacing-lg", 24)]
  const add8 = (px: number) => px + 8

  const steps = (top: number, right: number, bottom: number, left: number): Padding => [
    { step: top },
    { step: right },
    { step: bottom },
    { step: left }
  ]

  it("works from a length's pixels, or its token's, and gives steps back", () => {
    expect(eachLength({ step: 10 }, add8, unit, spacing)).toEqual({ step: 12 })
    expect(eachLength({ token: "spacing-lg" }, add8, unit, spacing)).toEqual({ step: 8 })
  })

  it("leaves what has no pixels to work from, and holds the rest at the least it takes", () => {
    expect(eachLength({ size: "fill" }, add8, unit, spacing)).toBeUndefined()
    expect(eachLength({ size: "hug" }, add8, unit, spacing)).toBeUndefined()
    expect(eachLength({ value: "50%" }, add8, unit, spacing)).toBeUndefined()
    expect(eachLength(undefined, add8, unit, spacing)).toBeUndefined()
    expect(eachLength({ step: 1 }, (px) => px - 20, unit, spacing)).toEqual({ step: 0 })
    expect(eachLength({ step: 1 }, (px) => px - 20, unit, spacing, 1)).toEqual({ step: 0.25 })
  })

  it("changes only the sides reached, counting an unset side as 0", () => {
    expect(eachSideOf(steps(2, 4, 2, 4), [1], add8, unit, spacing)).toEqual(steps(2, 6, 2, 4))
    expect(eachSideOf(steps(2, 4, 2, 4), [1, 3], add8, unit, spacing)).toEqual([{ step: 2 }, { step: 6 }])
    expect(eachSideOf(undefined, [0], add8, unit, spacing)).toEqual(steps(2, 0, 0, 0))
  })

  it("takes a margin below 0, and keeps padding at 0", () => {
    const less = (px: number) => px - 16

    expect(eachSideOf(steps(-1, 0, 0, 0), [0], less, unit, spacing, -Infinity)).toEqual(steps(-5, 0, 0, 0))
    expect(eachSideOf(steps(1, 0, 0, 0), [0], less, unit, spacing)).toEqual({ step: 0 })
  })
})

describe("type values the fields write as tokens", () => {
  const radii = [lengthToken("radius", "radius-sm", 4), lengthToken("radius", "radius-lg", 10)]

  it("lands a radius of its own on the nearest token, and Full on the largest", () => {
    expect(radiusOf({ px: 9 }, radii)).toEqual({ token: "radius-lg" })
    expect(radiusOf("radius-sm", radii)).toEqual({ token: "radius-sm" })
    expect(radiusOf({ percent: 50 }, [...radii, lengthToken("radius", "radius-full", 9999)])).toEqual({
      token: "radius-full"
    })
  })

  it("lands a text size of its own on the nearest size token", () => {
    expect(fontSizeOf({ px: 21 }, sizeTokens)).toEqual({ token: "xl" })
    expect(fontSizeOf({ token: "sm" }, sizeTokens)).toEqual({ token: "sm" })
  })

  it("lands line height and letter spacing on the nearest, at the text's size", () => {
    const leading = [leadingToken("leading-tight", 1.25), leadingToken("leading-relaxed", 1.625)]
    const tracking = [trackingToken("tracking-tight", -0.025), trackingToken("tracking-wide", 0.025)]

    expect(leadingOf({ px: 26 }, leading, 16)).toEqual({ token: "leading-relaxed" })
    expect(leadingOf({ multiple: 1.2 }, leading, 16)).toEqual({ token: "leading-tight" })
    expect(leadingOf({ keyword: "normal" }, leading, 16)).toBeUndefined()
    expect(trackingOf({ px: 0.5 }, tracking, 16)).toEqual({ token: "tracking-wide" })
  })

  it("writes a weight as its number, or as its token", () => {
    expect(weightOf({ value: 600 })).toEqual({ value: 600 })
    expect(weightOf({ token: "bold" })).toEqual({ token: "bold" })
  })

  it("takes a keyword only when the style takes it", () => {
    expect(optionOf({ option: "dashed" }, ["solid", "dashed", "dotted"])).toBe("dashed")
    expect(optionOf({ option: "double" }, ["solid", "dashed", "dotted"])).toBeUndefined()
    expect(optionOf({ custom: "groove" }, ["solid", "dashed", "dotted"])).toBeUndefined()
  })
})
