import { describe, expect, it } from "vite-plus/test"
import { freezeOrder, restartAfter } from "./freezer.ts"

describe("freezeOrder", () => {
  it("freezes the route nearest the view first, each route once at its nearest board", () => {
    expect(
      freezeOrder([
        { url: "/pricing", distance: 900 },
        { url: "/", distance: 40 },
        { url: "/pricing", distance: 10 },
        { url: "/settings", distance: Infinity }
      ])
    ).toEqual(["/pricing", "/", "/settings"])
  })

  it("has nothing to freeze with no boards", () => {
    expect(freezeOrder([])).toEqual([])
  })
})

describe("restartAfter", () => {
  it("waits 1 s, then 5 s, after failures close together", () => {
    expect(restartAfter([0], 0)).toEqual({ delay: 1000 })
    expect(restartAfter([0, 10_000], 10_000)).toEqual({ delay: 5000 })
  })

  it("stops after three failures in two minutes", () => {
    expect(restartAfter([0, 10_000, 20_000], 20_000)).toBe("stop")
  })

  it("forgets failures older than two minutes", () => {
    expect(restartAfter([0, 10_000, 200_000], 200_000)).toEqual({ delay: 1000 })
  })
})
