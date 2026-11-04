import { describe, expect, it } from "vite-plus/test"
import { findState } from "./edit.ts"
import { alternativeLimit, closest, CodedError, errorDetails, readErrorDetails } from "./errors.ts"

function thrown(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error("Expected it to throw")
}

describe("coded errors", () => {
  it("defaults retryable to false and keeps the details as plain data", () => {
    const error = new CodedError("No design", { code: "unknown_design", field: "design", alternatives: ["home"] })
    expect(error.message).toBe("No design")
    expect(errorDetails(error)).toEqual({
      code: "unknown_design",
      field: "design",
      alternatives: ["home"],
      retryable: false
    })
    expect(structuredClone(error.details)).toEqual(error.details)
    expect(errorDetails(new Error("plain"))).toBeUndefined()
  })

  it("names every candidate when they fit, and the closest ones first when they don't", () => {
    expect(closest("x", ["b", "a", "b"])).toEqual(["b", "a"])
    const many = Array.from({ length: 40 }, (_, index) => `Item${index}`)
    const picked = closest("button", [...many, "IconButton", "Button"])
    expect(picked).toHaveLength(alternativeLimit)
    expect(picked.slice(0, 2)).toEqual(["IconButton", "Button"])
  })

  it("checks details from another process, dropping what it doesn't know", () => {
    expect(readErrorDetails({ code: "unknown_tab", retryable: true, field: "tab", alternatives: ["a", 3] })).toEqual({
      code: "unknown_tab",
      retryable: true,
      field: "tab",
      alternatives: ["a"]
    })
    expect(readErrorDetails({ code: "made_up" })).toBeUndefined()
    expect(readErrorDetails("unknown_tab")).toBeUndefined()
    expect(readErrorDetails({ code: "conflict", retryable: "yes", field: "" })).toEqual({
      code: "conflict",
      retryable: false
    })
  })

  it("codes an unknown state with the design's states", () => {
    const container = {
      id: "home",
      name: "Home",
      position: { x: 0, y: 0 },
      root: { type: "layout" as const, id: "root", name: "Root", children: [] },
      states: [
        { id: "default", name: "Default" },
        { id: "empty", name: "Empty" }
      ]
    }
    expect(() => findState(container, "loading")).toThrow('No state "loading" in Home. States: default, empty')
    expect(errorDetails(thrown(() => findState(container, "loading")))).toEqual({
      code: "unknown_state",
      retryable: false,
      field: "state",
      alternatives: ["default", "empty"]
    })
  })
})
