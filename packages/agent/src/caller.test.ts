import { describe, expect, it } from "vite-plus/test"
import { callerIdentity } from "./caller.ts"

describe("callerIdentity", () => {
  it("preserves full declared names that share the first 40 characters", () => {
    const prefix = "Harness ".repeat(8)
    expect(callerIdentity({ agent: ` ${prefix}One `, agentId: "session-one" })).toEqual({
      name: `${prefix}One`,
      id: "session-one"
    })
    expect(callerIdentity({ agent: `${prefix}Two`, agentId: "session-two" })).toEqual({
      name: `${prefix}Two`,
      id: "session-two"
    })
  })
  it("keeps the id bound independently of the name", () => {
    expect(callerIdentity({ agent: "Agent", agentId: "x".repeat(100) })).toEqual({ name: "Agent", id: "x".repeat(80) })
    const first = "Harness ".repeat(16) + "One"
    const second = "Harness ".repeat(16) + "Two"
    expect(callerIdentity({ agent: first })).toEqual({ name: first, id: first })
    expect(callerIdentity({ agent: second })).toEqual({ name: second, id: second })
    expect(callerIdentity({ agent: " Agent ", agentId: "  " })).toEqual({ name: "Agent", id: "Agent" })
  })
  it("ignores absent, blank and malformed names", () => {
    expect(callerIdentity({ agentId: "id" })).toBeUndefined()
    expect(callerIdentity({ agent: " ", agentId: "id" })).toBeUndefined()
    expect(callerIdentity({ agent: 42, agentId: "id" })).toBeUndefined()
    expect(callerIdentity({ agent: "Agent", agentId: 42 })).toEqual({ name: "Agent", id: "Agent" })
  })
  it("keeps the client an agent calls through, when it names one", () => {
    expect(callerIdentity({ agent: "Claude", agentId: "s", client: " claude-code " })).toEqual({
      name: "Claude",
      id: "s",
      client: "claude-code"
    })
    expect(callerIdentity({ agent: "Claude", agentId: "s", client: " " })).toEqual({ name: "Claude", id: "s" })
    expect(callerIdentity({ agent: "Claude", agentId: "s", client: 42 })).toEqual({ name: "Claude", id: "s" })
  })
})
