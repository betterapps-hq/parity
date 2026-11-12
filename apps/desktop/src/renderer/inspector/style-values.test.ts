import { describe, expect, it } from "vite-plus/test"
import { leadingToken, lengthToken, sizeTokens, trackingToken, weightTokens } from "./controls/tokens.ts"
import {
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
    expect(sideOf(4, unit)).toEqual({ number: 16 })
    expect(sideOf("container-sm", unit)).toEqual({ token: "container-sm" })
    expect(sideOf(undefined, unit)).toBeUndefined()
  })

  it("writes pixels back as the steps they were, even off the scale", () => {
    expect(lengthOf({ number: 281 }, unit)).toBe(70.25)
    expect(lengthOf({ number: 10 }, 3)).toBe(3.3333)
    expect(lengthOf({ token: "container-sm" }, unit)).toBe("container-sm")
  })

  it("leaves out what the style can't hold, Auto and percentages", () => {
    expect(lengthOf("auto", unit)).toBeUndefined()
    expect(lengthOf({ percent: 50 }, unit)).toBeUndefined()
  })

  it("keeps Fill and Hug, and turns pixels into steps", () => {
    expect(sizeShown(24, unit)).toBe(96)
    expect(sizeShown("fill", unit)).toBe("fill")
    expect(sizeOf(96, unit)).toBe(24)
    expect(sizeOf({ token: "container-md" }, unit)).toBe("container-md")
    expect(sizeOf({ percent: 50 }, unit)).toBeUndefined()
  })
})

describe("padding from the box model", () => {
  it("changes only the sides an edit reached, in the shortest form", () => {
    expect(paddingOf([2, 4], [{ number: 40 }, undefined, undefined, undefined], [0], unit)).toEqual([10, 4, 2, 4])
    expect(paddingOf(2, [{ number: 12 }, { number: 12 }, { number: 12 }, { number: 12 }], [0, 1, 2, 3], unit)).toEqual(
      3
    )
  })

  it("keeps each layer's other sides when several are edited", () => {
    const sides = [undefined, { number: 8 }, undefined, undefined] as const

    expect(paddingOf(4, [...sides], [1], unit)).toEqual([4, 2, 4, 4])
    expect(paddingOf([1, 3], [...sides], [1], unit)).toEqual([1, 2, 1, 3])
  })

  it("unsets padding that was never set when nothing is typed", () => {
    expect(paddingOf(undefined, [undefined, undefined, undefined, undefined], [0], unit)).toBeUndefined()
  })
})

describe("type values the style holds as tokens", () => {
  const radii = [lengthToken("radius", "radius-sm", 4), lengthToken("radius", "radius-lg", 10)]

  it("lands a radius of its own on the nearest token, and Full on the largest", () => {
    expect(radiusOf({ px: 9 }, radii)).toBe("radius-lg")
    expect(radiusOf("radius-sm", radii)).toBe("radius-sm")
    expect(radiusOf({ percent: 50 }, [...radii, lengthToken("radius", "radius-full", 9999)])).toBe("radius-full")
  })

  it("lands a text size of its own on the nearest size token", () => {
    expect(fontSizeOf({ px: 21 }, sizeTokens)).toBe("xl")
    expect(fontSizeOf({ token: "sm" }, sizeTokens)).toBe("sm")
  })

  it("lands line height and letter spacing on the nearest, at the text's size", () => {
    const leading = [leadingToken("leading-tight", 1.25), leadingToken("leading-relaxed", 1.625)]
    const tracking = [trackingToken("tracking-tight", -0.025), trackingToken("tracking-wide", 0.025)]

    expect(leadingOf({ px: 26 }, leading, 16)).toBe("leading-relaxed")
    expect(leadingOf({ multiple: 1.2 }, leading, 16)).toBe("leading-tight")
    expect(leadingOf({ keyword: "normal" }, leading, 16)).toBeUndefined()
    expect(trackingOf({ px: 0.5 }, tracking, 16)).toBe("tracking-wide")
  })

  it("writes a weight as its number", () => {
    expect(weightOf({ value: 600 }, weightTokens)).toBe(600)
    expect(weightOf({ token: "bold" }, weightTokens)).toBe(700)
  })

  it("takes a keyword only when the style takes it", () => {
    expect(optionOf({ option: "dashed" }, ["solid", "dashed", "dotted"])).toBe("dashed")
    expect(optionOf({ option: "double" }, ["solid", "dashed", "dotted"])).toBeUndefined()
    expect(optionOf({ custom: "groove" }, ["solid", "dashed", "dotted"])).toBeUndefined()
  })
})
