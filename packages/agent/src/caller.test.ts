import { describe, expect, it } from "vite-plus/test"
import { callerIdentity } from "./caller.ts"

describe("callerIdentity", () => {
  it("preserves full declared names that share the first 40 characters", () => {
    const prefix = "Harness ".repeat(8)
    expect(callerIdentity(` ${prefix}One `, "session-one")).toEqual({ name: `${prefix}One`, id: "session-one" })
    expect(callerIdentity(`${prefix}Two`, "session-two")).toEqual({ name: `${prefix}Two`, id: "session-two" })
  })
  it("keeps the id bound independently of the name", () => {
    expect(callerIdentity("Agent", "x".repeat(100))).toEqual({ name: "Agent", id: "x".repeat(80) })
    expect(callerIdentity(" Agent ", "  ")).toEqual({ name: "Agent", id: "Agent" })
  })
  it("ignores absent, blank and malformed names", () => {
    expect(callerIdentity(undefined, "id")).toBeUndefined()
    expect(callerIdentity(" ", "id")).toBeUndefined()
    expect(callerIdentity(42, "id")).toBeUndefined()
    expect(callerIdentity("Agent", 42)).toEqual({ name: "Agent", id: "Agent" })
  })
})
