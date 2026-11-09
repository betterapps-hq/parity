import { describe, expect, it } from "vite-plus/test"
import { builtOn, checkTokenEdit, type CssSupports, loopProblem, valueProblem } from "./checks.ts"

/**
 * A stand-in for the browser's `CSS.supports`: a color is a hex or `oklch()`, a radius or width a number with a unit, a
 * filter a `blur()` of one; anything else it's asked about it takes.
 */
const supports: CssSupports = (property, value) => {
  if (property === "color") {
    return /^(#[\da-f]{3,8}|oklch\(.+\))$/i.test(value)
  }

  if (property === "border-radius" || property === "width") {
    return /^\d*\.?\d+(px|rem)$/.test(value)
  }

  if (property === "filter") {
    return /^blur\(\d*\.?\d+(px|rem)\)$/.test(value)
  }

  return true
}

const tokens: Record<string, string> = { radius: "0.5rem", primary: "#2563eb", card: "var(--radius)" }
const lookup = (name: string) => tokens[name]

describe("valueProblem", () => {
  it("passes a value of the token's kind, references filled in", () => {
    expect(valueProblem("color", "oklch(0.6 0.2 250)", lookup, supports)).toBeUndefined()
    expect(valueProblem("radius", " var(--radius) ", lookup, supports)).toBeUndefined()
  })

  it("asks for a value when there's none", () => {
    expect(valueProblem("color", "  ", lookup, supports)).toBe("Enter a value.")
  })

  it("refuses a bracket left open, which the browser would close itself", () => {
    expect(valueProblem("radius", "calc(var(--radius) * 2.6", lookup, () => true)).toBe(
      "A bracket isn't closed. Add ) at the end."
    )
  })

  it("refuses a reference to a token there isn't", () => {
    expect(valueProblem("color", "var(--brand)", lookup, () => true)).toBe("There's no token named brand.")
  })

  it("names the kind and gives an example when the browser refuses the value", () => {
    expect(valueProblem("color", "bluish", lookup, supports)).toBe(
      "That isn't a color. Try oklch(0.6 0.2 250) or #2563eb."
    )
    // A radius token made of a color comes to a color, which isn't a radius.
    expect(valueProblem("radius", "var(--primary)", lookup, supports)).toBe("That isn't a radius. Try 0.5rem or 8px.")
  })

  it("checks a blur as the filter it goes in", () => {
    expect(valueProblem("blur", "8px", lookup, supports)).toBeUndefined()
    expect(valueProblem("blur", "soft", lookup, supports)).toBe("That isn't a blur. Try 8px.")
  })

  it("takes any whole value for a kind with no property of its own", () => {
    expect(valueProblem("number", "anything", lookup, () => false)).toBeUndefined()
  })
})

describe("loopProblem", () => {
  const built: Record<string, string[]> = { a: ["b"], b: ["c"], c: [] }
  const references = (name: string) => built[name] ?? []

  it("refuses a token built on itself", () => {
    expect(loopProblem("c", "var(--c)", references)).toBe("c can't be built on itself.")
  })

  it("refuses a value whose tokens lead back to the token", () => {
    expect(loopProblem("c", "calc(var(--a) * 2)", references)).toBe("a is built on c, so this would loop.")
  })

  it("passes a value that doesn't loop", () => {
    expect(loopProblem("a", "var(--c)", references)).toBeUndefined()
  })
})

describe("builtOn", () => {
  it("gives a scale step's base, then each reference, in the theme or else the root", () => {
    const token = { values: { default: "var(--a)", dark: "var(--b)" }, derived: { from: "spacing", factor: 4 } }
    expect(builtOn(token, "dark")).toEqual(["spacing", "b"])
    expect(builtOn(token, "print")).toEqual(["spacing", "a"])
    expect(builtOn(undefined, "default")).toEqual([])
  })
})

describe("checkTokenEdit", () => {
  const edit = {
    name: "radius",
    kind: "radius" as const,
    values: { default: "0.5rem", dark: "0.25rem" },
    lookup: (name: string, theme: string) => (theme === "dark" && name === "radius" ? "0.25rem" : tokens[name]),
    references: (name: string) => (name === "card" ? ["radius"] : []),
    supports
  }

  it("saves only the themes whose value changes, trimmed", () => {
    const checked = checkTokenEdit({ ...edit, drafts: { default: " 0.75rem ", dark: "0.25rem" } })
    expect(checked).toEqual({
      problems: { default: undefined, dark: undefined },
      changes: { default: "0.75rem" },
      valid: true
    })
  })

  it("gives each theme's problem, a loop before the value's kind", () => {
    const checked = checkTokenEdit({ ...edit, drafts: { default: "var(--card)", dark: "round" } })
    expect(checked.problems).toEqual({
      default: "card is built on radius, so this would loop.",
      dark: "That isn't a radius. Try 0.5rem or 8px."
    })
    expect(checked.valid).toBe(false)
  })

  it("changes nothing when nothing is typed", () => {
    expect(checkTokenEdit({ ...edit, drafts: {} })).toEqual({ problems: {}, changes: {}, valid: true })
  })
})
