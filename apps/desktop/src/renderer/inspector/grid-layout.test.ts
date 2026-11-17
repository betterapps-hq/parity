import { describe, expect, it } from "vite-plus/test"
import { measuredGrid, selfAlign, trackSizes } from "./grid-layout.ts"

describe("a grid as the canvas lays it out", () => {
  it("reads its tracks from their computed sizes", () => {
    expect(trackSizes("120px 240.5px 1px")).toEqual([120, 240.5, 1])
    expect(trackSizes("none")).toEqual([])
  })

  it("puts each child in the cells its box covers, across the gaps", () => {
    // Three 100px columns and two 50px rows, 10px apart.
    const grid = measuredGrid({
      columns: [100, 100, 100],
      rows: [50, 50],
      gap: { column: 10, row: 10 },
      self: "pro",
      items: {},
      children: [
        { id: "heading", name: "Heading", auto: true, box: { left: 0, top: 0, width: 320, height: 50 } },
        { id: "pro", name: "Pro plan", auto: false, box: { left: 110, top: 60, width: 210, height: 50 } },
        // Placed at the start of its cell rather than stretched across it.
        { id: "team", name: "Team", auto: true, box: { left: 0, top: 60, width: 40, height: 20 } }
      ]
    })

    expect(grid.weights).toEqual([100, 100, 100])
    expect(grid.rows).toBe(2)
    expect(grid.children.map((child) => [child.id, child.area])).toEqual([
      ["heading", { col: 0, cols: 3, row: 0, rows: 1 }],
      ["pro", { col: 1, cols: 2, row: 1, rows: 1 }],
      ["team", { col: 0, cols: 1, row: 1, rows: 1 }]
    ])
  })

  it("takes a child's cells from its lines where its box doesn't fill them", () => {
    const narrow = { width: 40, height: 20 }
    const auto = { start: "auto", end: "auto" }

    const grid = measuredGrid({
      columns: [100, 100, 100],
      rows: [50, 50],
      gap: { column: 10, row: 10 },
      self: "lines",
      items: {},
      children: [
        {
          id: "lines",
          name: "Lines",
          auto: false,
          box: { left: 0, top: 0, ...narrow },
          lines: { column: { start: "1", end: "-1" }, row: auto }
        },
        {
          id: "span",
          name: "Span",
          auto: true,
          box: { left: 280, top: 60, ...narrow },
          lines: { column: { start: "auto", end: "span 2" }, row: auto },
          align: { x: "end" }
        }
      ]
    })

    expect(grid.children.map((child) => child.area)).toEqual([
      { col: 0, cols: 3, row: 0, rows: 1 },
      { col: 1, cols: 2, row: 1, rows: 1 }
    ])
  })

  it("reads where the grid puts its children in their cells", () => {
    expect(["normal", "start", "flex-end", "center", "stretch", "safe end"].map(selfAlign)).toEqual([
      undefined,
      "start",
      "end",
      "center",
      "stretch",
      "end"
    ])
  })
})
