import { describe, expect, it } from "vite-plus/test"
import { assetLines, type LineSource } from "./asset-lines.ts"

const items = (...keys: string[]) => keys.map((key) => ({ key }))

const kit: LineSource<{ key: string }> = {
  id: "kit",
  open: true,
  families: [
    { name: "card.tsx", items: items("Card", "CardHeader", "CardTitle") },
    { name: "badge.tsx", items: items("Badge") },
    { name: "src/pages", heading: true, items: items("Home") }
  ]
}

const visible = (lines: ReturnType<typeof assetLines>) =>
  lines.map((line) => (line.type === "items" ? line.items.map((item) => item.key).join(" ") : line.key))

describe("assetLines", () => {
  it("lists a source's heading, its families' headings and one item to a row", () => {
    expect(visible(assetLines([kit]))).toEqual([
      "source:kit",
      "family:kit:0",
      "Card",
      "CardHeader",
      "CardTitle",
      // One component in its file needs no heading over it, but a folder's name shows over one.
      "Badge",
      "family:kit:2",
      "Home"
    ])
  })

  it("counts every item of a source, open or closed", () => {
    const [heading] = assetLines([{ ...kit, open: false }])

    expect(heading).toEqual({ type: "source", key: "source:kit", source: 0, count: 5, open: false })
  })

  it("leaves a closed source's items out but keeps its notice", () => {
    expect(visible(assetLines([{ ...kit, open: false, notice: true }]))).toEqual(["source:kit", "notice:kit"])
  })

  it("puts items as many to a row as fit across, marking each family's first and last rows", () => {
    const lines = assetLines([kit], 2).filter((line) => line.type === "items")

    expect(lines.map((line) => [line.items.map((item) => item.key), line.first, line.last])).toEqual([
      [["Card", "CardHeader"], true, false],
      [["CardTitle"], false, true],
      [["Badge"], true, true],
      [["Home"], true, true]
    ])
  })

  it("gives every line its own key, across sources", () => {
    const lines = assetLines([kit, { ...kit, id: "nova" }], 2)

    expect(new Set(lines.map((line) => line.key)).size).toBe(lines.length)
    expect(lines.at(-1)).toMatchObject({ source: 1 })
  })
})
