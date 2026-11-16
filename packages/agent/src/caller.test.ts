import { describe, expect, it } from "vite-plus/test"
import { callerIdentity, presenceIdentity } from "./caller.ts"

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
  it("keeps the subagent a call names, on one line and 40 characters at most, apart from the session's name and id", () => {
    expect(callerIdentity({ agent: "Claude", agentId: "s", subagent: " Header\n  pass " })).toEqual({
      name: "Claude",
      id: "s",
      subagent: "Header pass"
    })
    expect(callerIdentity({ agent: "Claude", agentId: "s", subagent: "x".repeat(39) + " tail" })?.subagent).toBe(
      "x".repeat(39)
    )
    expect(callerIdentity({ agent: "Claude", agentId: "s", subagent: " " })).toEqual({ name: "Claude", id: "s" })
    expect(callerIdentity({ agent: "Claude", agentId: "s", subagent: 3 })).toEqual({ name: "Claude", id: "s" })
    expect(callerIdentity({ subagent: "Header" })).toBeUndefined()
  })
})

describe("presenceIdentity", () => {
  it("is the session's name and id for a caller that names no subagent", () => {
    expect(presenceIdentity({ name: "Claude Code", id: "Claude Code#1a2b3c4d" })).toEqual({
      agent: "Claude Code",
      agentId: "Claude Code#1a2b3c4d"
    })
  })
  it("gives each of a session's subagents a cursor of its own, named for it first", () => {
    const session = { name: "Claude Code", id: "Claude Code#1a2b3c4d" }
    const shown = ["Header", "Pricing", "Footer"].map((subagent) => presenceIdentity({ ...session, subagent }))
    expect(shown).toEqual([
      { agent: "Header (Claude Code)", agentId: "Claude Code#1a2b3c4d/Header" },
      { agent: "Pricing (Claude Code)", agentId: "Claude Code#1a2b3c4d/Pricing" },
      { agent: "Footer (Claude Code)", agentId: "Claude Code#1a2b3c4d/Footer" }
    ])
    // The same subagent keeps its cursor from call to call, and another session's subagent of the same name has its own.
    expect(presenceIdentity({ ...session, subagent: "Header" })).toEqual(shown[0])
    expect(presenceIdentity({ name: "Claude Code", id: "Claude Code#99999999", subagent: "Header" }).agentId).not.toBe(
      shown[0]?.agentId
    )
  })
})
