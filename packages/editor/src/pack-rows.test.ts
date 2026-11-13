import { describe, expect, it } from "vite-plus/test"
import { packRows } from "./pack-rows.ts"

describe("packRows", () => {
  it("lays each row's boxes out left to right, and each row below the last one's tallest box", () => {
    const placed = packRows(
      [
        [
          { key: "badge", width: 96, height: 52 },
          { key: "button", width: 120, height: 68 }
        ],
        [{ key: "card", width: 380, height: 331 }],
        [{ key: "after", width: 10, height: 10 }]
      ],
      { x: -1000, y: 200 },
      { column: 80, row: 160 }
    )

    expect(Object.fromEntries(placed)).toEqual({
      badge: { x: -1000, y: 200 },
      button: { x: -824, y: 200 },
      card: { x: -1000, y: 428 },
      after: { x: -1000, y: 919 }
    })
  })

  it("places nothing for no rows, and an empty row takes only its gap", () => {
    expect(packRows([], { x: 0, y: 0 }, { column: 10, row: 10 }).size).toBe(0)
    expect(
      packRows([[], [{ key: "a", width: 1, height: 1 }]], { x: 0, y: 0 }, { column: 10, row: 10 }).get("a")
    ).toEqual({
      x: 0,
      y: 10
    })
  })
})
