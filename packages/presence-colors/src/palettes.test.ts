import { colorDistance, parseHex, rgbaToOklch } from "@parity-app/tokens"
import { describe, expect, it } from "vite-plus/test"
import {
  agentPalette,
  badgeContrast,
  inkContrast,
  palette,
  type Palette,
  tunedAgentPalettes,
  tunedClearance
} from "./palettes.ts"

const people = (count: number) => Array.from({ length: count }, (_, index) => palette(index))
const agents = (count: number) => Array.from({ length: count }, (_, index) => agentPalette(index))

const distance = (a: string, b: string) => colorDistance(parseHex(a)!, parseHex(b)!)
const chroma = (hex: string) => rgbaToOklch(parseHex(hex)!).c
const hue = (hex: string) => rgbaToOklch(parseHex(hex)!).h

/** How far apart two hues are round the wheel, in degrees. */
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

/** The least distance between any two of `list`'s colors. */
function closest(list: Palette[]): number {
  let least = Infinity

  for (let index = 0; index < list.length; index += 1) {
    for (let other = 0; other < index; other += 1) {
      least = Math.min(least, distance(list[index]!.color, list[other]!.color))
    }
  }

  return least
}

describe("palettes", () => {
  it("starts agents with the 12 hand-tuned palettes, each named once and numbered by its place", () => {
    expect(tunedAgentPalettes).toHaveLength(12)
    expect(new Set(tunedAgentPalettes.map((each) => each.name)).size).toBe(12)
    expect(agents(12)).toEqual(tunedAgentPalettes)
    expect(agentPalette(5)).toBe(tunedAgentPalettes[5])
  })

  it("never runs out for people or agents, making the same palette for the same number every time", () => {
    for (const make of [palette, agentPalette]) {
      const far = make(10_000)

      expect(far.n).toBe(10_000)
      expect(far.name).toMatch(/^Hue \d+$/)
      expect(make(10_000)).toEqual(far)
    }
  })

  it("keeps badge text readable on every palette", () => {
    for (const each of [...people(300), ...agents(300)]) {
      expect(badgeContrast(each)).toBeGreaterThanOrEqual(inkContrast)
    }
  })

  it("keeps a person's gradient in one hue and sweeps an agent's across hues", () => {
    for (const each of people(48)) {
      const [first, , last] = each.stops

      expect(hueGap(hue(first), hue(last))).toBeLessThan(12)
    }

    for (const each of agents(48)) {
      const [first, , last] = each.stops

      expect(hueGap(hue(first), hue(last))).toBeGreaterThan(30)
    }
  })

  it("makes agents more vivid than people", () => {
    const softest = Math.min(...agents(48).map((each) => chroma(each.color)))
    const people48 = people(48).map((each) => chroma(each.color))

    expect(Math.max(...people48)).toBeLessThan(0.12)
    expect(softest).toBeGreaterThan(0.1)
  })

  it("makes the first dozen people look different, and the first two dozen at least differ", () => {
    expect(closest(people(12))).toBeGreaterThan(0.04)
    expect(closest(people(24))).toBeGreaterThan(0.01)
  })

  it("keeps generated agents clear of the hand-tuned ones and of each other", () => {
    const generated = agents(48).slice(tunedAgentPalettes.length)

    for (const each of generated) {
      for (const tuned of tunedAgentPalettes) {
        expect(distance(each.color, tuned.color)).toBeGreaterThanOrEqual(tunedClearance)
      }
    }

    expect(closest(agents(24))).toBeGreaterThan(0.03)
  })

  it("keeps the first people's colors apart from the first agents'", () => {
    for (const person of people(24)) {
      for (const agent of agents(24)) {
        expect(distance(person.color, agent.color)).toBeGreaterThan(0.05)
      }
    }
  })

  it("only has palettes for whole numbers from 0", () => {
    for (const make of [palette, agentPalette]) {
      expect(() => make(-1)).toThrow(RangeError)
      expect(() => make(1.5)).toThrow(RangeError)
    }
  })
})
