import { describe, expect, it } from "vite-plus/test"
import {
  cancelMs,
  dropMs,
  flightMs,
  landingLook,
  lift,
  liftMs,
  liftShadow,
  restShadow,
  scaled,
  settle,
  translated
} from "./drag-motion.ts"

describe("lift", () => {
  it("grows 3% onto the shadow in 120 ms when it's picked up", () => {
    expect(lift(true, { reduced: false })).toEqual({
      scale: "1.03",
      filter: liftShadow,
      transition: `scale ${liftMs}ms ${settle}, filter ${liftMs}ms ${settle}`
    })
  })

  it("settles back in 180 ms when it's dropped, or in the time it's given", () => {
    expect(lift(false, { reduced: false })).toEqual({
      scale: "none",
      filter: restShadow,
      transition: `scale ${dropMs}ms ${settle}, filter ${dropMs}ms ${settle}`
    })
    expect(lift(false, { reduced: false, ms: cancelMs }).transition).toBe(
      `scale ${cancelMs}ms ${settle}, filter ${cancelMs}ms ${settle}`
    )
  })

  it("keeps its size and moves at once with reduced motion, keeping the shadow", () => {
    expect(lift(true, { reduced: true })).toEqual({ scale: "none", filter: liftShadow, transition: "none" })
    expect(lift(false, { reduced: true })).toEqual({ scale: "none", filter: restShadow, transition: "none" })
  })

  it("grows from a scale of its own, and adds the shadow after a filter of its own", () => {
    expect(lift(true, { reduced: false, scale: "2", filter: "blur(2px)" })).toMatchObject({
      scale: "2.06",
      filter: `blur(2px) ${liftShadow}`
    })
    expect(lift(false, { reduced: false, scale: "2", filter: "blur(2px)" })).toMatchObject({
      scale: "2",
      filter: `blur(2px) ${restShadow}`
    })
  })
})

describe("scaled", () => {
  it("grows nothing, one number and two, but not along z", () => {
    expect(scaled("none", 1.03)).toBe("1.03")
    expect(scaled("1.5", 2)).toBe("3")
    expect(scaled("1 2", 1.5)).toBe("1.5 3")
    expect(scaled("1 2 4", 1.5)).toBe("1.5 3 4")
  })

  it("leaves anything else alone", () => {
    expect(scaled("var(--x)", 1.03)).toBeUndefined()
    expect(scaled("1 2 3 4", 1.03)).toBeUndefined()
  })
})

describe("translated", () => {
  it("moves nothing, one length, two and three, keeping z", () => {
    expect(translated("none", { x: 4, y: -2 })).toBe("4px -2px")
    expect(translated("10px", { x: 4, y: -2 })).toBe("14px -2px")
    expect(translated("10px 5px", { x: 0.5, y: 1 })).toBe("10.5px 6px")
    expect(translated("10px 5px 3px", { x: 1, y: 1 })).toBe("11px 6px 3px")
  })

  it("leaves what isn't in pixels where it is", () => {
    expect(translated("50%", { x: 1, y: 1 })).toBeUndefined()
    expect(translated("1em 2px", { x: 1, y: 1 })).toBeUndefined()
  })
})

describe("flightMs", () => {
  it("flies into where it lands in 180 ms and back in 260 ms, and at once with reduced motion", () => {
    expect(flightMs("dropping", false)).toBe(180)
    expect(flightMs("cancelling", false)).toBe(260)
    expect(flightMs("dropping", true)).toBe(0)
    expect(flightMs("cancelling", true)).toBe(0)
  })
})

describe("landingLook", () => {
  it("fades the copy to 55% with a 1.5px dashed edge 1px out, in the color it's given", () => {
    expect(landingLook("red")).toEqual({ opacity: "0.55", outline: "1.5px dashed red", "outline-offset": "1px" })
  })
})
