import { describe, expect, it } from "vite-plus/test"
import { numberTakes, readNumberText, settleNumber, stepNumber } from "./number-rules.ts"

const weight = {
  label: "Weight number",
  called: "Weight",
  whole: true,
  min: 1,
  max: 1000,
  past: "refuse",
  required: true,
  step: 10
} as const

const opacity = { label: "Opacity", min: 0, max: 100, places: 2, unit: "%" } as const
const keys = { shift: false, alt: false }

describe("what a number field takes, from its rules", () => {
  it("says it in one form, with its range and what else it takes", () => {
    expect(numberTakes(weight)).toBe("Weight takes a whole number from 1 to 1000")
    expect(numberTakes({ label: "Steps", whole: true, min: 1 })).toBe("Steps takes a whole number from 1")
    expect(numberTakes({ label: "End handle y" })).toBe("End handle y takes a number")
    expect(numberTakes({ label: "Column count", whole: true, min: 1, max: 12, alsoTakes: "Fit" })).toBe(
      "Column count takes a whole number from 1 to 12, or Fit"
    )
  })

  it("reads the app's maths from the value there, and its unit after a number", () => {
    expect(readNumberText("+10", opacity, 50)).toEqual({ value: 60 })
    expect(readNumberText("50 %", opacity, 100)).toEqual({ value: 50 })
    expect(readNumberText("33.3333", opacity, 0)).toEqual({ value: 33.33 })
    expect(readNumberText("−4", { label: "X" }, 0)).toEqual({ value: -4 })
  })

  it("stops a number past either end, or refuses it where the rules say", () => {
    expect(readNumberText("140", opacity, 0)).toEqual({ value: 100 })
    expect(readNumberText("1200", weight, 400)).toEqual({ reason: "Weight takes a whole number from 1 to 1000" })
    expect(readNumberText("399.6", weight, 400)).toEqual({ value: 400 })
  })

  it("unsets on an empty field, or refuses one it needs", () => {
    expect(readNumberText("", opacity, 50)).toEqual({ value: undefined })
    expect(readNumberText(" ", weight, 400)).toEqual({ reason: "Weight takes a whole number from 1 to 1000" })
  })

  it("reads its words first, without case", () => {
    const x = { label: "X", words: { left: 0, right: 100, auto: undefined } }

    expect(readNumberText("Right", x, 50)).toEqual({ value: 100 })
    expect(readNumberText("auto", x, 50)).toEqual({ value: undefined })
  })

  it("keeps the reason for text it can't read", () => {
    expect(readNumberText("abc", weight, 400)).toEqual({ reason: `"abc" isn't a valid number` })
  })

  it("steps by its own steps, held to its range", () => {
    expect(stepNumber(400, true, keys, weight)).toBe(410)
    expect(stepNumber(400, true, { shift: true, alt: false }, weight)).toBe(500)
    expect(stepNumber(995, true, keys, weight)).toBe(1000)
    expect(stepNumber(50, false, { shift: false, alt: true }, { ...opacity, altStep: 0.25 })).toBe(49.75)
    expect(settleNumber(0.123456, { label: "Y" })).toBe(0.123)
  })
})
