import { describe, expect, it } from "vite-plus/test"
import { createColors } from "./colors.ts"
import { agentPalette, tunedAgentPalettes } from "./palettes.ts"

const agents = (onGenerated?: (n: number, keys: number) => void) =>
  createColors({ palette: agentPalette, tuned: tunedAgentPalettes.length, onGenerated })

describe("colors by key", () => {
  it("gives each key the lowest free number and keeps it while claimed", () => {
    const colors = agents()
    expect(colors.claim("a").n).toBe(0)
    expect(colors.claim("b").n).toBe(1)
    expect(colors.claim("a").n).toBe(0)
    colors.release("a")
    expect(colors.claim("c").n).toBe(0)
  })

  it("never runs out: past the hand-tuned palettes it generates more, and says so once per number", () => {
    const generated: [number, number][] = []
    const colors = agents((n, keys) => generated.push([n, keys]))
    const claimed = Array.from({ length: 40 }, (_, index) => colors.claim(`agent#${index}`))
    expect(new Set(claimed.map((each) => each.n)).size).toBe(40)
    expect(claimed[39]!.n).toBe(39)
    expect(generated.map(([n]) => n)).toEqual(Array.from({ length: 28 }, (_, index) => index + 12))
    expect(generated[0]).toEqual([12, 13])
    colors.release("agent#20")
    colors.claim("again")
    expect(generated).toHaveLength(28)
  })

  it("keeps a key while any owner claims it, and gives back an owner's claims together", () => {
    const colors = agents()
    colors.claim("mia", "multiplayer")
    colors.claim("mia", "agents")
    colors.claim("bot", "agents")
    expect(colors.claims("agents")).toBe(2)
    colors.releaseAll("agents")
    expect(colors.claims("agents")).toBe(0)
    expect(colors.size).toBe(1)
    colors.release("mia", "multiplayer")
    expect(colors.size).toBe(0)
  })

  it("lets the room's numbers win, moving a claim off a number the room gave someone else", () => {
    const colors = agents()
    expect(colors.claim("local").n).toBe(0)
    colors.assign("mia", 0)
    expect(colors.claim("mia").n).toBe(0)
    expect(colors.claim("local").n).toBe(1)
    expect(colors.claim("next").n).toBe(2)
    colors.assign("next", 30)
    expect(colors.claim("next").n).toBe(30)
    colors.unassign("mia")
    colors.release("mia")
    expect(colors.claim("other").n).toBe(0)
  })

  it("counts keys the room assigned but nobody here claims as holding a color", () => {
    const generated: [number, number][] = []
    const colors = agents((n, keys) => generated.push([n, keys]))
    colors.assign("mia", 20)
    expect(colors.size).toBe(1)
    expect(generated).toEqual([[20, 1]])
    colors.claim("mia")
    expect(colors.size).toBe(1)
    colors.release("mia")
    expect(colors.size).toBe(1)
    colors.unassign("mia")
    expect(colors.size).toBe(0)
  })

  it("refuses a number that isn't a palette's", () => {
    expect(() => agents().assign("mia", -1)).toThrow(RangeError)
  })
})
