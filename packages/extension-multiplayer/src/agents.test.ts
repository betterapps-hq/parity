import { describe, expect, it } from "vite-plus/test"
import { localAgentKey, RoomAgents, roomAgentKey } from "./agents.ts"
import { assignColors } from "./people.ts"

describe("RoomAgents", () => {
  it("knows each agent by its copy and id, says when one is new, and forgets those of copies that left", () => {
    const agents = new RoomAgents()
    expect(agents.seen("a", "claude-1")).toBe(true)
    expect(agents.seen("a", "claude-1")).toBe(false)
    expect(agents.seen("b", "claude-1")).toBe(true)
    expect(agents.keys()).toEqual(["a:claude-1", "b:claude-1"])

    agents.keepOnly(["b"])
    expect(agents.keys()).toEqual(["b:claude-1"])

    // Agents the host numbered before this copy saw them at work, so it keeps their numbers if it comes to host.
    agents.numbered("c:codex:2")
    agents.numbered("b:claude-1")
    expect(agents.keys()).toEqual(["b:claude-1", "c:codex:2"])
    agents.keepOnly(["b"])
    expect(agents.keys()).toEqual(["b:claude-1"])
  })

  it("gives an agent the host's number under the key each copy's agent presence claims it under", () => {
    const agents = new RoomAgents()
    agents.seen("a", "claude-1")
    agents.seen("b", "codex-1")
    const numbered = assignColors(agents.keys(), new Map())

    // Copy `a` claims its own agent under the agent's id, and `b`'s under `b:codex-1`, as agent presence does.
    const inA = [...numbered].map(([key, n]) => [localAgentKey(key, "a"), n])
    const inB = [...numbered].map(([key, n]) => [localAgentKey(key, "b"), n])
    expect(inA).toEqual([
      ["claude-1", 0],
      ["b:codex-1", 1]
    ])
    expect(inB).toEqual([
      ["a:claude-1", 0],
      ["codex-1", 1]
    ])
    expect(roomAgentKey("a", "claude-1")).toBe("a:claude-1")
  })
})
