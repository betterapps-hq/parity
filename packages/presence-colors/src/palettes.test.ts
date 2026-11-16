import { colorDistance, parseHex, rgbaToOklch } from "@parity-app/tokens"
import { describe, expect, it } from "vite-plus/test"
import { badgeContrast, inkContrast, palette, tunedPalettes } from "./palettes.ts"

const hueOf = (hex: string) => rgbaToOklch(parseHex(hex)!).h

/** How far apart two hues are round the wheel, in degrees. */
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

const generated = (count: number) => Array.from({ length: count }, (_, index) => palette(tunedPalettes.length + index))

describe("palettes", () => {
  it("has 24 hand-tuned palettes, each named once and numbered by its place", () => {
    expect(tunedPalettes).toHaveLength(24)
    expect(new Set(tunedPalettes.map((each) => each.name)).size).toBe(24)
    expect(tunedPalettes.map((each) => each.n)).toEqual(tunedPalettes.map((_, index) => index))
    expect(palette(5)).toBe(tunedPalettes[5])
  })

  it("never runs out, making the same palette for the same number every time", () => {
    const far = palette(10_000)

    expect(far.n).toBe(10_000)
    expect(far.name).toMatch(/^Hue \d+$/)
    expect(palette(10_000)).toEqual(far)
  })

  it("keeps badge text readable on every palette, hand-tuned or generated", () => {
    for (const each of [...tunedPalettes, ...generated(500)]) {
      expect(badgeContrast(each)).toBeGreaterThanOrEqual(inkContrast)
    }
  })

  it("gives each generated palette a hue far from the one before it", () => {
    const hues = generated(50).map((each) => hueOf(each.color))

    for (let index = 1; index < hues.length; index += 1) {
      expect(hueGap(hues[index]!, hues[index - 1]!)).toBeGreaterThan(100)
    }
  })

  it("makes the next 48 palettes differ from each other and from the hand-tuned ones", () => {
    const colors = [...tunedPalettes, ...generated(48)].map((each) => parseHex(each.color)!)

    for (let index = tunedPalettes.length; index < colors.length; index += 1) {
      for (let other = 0; other < index; other += 1) {
        expect(colorDistance(colors[index]!, colors[other]!)).toBeGreaterThan(0.005)
      }
    }
  })

  it("only has palettes for whole numbers from 0", () => {
    expect(() => palette(-1)).toThrow(RangeError)
    expect(() => palette(1.5)).toThrow(RangeError)
  })
})
