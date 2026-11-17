import { describe, expect, it } from "vite-plus/test"
import { explicitTracks, mapLine, measuredGrid, selfAlign, storedLine, trackSizes } from "./grid-layout.ts"

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

  it("places tracks where the grid shares out its spare room", () => {
    // Three 100px columns spread across 700px: they start at 0, 300 and 600.
    const grid = measuredGrid({
      columns: [100, 100, 100],
      rows: [50],
      gap: { column: 0, row: 0 },
      distribution: { x: { content: "space-between", size: 700 } },
      self: "middle",
      items: {},
      children: [{ id: "middle", name: "Middle", auto: true, box: { left: 300, top: 0, width: 100, height: 50 } }]
    })

    expect(grid.children[0]?.area).toEqual({ col: 1, cols: 1, row: 0, rows: 1 })
  })

  it("keeps an auto-placed child to one track, however far its box runs past it", () => {
    const auto = { start: "auto", end: "auto" }

    const grid = measuredGrid({
      columns: [100, 100, 100],
      rows: [50],
      gap: { column: 0, row: 0 },
      self: "wide",
      items: {},
      children: [
        {
          id: "wide",
          name: "Wide",
          auto: true,
          box: { left: 0, top: 0, width: 240, height: 50 },
          lines: { column: auto, row: auto }
        }
      ]
    })

    expect(grid.children[0]?.area).toEqual({ col: 0, cols: 1, row: 0, rows: 1 })
  })

  it("counts negative lines back from the template's own tracks, not ones the grid added", () => {
    // One row in the template, two more the grid made for children past it.
    const grid = measuredGrid({
      columns: [100],
      rows: [50, 50, 50],
      gap: { column: 0, row: 0 },
      explicit: { columns: 1, rows: 1 },
      self: "top",
      items: {},
      children: [
        {
          id: "top",
          name: "Top",
          auto: false,
          box: { left: 0, top: 0, width: 100, height: 50 },
          lines: { column: { start: "auto", end: "auto" }, row: { start: "1", end: "-1" } }
        }
      ]
    })

    expect(grid.children[0]?.area).toEqual({ col: 0, cols: 1, row: 0, rows: 1 })
  })

  it("finds a centered span's tracks by where its middle is drawn, across unequal tracks", () => {
    const grid = measuredGrid({
      columns: [100, 300, 100],
      rows: [50],
      gap: { column: 0, row: 0 },
      self: "badge",
      items: {},
      children: [
        {
          id: "badge",
          name: "Badge",
          auto: true,
          box: { left: 180, top: 0, width: 40, height: 50 },
          lines: { column: { start: "auto", end: "span 2" }, row: { start: "auto", end: "auto" } },
          align: { x: "center" }
        }
      ]
    })

    expect(grid.children[0]?.area).toEqual({ col: 0, cols: 2, row: 0, rows: 1 })
  })

  it("counts lines from the template when the grid adds a track before it", () => {
    const auto = { start: "auto", end: "auto" }

    const grid = measuredGrid({
      columns: [100, 100, 100, 100],
      rows: [50],
      gap: { column: 0, row: 0 },
      explicit: { columns: 3, rows: 1 },
      self: "first",
      items: {},
      children: [
        {
          id: "before",
          name: "Before",
          auto: false,
          box: { left: 0, top: 0, width: 100, height: 50 },
          lines: { column: { start: "-5", end: "-4" }, row: auto }
        },
        {
          id: "first",
          name: "First",
          auto: false,
          box: { left: 100, top: 0, width: 100, height: 50 },
          lines: { column: { start: "1", end: "2" }, row: auto }
        }
      ]
    })

    expect(grid.children.map((child) => child.area.col)).toEqual([0, 1])
    expect(grid.lines?.col).toEqual({ origin: 1, explicit: 3 })
    // The map's line 2 is the template's line 1; its line 1, before the template, is -5 counted from the end.
    expect([mapLine(1, grid.lines?.col), storedLine(2, grid.lines?.col), storedLine(1, grid.lines?.col)]).toEqual([
      2, 1, -5
    ])
  })

  it("counts the tracks a template makes itself", () => {
    expect(explicitTracks("repeat(3, minmax(0, 1fr))")).toBe(3)
    expect(explicitTracks("[start] 100px repeat(2, 1fr 2fr) [end]")).toBe(5)
    expect(explicitTracks("none")).toBe(0)
    expect(explicitTracks("repeat(auto-fill, 100px)")).toBeUndefined()
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
