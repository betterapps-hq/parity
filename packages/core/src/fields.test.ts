import { describe, expect, it } from "vite-plus/test"
import {
  applyFieldInput,
  describeFieldNote,
  type FieldRules,
  formatFieldValue,
  readFieldInput,
  scrubSteps,
  stepFieldValue,
  summarizeFieldNotes
} from "./fields.ts"

const length: FieldRules = { kind: "length", unit: 4, min: 0, label: "Width" }
const inset: FieldRules = { kind: "length", unit: 4, label: "Top" }
const opacity: FieldRules = { kind: "percent", min: 0, max: 100, label: "Opacity" }
const count: FieldRules = { kind: "count", min: 1, label: "Columns" }
const number: FieldRules = { kind: "number" }

/** What typing `text` into a field holding `current` gives, as the field stores it. */
function typed(text: string, rules: FieldRules, current?: number, tokens: string[] = []) {
  return applyFieldInput(readFieldInput(text, rules, tokens), current, rules)
}

function value(text: string, rules: FieldRules, current?: number) {
  const outcome = typed(text, rules, current)
  if (!outcome.ok) throw new Error(outcome.reason)
  return outcome.value
}

function reason(text: string, rules: FieldRules, current?: number) {
  const outcome = typed(text, rules, current)
  return outcome.ok ? undefined : outcome.reason
}

describe("lengths", () => {
  it("reads a plain number as pixels, so 320 in Width is 320px", () => {
    expect(value("320", length, 8)).toBe(80)
    expect(formatFieldValue(80, length)).toBe("320")
  })

  it("reads px, rem and spacing step names", () => {
    expect(value("16px", length)).toBe(4)
    expect(value("16 PX", length)).toBe(4)
    expect(value("1.5rem", length)).toBe(6)
    expect(value("spacing-4", length)).toBe(4)
    expect(value("--spacing-0.5", length)).toBe(0.5)
  })

  it("takes a length token by name, with or without its dashes", () => {
    expect(typed("container-sm", length, undefined, ["container-sm"])).toEqual({ ok: true, value: "container-sm" })
    expect(typed("--container-sm", length, undefined, ["container-sm"])).toEqual({ ok: true, value: "container-sm" })
  })

  it("does maths with units, in pixels", () => {
    expect(value("16+8", length)).toBe(6)
    expect(value("2rem - 8px", length)).toBe(6)
    expect(value("(10 + 6) * 2", length)).toBe(8)
    expect(value("100/4", length)).toBe(6.5)
    expect(value("3×8", length)).toBe(6)
    expect(value("48 ÷ 2", length)).toBe(6)
  })

  it("takes a percentage of the value there, as Figma's dimension fields do", () => {
    expect(value("50%", length, 80)).toBe(40)
    expect(value("100 + 50%", length, 8)).toBe(29)
    expect(reason("50%", length)).toBe("There's no value here to take 50% of")
  })

  it("works from the value there after a leading +, * or /", () => {
    expect(value("+8", length, 4)).toBe(6)
    expect(value("*2", length, 4)).toBe(8)
    expect(value("/2", length, 4)).toBe(2)
    expect(reason("+8", length)).toBe("There's no value here to work from")
  })

  it("reads a leading minus as a negative number, which an inset can be", () => {
    expect(value("-8", inset, 4)).toBe(-2)
    expect(readFieldInput("-8", inset)).toMatchObject({ relative: false })
  })

  it("reads Mixed as each layer's own value", () => {
    const input = readFieldInput("Mixed+8", length)
    expect(input).toMatchObject({ type: "maths", relative: true })
    expect(applyFieldInput(input, 4, length)).toEqual({ ok: true, value: 6 })
    expect(applyFieldInput(input, 10, length)).toEqual({ ok: true, value: 12 })
    expect(value("mixed * 2", length, 3)).toBe(6)
  })

  it("is absolute when nothing in it works from the value there", () => {
    expect(readFieldInput("16+8", length)).toMatchObject({ relative: false })
    expect(readFieldInput("50%", length)).toMatchObject({ relative: true })
  })

  it("lands off-scale lengths on the nearest half step and says so", () => {
    expect(typed("281", length, 8)).toEqual({ ok: true, value: 70.5, note: { kind: "snapped", from: 281, to: 282 } })
    // Half steps are on it: 30px is 7.5 steps.
    expect(typed("30", length)).toEqual({ ok: true, value: 7.5 })
    expect(typed("29.2", length)).toMatchObject({ value: 7.5, note: { kind: "snapped", to: 30 } })
    expect(describeFieldNote({ kind: "snapped", from: 281, to: 282 }, length)).toBe(
      "Snapped to 282px, the nearest step on the spacing scale"
    )
  })

  it("keeps lengths that can't be negative at 0, and says so", () => {
    expect(typed("-10", length)).toEqual({ ok: true, value: 0, note: { kind: "clamped", to: 0, bound: "min" } })
    expect(describeFieldNote({ kind: "clamped", to: 0, bound: "min" }, length)).toBe("Kept at 0px: it can't go lower")
  })

  it("follows the project's spacing unit", () => {
    const mui: FieldRules = { kind: "length", unit: 8, min: 0 }
    expect(value("320", mui)).toBe(40)
    expect(formatFieldValue(40, mui)).toBe("320")
    expect(typed("20", mui)).toMatchObject({ value: 2.5 })
    expect(typed("22", mui)).toMatchObject({ value: 3, note: { kind: "snapped", to: 24 } })
  })

  it("clears on empty input, and shows a token by name", () => {
    expect(typed("   ", length)).toEqual({ ok: true, value: undefined })
    expect(formatFieldValue(undefined, length)).toBe("")
    expect(formatFieldValue("container-sm", length)).toBe("container-sm")
    expect(formatFieldValue(7.3, length)).toBe("29.2")
  })
})

describe("percentages", () => {
  it("reads 50-10 in Opacity as 40", () => {
    expect(value("50-10", opacity, 80)).toBe(40)
  })

  it("reads % as its own unit", () => {
    expect(value("50%", opacity, 80)).toBe(50)
    expect(readFieldInput("50%", opacity)).toMatchObject({ relative: false })
    expect(value("Mixed - 10%", opacity, 80)).toBe(70)
  })

  it("keeps opacity within 0 and 100, and says so", () => {
    expect(typed("150", opacity)).toEqual({ ok: true, value: 100, note: { kind: "clamped", to: 100, bound: "max" } })
    expect(describeFieldNote({ kind: "clamped", to: 100, bound: "max" }, opacity)).toBe(
      "Kept at 100%: it can't go higher"
    )
  })

  it("won't take a length", () => {
    expect(reason("16px", opacity)).toBe("Opacity takes a percentage, not px")
  })
})

describe("counts and numbers", () => {
  it("rounds a count to a whole number, and says so", () => {
    expect(typed("2.4", count)).toEqual({ ok: true, value: 2, note: { kind: "rounded", to: 2 } })
    expect(describeFieldNote({ kind: "rounded", to: 2 }, count)).toBe("Rounded to 2: it takes whole numbers")
    expect(typed("0", count)).toMatchObject({ value: 1, note: { kind: "clamped", to: 1, bound: "min" } })
  })

  it("takes a percentage of the value there", () => {
    expect(value("50%", count, 4)).toBe(2)
    expect(value("150%", number, 10)).toBe(15)
  })

  it("won't take px or rem", () => {
    expect(reason("3px", count)).toBe("Columns takes a whole number, not px")
    expect(reason("1rem", number)).toBe("This field takes a number, not rem")
  })

  it("keeps any number as typed", () => {
    expect(value("-2.5", number)).toBe(-2.5)
    expect(formatFieldValue(1 / 3, number)).toBe("0.33")
  })
})

describe("input it can't read", () => {
  it.each([
    ["abc", length, `Can't read "abc": type a number, px, rem or %`],
    ["abc", opacity, `Can't read "abc": type a number or %`],
    ["16em", length, `"em" isn't a unit Width takes: type a number, px, rem or %`],
    ["16+", length, `Something's missing after "+"`],
    ["16++", length, `Something's missing after "+"`],
    ["*", length, `Something's missing after "*"`],
    ["(16+8", length, "A bracket isn't closed"],
    ["16+8)", length, `A ")" has no "(" before it`],
    ["()", length, "The brackets are empty"],
    ["16 4", length, "Put an operator between 16 and 4"],
    ["16/0", length, "Can't divide by zero"],
    ["%", length, "A % needs a number before it, as in 50%"],
    ["1,000", length, `Can't read ",": type a number, px, rem or %`],
    ["16#", length, `Can't read "#": type a number, px, rem or %`]
  ])("%s says why", (text, rules, expected) => {
    expect(reason(text, rules, 4)).toBe(expected)
  })

  it("is unreadable before it's worked out", () => {
    expect(readFieldInput("abc", length)).toEqual({
      type: "unreadable",
      reason: `Can't read "abc": type a number, px, rem or %`
    })
  })
})

describe("stepping", () => {
  it("moves a length one step of the spacing scale, ten with Shift", () => {
    expect(stepFieldValue(4, 1, length)).toBe(5)
    expect(stepFieldValue(4, -1, length)).toBe(3)
    expect(stepFieldValue(4, 10, length)).toBe(14)
    expect(stepFieldValue(0, -1, length)).toBe(0)
  })

  it("moves a half step to the whole step beside it", () => {
    expect(stepFieldValue(4.5, 1, length)).toBe(5)
    expect(stepFieldValue(4.5, -1, length)).toBe(4)
    expect(stepFieldValue(7.3, 1, length)).toBe(8)
  })

  it("lets an inset go negative", () => {
    expect(stepFieldValue(0, -1, inset)).toBe(-1)
  })

  it("moves a plain number by 1, ten with Shift, within its limits", () => {
    expect(stepFieldValue(50, 1, opacity)).toBe(51)
    expect(stepFieldValue(95, 10, opacity)).toBe(100)
    expect(stepFieldValue(2, -10, count)).toBe(1)
    expect(stepFieldValue(2.5, 1, number)).toBe(3.5)
  })

  it("scrubs a step for every two pixels dragged, ten with Shift", () => {
    expect(scrubSteps(0, false)).toBe(0)
    expect(scrubSteps(1, false)).toBe(0)
    expect(scrubSteps(9, false)).toBe(4)
    expect(scrubSteps(-9, false)).toBe(-4)
    expect(scrubSteps(4, true)).toBe(20)
    expect(Object.is(scrubSteps(-1, false), -0)).toBe(false)
  })
})

describe("notes across layers", () => {
  it("says one note once, and sums up different ones", () => {
    const snapped = { kind: "snapped", from: 281, to: 282 } as const
    expect(summarizeFieldNotes([], length)).toBeUndefined()
    expect(summarizeFieldNotes([snapped, snapped], length)).toBe(
      "Snapped to 282px, the nearest step on the spacing scale"
    )
    expect(summarizeFieldNotes([snapped, { kind: "snapped", from: 30, to: 32 }], length)).toBe(
      "Some layers snapped to the nearest step on the spacing scale"
    )
    expect(summarizeFieldNotes([snapped, { kind: "clamped", to: 0, bound: "min" }], length)).toBe(
      "Some layers snapped to the nearest step on the spacing scale, kept within what they can be"
    )
  })
})
