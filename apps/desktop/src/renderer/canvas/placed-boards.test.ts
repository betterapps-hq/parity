import { describe, expect, it } from "vite-plus/test"
import { PlacedBoards } from "./placed-boards.ts"

describe("PlacedBoards", () => {
  it("tells which board was placed, moved and let go, so the canvas updates only that one", () => {
    const boards = new PlacedBoards()
    const told: string[] = []
    const stop = boards.subscribe((tab, design) => told.push(`${tab} ${design}`))

    const placement = boards.place("tab", "app.par#home", { x: 1, y: 2 })
    placement.move({ x: 1, y: 2 })
    placement.move({ x: 3, y: 4 })
    expect(boards.at("tab", "app.par#home")).toEqual({ x: 3, y: 4 })
    placement.remove()
    placement.remove()
    stop()
    boards.place("tab", "app.par#about", { x: 0, y: 0 })

    expect(told).toEqual(["tab app.par#home", "tab app.par#home", "tab app.par#home"])
    expect(boards.at("tab", "app.par#home")).toBeUndefined()
  })
})
