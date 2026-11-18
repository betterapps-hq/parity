import { describe, expect, it } from "vite-plus/test"
import { dotTier } from "./tier-dot.ts"

const idle = { live: false, ready: false }

describe("dotTier", () => {
  it("is frozen with no spare on the board's route", () => {
    expect(dotTier(idle, undefined)).toBe("frozen")
  })

  it("warms while a spare loads at or moves to the route, and is warmed once it's ready there", () => {
    expect(dotTier(idle, "warming")).toBe("warming")
    expect(dotTier(idle, "ready")).toBe("warmed")
  })

  it("is warmed while the board is live or a spare waits on it, whatever the spares on its route are doing", () => {
    expect(dotTier({ live: true, ready: false }, undefined)).toBe("warmed")
    expect(dotTier({ live: true, ready: false }, "warming")).toBe("warmed")
    expect(dotTier({ live: false, ready: true }, "warming")).toBe("warmed")
  })
})
