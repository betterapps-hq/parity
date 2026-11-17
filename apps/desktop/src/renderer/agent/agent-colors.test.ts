import { describe, expect, it } from "vite-plus/test"
import { agentColors, agentPalettes } from "./agent-colors.ts"

describe("agent colors", () => {
  it("gives an agent the same palette while it works", () => {
    const first = agentColors.claim("claude#1")
    expect(agentColors.claim("claude#1")).toEqual(first)
    agentColors.release("claude#1")
  })

  it("never gives agents working at once the same palette, and never runs out", () => {
    const ids = Array.from({ length: agentPalettes.length * 2 }, (_, index) => `same#${index}`)
    const claimed = ids.map((id) => agentColors.claim(id))
    expect(new Set(claimed.map((each) => each.color)).size).toBe(ids.length)
    expect(claimed.slice(0, agentPalettes.length).map((each) => each.name)).toEqual(
      agentPalettes.map((each) => each.name)
    )

    for (const id of ids) {
      agentColors.release(id)
    }
  })
})
