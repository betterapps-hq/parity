import { describe, expect, it } from "vite-plus/test"
import { agentColors, agentPalettes } from "./agent-colors.ts"

describe("agent colors", () => {
  it("gives an agent the same palette while it works, and its preferred one again later", () => {
    const first = agentColors.claim("claude#1", "Claude Code")
    expect(agentColors.claim("claude#1", "Claude Code")).toBe(first)
    agentColors.release("claude#1")
    expect(agentColors.claim("claude#2", "Claude Code")).toBe(first)
    agentColors.release("claude#2")
  })

  it("spreads agents working together round the wheel", () => {
    const first = agentPalettes.indexOf(agentColors.claim("spread#1", "Claude Code"))
    const second = agentPalettes.indexOf(agentColors.claim("spread#2", "Claude Code"))
    const steps = Math.abs(first - second)
    expect(Math.min(steps, agentPalettes.length - steps)).toBe(agentPalettes.length / 2)
    agentColors.release("spread#1")
    agentColors.release("spread#2")
  })

  it("never gives agents working at once the same palette", () => {
    const ids = agentPalettes.map((_, index) => `same#${index}`)
    const claimed = ids.map((id) => agentColors.claim(id, "Claude Code"))
    expect(new Set(claimed).size).toBe(agentPalettes.length)
    for (const id of ids) agentColors.release(id)
  })
})
