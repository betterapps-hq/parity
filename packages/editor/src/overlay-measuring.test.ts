import { describe, expect, it } from "vite-plus/test"
import { drawsOver, measuresNext, overlayDesigns, settleMs, settleUntil } from "./overlay-measuring.ts"

describe("overlayDesigns", () => {
  it("is the selected and the hovered design", () => {
    expect(overlayDesigns({ selected: "a.par#card", hovered: "a.par#list", layoutGrid: false })).toEqual(
      new Set(["a.par#card", "a.par#list"])
    )
    expect(overlayDesigns({ selected: "a.par#card", layoutGrid: false })).toEqual(new Set(["a.par#card"]))
  })

  it("is none with nothing selected or hovered", () => {
    expect(overlayDesigns({ layoutGrid: false })).toEqual(new Set())
  })

  it("is every design while the layout grid shows, since it's drawn over every frame", () => {
    expect(overlayDesigns({ selected: "a.par#card", layoutGrid: true })).toBe("every")
  })
})

describe("drawsOver", () => {
  it("takes a frame of a design the overlay draws over, and no other", () => {
    const designs = overlayDesigns({ selected: "a.par#card", layoutGrid: false })
    expect(drawsOver(designs, "a.par#card")).toBe(true)
    expect(drawsOver(designs, "a.par#list")).toBe(false)
    expect(drawsOver(designs, undefined)).toBe(false)
  })

  it("takes every frame for the layout grid", () => {
    expect(drawsOver("every", "a.par#list")).toBe(true)
  })
})

describe("settleUntil", () => {
  it("measures for a while after a change", () => {
    expect(settleUntil(1000, 0)).toBe(1000 + settleMs)
  })

  it("moves on with each change, and never back", () => {
    expect(settleUntil(1200, 1000 + settleMs)).toBe(1200 + settleMs)
    expect(settleUntil(1000, 5000)).toBe(5000)
  })
})

describe("measuresNext", () => {
  const settled = { now: 2000, until: 1500, showing: true }

  it("goes on measuring until it settles after a change, without asking about animations", () => {
    let asked = 0
    const animating = () => {
      asked++
      return false
    }
    expect(measuresNext({ now: 1000, until: 1500, showing: true, animating })).toBe(true)
    expect(asked).toBe(0)
  })

  it("rests once settled with nothing animating", () => {
    expect(measuresNext({ ...settled, animating: () => false })).toBe(false)
  })

  it("follows an animation in a frame it draws over for as long as it runs", () => {
    expect(measuresNext({ ...settled, animating: () => true })).toBe(true)
  })

  it("rests while it shows nothing, whatever moves", () => {
    expect(measuresNext({ now: 1000, until: 1500, showing: false, animating: () => true })).toBe(false)
  })
})
