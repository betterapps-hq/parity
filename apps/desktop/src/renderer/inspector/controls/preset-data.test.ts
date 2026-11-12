import { describe, expect, it } from "vite-plus/test"
import { closestPreset } from "./preset-data.ts"

// docs/editor.md, The style sections on the approved controls (PAR-923): the preset Typography offers.

const name = (layer: Parameters<typeof closestPreset>[0]) => closestPreset(layer)?.preset.name

describe("the preset a layer is offered", () => {
  it("offers none to a layer with no type of its own, which has the type it inherits", () => {
    expect(closestPreset({ own: {} })).toBeUndefined()
    expect(closestPreset({ own: {}, italic: true })).toBeUndefined()
  })

  it("offers none to a layer with a preset", () => {
    expect(closestPreset({ preset: "heading", own: { size: { px: 21 } } })).toBeUndefined()
  })

  it("offers the preset its type matches in every row the preset sets, with nothing differing", () => {
    const match = closestPreset({
      own: {
        font: { token: "sans" },
        size: { token: "xl" },
        weight: { token: "semibold" },
        lineHeight: { px: 28 },
        letterSpacing: { token: "tight" }
      }
    })

    expect(match?.preset.name).toBe("heading")
    expect(match?.differs).toEqual([])
  })

  it("offers the nearest over every row, not only by size, and says which rows differ", () => {
    // 21px semibold at 28: a step off Heading's letter spacing and a quarter off its size, but two weights off Body's.
    const match = closestPreset({
      own: { font: { token: "sans" }, size: { px: 21 }, weight: { token: "semibold" }, lineHeight: { px: 28 } }
    })

    expect(match?.preset.name).toBe("heading")
    expect(match?.differs).toEqual(["size", "letterSpacing"])
  })

  it("offers none when every preset is more than three steps away", () => {
    expect(name({ own: { size: { px: 64 }, weight: { token: "bold" }, lineHeight: { px: 72 } } })).toBeUndefined()
  })
})
