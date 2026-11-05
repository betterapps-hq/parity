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
    // A typo shares no text with what was meant, so it comes next by edit distance, ahead of the rest.
    expect(closest("dashbord", [...many, "dashboard"])[0]).toBe("dashboard")
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
    expect(() => findState(container, "loading")).toThrow(
      'No state with id "loading" in Home. Calls take a state\'s id, as Designs() lists it. ' +
        "States: default (Default), empty (Empty)"
    )
    expect(errorDetails(thrown(() => findState(container, "loading")))).toEqual({
      code: "unknown_state",
      retryable: false,
      field: "state",
      alternatives: ["default", "empty"]
    })
  })

  describe("a state named instead of given by id", () => {
    const container = {
      id: "home",
      name: "Home",
      position: { x: 0, y: 0 },
      root: { type: "layout" as const, id: "root", name: "Root", children: [] },
      states: [
        { id: "default", name: "Default" },
        // Renamed after it was added, so its id and name have diverged.
        { id: "empty", name: "No results" },
        { id: "busy", name: "Loading" },
        { id: "busy-2", name: "Loading" }
      ]
    }

    it("points a name to its id, ignoring case and spaces at the ends", () => {
      const error = thrown(() => findState(container, " no RESULTS"))
      expect(error).toHaveProperty("message", expect.stringContaining('" no RESULTS" is the name of state "empty"'))
      expect(errorDetails(error)?.alternatives).toEqual(["empty", "default", "busy", "busy-2"])
    })

    it("lists every state a repeated name matches without choosing one", () => {
      const error = thrown(() => findState(container, "Loading"))
      expect(error).toHaveProperty(
        "message",
        expect.stringContaining('"Loading" names 2 states, "busy" and "busy-2"; use the id of the one you mean.')
      )
      expect(errorDetails(error)?.alternatives?.slice(0, 2)).toEqual(["busy", "busy-2"])
    })

    it("finds nothing by a name a state no longer has, and still lists the ids", () => {
      const error = thrown(() => findState(container, "Empty"))
      expect(error).toHaveProperty("message", expect.not.stringContaining("is the name of"))
      expect(error).toHaveProperty("message", expect.stringContaining("empty (No results)"))
    })
  })
})
