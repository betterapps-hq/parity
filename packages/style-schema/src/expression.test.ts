import { describe, expect, it } from "vite-plus/test"
import { evaluateLength, expressionForm } from "./expression.ts"
import { isReadFailure } from "./read.ts"

const basis = { percent: 400, fontSize: 20, viewport: { width: 1000, height: 500 } }
const lengths = { spacing: 4, "container-md": 448 }

/** What an expression comes to, or the code of why it can't. */
function outcome(text: string) {
  const result = evaluateLength(text, basis, lengths)

  return isReadFailure(result) ? result.code : result
}

describe("evaluateLength", () => {
  it("works out units against the basis, and tokens by their pixels", () => {
    expect(outcome("calc(100% - 2rem)")).toBe(368)
    expect(outcome("2em + 10vw - 10vh")).toBe(90)
    expect(outcome("calc(var(--spacing) * 18)")).toBe(72)
    expect(outcome("min(var(--container-md), 50%)")).toBe(200)
    expect(outcome("max(10px, 2rem)")).toBe(32)
    expect(outcome("clamp(100px, 50%, 150px)")).toBe(150)
    expect(outcome("-(4px * 2) / 4")).toBe(-2)
  })

  it("takes a var()'s fallback where the project has no such token", () => {
    expect(outcome("var(--gutter, 12px)")).toBe(12)
  })

  it("says what kind of failure it is", () => {
    expect(outcome("4px ; 2px")).toBe("unreadable")
    expect(outcome("4px 2px")).toBe("unreadable")
    expect(outcome("calc(4px")).toBe("incomplete")
    expect(outcome("4px +")).toBe("incomplete")
    expect(outcome("var(--gutter)")).toBe("unknown-token")
    expect(outcome("round(4px, 2px)")).toBe("unknown-function")
    expect(outcome("clamp(1px, 2px)")).toBe("arguments")
    expect(outcome("calc(1px, 2px)")).toBe("arguments")
    expect(outcome("4px * 2px")).toBe("units")
    expect(outcome("4px / 2px")).toBe("units")
    expect(outcome("4px + 2")).toBe("units")
    expect(outcome("4px / 0")).toBe("divide-by-zero")
  })

  it("gives a reason a field can show", () => {
    expect(evaluateLength("4px * 2px", basis, lengths)).toEqual({
      code: "units",
      reason: "Two lengths can't be multiplied"
    })
  })
})

describe("expressionForm", () => {
  it("stores a lone token, a spacing multiple, a token's alpha and whole pixels in their simplest form", () => {
    expect(expressionForm("var(--container-md)")).toEqual({ token: "container-md" })
    expect(expressionForm("var(--color-primary)")).toEqual({ token: "primary" })
    expect(expressionForm("calc(var(--spacing) * 18)")).toEqual({ step: 18 })
    expect(expressionForm("color-mix(in oklab, var(--color-primary) 40%, transparent)")).toEqual({
      token: "primary",
      alpha: { step: 40 }
    })
    expect(expressionForm("13px")).toEqual({ step: 3.25 })
  })

  it("keeps anything else as written", () => {
    expect(expressionForm(" calc(100% - 2rem) ")).toEqual({ value: "calc(100% - 2rem)" })
    expect(expressionForm("13.5px")).toEqual({ value: "13.5px" })
    expect(expressionForm("var(--spacing)")).toEqual({ value: "var(--spacing)" })
  })
})
