import { defaultModeSettings } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { type Board, boardOverlaps, canvasBoards, emptySpace, overlapWarnings, titleBand } from "./boards.ts"

function board(id: string, x: number, y: number, width = 400, height = 300, estimated = false): Board {
  return { key: `app.par#${id}`, id, name: id[0]!.toUpperCase() + id.slice(1), x, y, width, height, estimated }
}

describe("canvasBoards", () => {
  it("sizes a drawn board as it was drawn, and estimates one not drawn yet", () => {
    const container = (id: string, x: number) => ({
      id,
      name: id,
      position: { x, y: 0 },
      root: { type: "layout" as const, id: "page", children: [] }
    })

    const boards = canvasBoards(
      [
        { path: "app.par", container: container("home", 0) },
        { path: "app.par", container: container("draft", 2000) }
      ],
      { "app.par#home": { width: 1280.4, height: 900.6 } },
      defaultModeSettings
    )

    expect(boards[0]).toEqual({
      key: "app.par#home",
      id: "home",
      name: "home",
      x: 0,
      y: 0,
      width: 1280,
      height: 901,
      estimated: false
    })
    expect(boards[1]).toMatchObject({ key: "app.par#draft", x: 2000, estimated: true })
    expect(boards[1]!.width).toBeGreaterThan(0)
  })
})

describe("boardOverlaps", () => {
  it("finds boards that collide, and a board whose title band covers the one above it", () => {
    const boards = [board("home", 0, 0), board("pricing", 200, 100), board("about", 0, 300 + titleBand / 2)]
    expect(boardOverlaps(boards)).toEqual([
      { designs: ["home", "pricing"], names: ["Home", "Pricing"], width: 200, height: 360 },
      { designs: ["home", "about"], names: ["Home", "About"], width: 400, height: 80, titleOnly: true },
      { designs: ["pricing", "about"], names: ["Pricing", "About"], width: 200, height: 180 }
    ])
  })

  it("keeps to the pairs one design is in, and says when a size is a guess", () => {
    const boards = [board("home", 0, 0), board("pricing", 200, 0, 400, 300, true), board("far", 5000, 5000)]
    expect(boardOverlaps(boards, "far")).toEqual([])
    expect(boardOverlaps(boards, "pricing")).toEqual([
      { designs: ["home", "pricing"], names: ["Home", "Pricing"], width: 200, height: 460, estimated: true }
    ])
  })
})

describe("overlapWarnings", () => {
  it("warns about the boards a call touched and counts the canvas's other overlaps in one note", () => {
    const boards = [
      board("home", 0, 0),
      board("pricing", 200, 0, 400, 300, true),
      board("a", 5000, 0),
      board("b", 5100, 0)
    ]

    expect(overlapWarnings(boards, new Set(["app.par#pricing"]))).toEqual([
      {
        category: "overlap",
        message: `Home (home) and Pricing (pricing) overlap by 200x460 (estimated, as Pricing isn't drawn yet). Move one clear with UpdateDesign(id, { x, y }), leaving ${titleBand} above each board for its title; FindEmptySpace finds space and Overlaps() checks every board.`
      },
      {
        category: "canvas_overlaps",
        message:
          "1 other pair of boards overlaps or crowds a title on the canvas. This call didn't create, change or move them, so they aren't listed here; Overlaps() lists every one."
      }
    ])
  })

  it("says nothing for a clear canvas", () => {
    expect(overlapWarnings([board("home", 0, 0), board("pricing", 1000, 0)], new Set(["app.par#home"]))).toEqual([])
  })
})

describe("emptySpace", () => {
  const boards = [board("home", 0, 0), board("pricing", 600, 100), board("about", 0, 1000)]

  it("puts a new board right of or below every board, a padding away", () => {
    expect(emptySpace([], { width: 400, height: 300 })).toEqual({ x: 0, y: 0 })
    expect(emptySpace(boards, { width: 400, height: 300 })).toEqual({ x: 1240, y: 0 })
    expect(emptySpace(boards, { width: 400, height: 300, direction: "below", padding: 100 })).toEqual({
      x: 0,
      y: 1400
    })
  })

  it("near a board, clears only the boards level with it", () => {
    expect(emptySpace(boards, { width: 400, height: 300 }, boards[2])).toEqual({ x: 640, y: 1000 })
    expect(emptySpace(boards, { width: 400, height: 300, direction: "below" }, boards[1])).toEqual({ x: 600, y: 640 })
  })
})
