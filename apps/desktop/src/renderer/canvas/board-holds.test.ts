import { describe, expect, it } from "vite-plus/test"
import { boardHolds, type HoldReleased, holdLimitMs } from "./board-holds.ts"
import { PlacedBoards } from "./placed-boards.ts"
import { clock } from "./test-clock.ts"

function holding() {
  const timers = clock()
  const places = new PlacedBoards()
  const released: HoldReleased[] = []
  const holds = boardHolds({ places, timers, now: timers.now, released: (ended) => released.push(ended) })

  return { timers, places, released, holds }
}

describe("boardHolds", () => {
  it("holds a board where it was, draws it along the drag and lets it go", () => {
    const { timers, places, released, holds } = holding()
    const held = holds.hold("tab", "home", { x: 0, y: 0 }, "agent-presence")
    expect(places.at("tab", "home")).toEqual({ x: 0, y: 0 })
    held.update({ x: 40, y: 10 })
    expect(places.at("tab", "home")).toEqual({ x: 40, y: 10 })
    timers.tick(1200)
    held.release()
    expect(places.at("tab", "home")).toBeUndefined()
    expect(holds.held("tab", "home")).toBe(false)
    expect(released).toEqual([{ extension: "agent-presence", how: "released", heldMs: 1200 }])
  })

  it("keeps a board drawn where it is for a second hold, until both let go", () => {
    const { places, holds } = holding()
    const first = holds.hold("tab", "home", { x: 0, y: 0 })
    first.update({ x: 30, y: 0 })
    // The second move's write would put it elsewhere, but it stays where it's drawn.
    const second = holds.hold("tab", "home", { x: 999, y: 999 })
    expect(places.at("tab", "home")).toEqual({ x: 30, y: 0 })
    first.update({ x: 50, y: 0 })
    first.release()
    expect(places.at("tab", "home")).toEqual({ x: 50, y: 0 })
    second.update({ x: 80, y: 0 })
    second.release()
    expect(places.at("tab", "home")).toBeUndefined()
  })

  it("lets go after 10 s whatever happens, and ignores what comes after", () => {
    const { timers, places, released, holds } = holding()
    const held = holds.hold("tab", "home", { x: 0, y: 0 })
    timers.tick(holdLimitMs - 1)
    expect(places.at("tab", "home")).toEqual({ x: 0, y: 0 })
    timers.tick(1)
    expect(places.at("tab", "home")).toBeUndefined()
    held.update({ x: 10, y: 10 })
    held.release()
    expect(places.at("tab", "home")).toBeUndefined()
    expect(released).toEqual([{ extension: "core", how: "timeout", heldMs: 10_000 }])
  })

  it("lets go of every hold on a board the person grabs", () => {
    const { places, released, holds } = holding()
    holds.hold("tab", "home", { x: 0, y: 0 })
    holds.hold("tab", "home", { x: 0, y: 0 })
    holds.hold("tab", "pricing", { x: 0, y: 0 })
    expect(holds.grab("tab", "home")).toBe(true)
    expect(places.at("tab", "home")).toBeUndefined()
    expect(places.at("tab", "pricing")).toEqual({ x: 0, y: 0 })
    expect(released.map((ended) => ended.how)).toEqual(["grabbed", "grabbed"])
    expect(holds.grab("tab", "home")).toBe(false)
  })

  it("lets go when disposed, and keeps boards in other tabs apart", () => {
    const { places, released, holds } = holding()
    const held = holds.hold("tab", "home", { x: 0, y: 0 })
    holds.hold("other", "home", { x: 5, y: 5 })
    held[Symbol.dispose]()
    expect(places.at("tab", "home")).toBeUndefined()
    expect(places.at("other", "home")).toEqual({ x: 5, y: 5 })
    expect(released.map((ended) => ended.how)).toEqual(["disposed"])
  })
})

describe("PlacedBoards", () => {
  it("draws a board where its newest placement puts it, and tells the canvas", () => {
    const places = new PlacedBoards()
    let told = 0
    places.subscribe(() => told++)
    const hold = places.place("tab", "home", { x: 0, y: 0 })
    const drag = places.place("tab", "home", { x: 100, y: 0 })
    expect(places.at("tab", "home")).toEqual({ x: 100, y: 0 })
    hold.move({ x: 10, y: 0 })
    expect(places.at("tab", "home")).toEqual({ x: 100, y: 0 })
    drag.remove()
    expect(places.at("tab", "home")).toEqual({ x: 10, y: 0 })
    // Moving to where it is, or after it's gone, tells no one.
    const before = told
    hold.move({ x: 10, y: 0 })
    drag.move({ x: 1, y: 1 })
    expect(told).toBe(before)
    hold.remove()
    expect(places.at("tab", "home")).toBeUndefined()
  })
})
