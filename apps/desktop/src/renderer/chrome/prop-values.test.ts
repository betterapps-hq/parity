import { describe, expect, it } from "vite-plus/test"
import { readValue, showValue, valueKind } from "./prop-values.ts"

describe("prop and param values", () => {
  it("are edited as what they're declared to take, before they have a value", () => {
    expect(valueKind(undefined, "number")).toBe("number")
    expect(valueKind(undefined, "boolean")).toBe("boolean")
    expect(valueKind(undefined, "text")).toBe("text")
    expect(valueKind(undefined, "value")).toBe("any")
    expect(valueKind(undefined, "object")).toBe("json")
    expect(valueKind(undefined, "unknown")).toBe("any")
  })

  it("keep their own type when nothing is declared", () => {
    expect(valueKind(3)).toBe("number")
    expect(valueKind(true)).toBe("boolean")
    expect(valueKind("Ada")).toBe("text")
    expect(valueKind({ id: 1 })).toBe("json")
    expect(valueKind(["a"], "unknown")).toBe("json")
  })

  it("refuse JSON that doesn't parse, rather than turning it into a string", () => {
    expect(readValue('{"id": 1}', "json")).toEqual({ value: { id: 1 } })
    expect(readValue("{id: 1}", "json")).toEqual({ error: expect.stringMatching(/JSON/) })
    expect(readValue("", "json")).toEqual({ value: undefined })
  })

  it("read any value as JSON when it is, and as text when it isn't", () => {
    expect(readValue("3", "any")).toEqual({ value: 3 })
    expect(readValue("true", "any")).toEqual({ value: true })
    expect(readValue("Ada", "any")).toEqual({ value: "Ada" })
    expect(showValue("Ada", "any")).toBe("Ada")
    expect(showValue("Ada", "json")).toBe('"Ada"')
    expect(showValue([1, 2], "any")).toBe("[1,2]")
  })
})
