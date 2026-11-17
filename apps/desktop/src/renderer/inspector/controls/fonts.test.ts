import { describe, expect, it } from "vite-plus/test"
import { declaredFamilies, installedFamilies, styleWeight } from "./fonts.ts"

describe("the project's fonts", () => {
  it("groups its @font-face rules by family, a weight range as a variable font's axis", () => {
    expect(
      declaredFamilies([
        { family: '"Inter Variable"', weight: "100 900", style: "normal" },
        { family: "Lora", weight: "400", style: "normal" },
        { family: "Lora", weight: "bold", style: "italic" }
      ])
    ).toEqual([
      {
        name: "Inter Variable",
        stack: '"Inter Variable", sans-serif',
        weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
        axis: [100, 900],
        italic: false
      },
      { name: "Lora", stack: "Lora, sans-serif", weights: [400, 700], italic: true }
    ])
  })

  it("reads a face with no weight as Regular", () => {
    expect(declaredFamilies([{ family: "Brand", weight: "", style: "" }])[0]?.weights).toEqual([400])
  })
})

describe("the computer's fonts", () => {
  it("groups faces by family, alphabetically, with each style name's weight and whether any is italic", () => {
    expect(
      installedFamilies([
        { family: "Segoe UI", style: "Semibold" },
        { family: "Arial", style: "Bold Italic" },
        { family: "Segoe UI", style: "Regular" },
        { family: "Arial", style: "Regular" }
      ])
    ).toEqual([
      { name: "Arial", stack: "Arial, sans-serif", weights: [400, 700], italic: true },
      { name: "Segoe UI", stack: '"Segoe UI", sans-serif', weights: [400, 600], italic: false }
    ])
  })

  it("reads each style name's weight", () => {
    expect(
      ["Thin", "ExtraLight", "Light", "Book", "Medium", "Demi Bold", "Bold", "Extra Bold", "Black"].map(styleWeight)
    ).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900])
  })
})
