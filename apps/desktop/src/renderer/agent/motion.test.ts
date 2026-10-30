import { describe, expect, it } from "vite-plus/test"
import {
  arcPoint,
  breathe,
  curvePoint,
  easeInOutCubic,
  easeInOutSettle,
  focusOffset,
  glanceOffset,
  paceFor,
  travelMs
} from "./motion.ts"

describe("agent cursor motion", () => {
  it("eases in and out", () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(0.5)).toBe(0.5)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1)
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9)
  })

  it("takes longer to travel farther, within limits", () => {
    const origin = { x: 0, y: 0 }
    const near = travelMs(origin, { x: 30, y: 0 })
    const far = travelMs(origin, { x: 900, y: 0 })
    expect(travelMs(origin, origin)).toBe(700)
    expect(far).toBeGreaterThan(near)
    expect(travelMs(origin, { x: 100_000, y: 0 })).toBe(2200)
  })

  it("arcs between the ends", () => {
    const from = { x: 0, y: 0 }
    const to = { x: 100, y: 0 }
    expect(arcPoint(from, to, 0, 0.2)).toEqual(from)
    expect(arcPoint(from, to, 1, 0.2)).toEqual(to)
    expect(arcPoint(from, to, 0.5, 0.2).y).toBeCloseTo(10)
    expect(arcPoint(from, to, 0.5, -0.2).y).toBeCloseTo(-10)
    expect(arcPoint(from, to, 0.5, 0).y).toBeCloseTo(0)
  })

  it("curves into an arc or an S, ending where it should, with a small overshoot", () => {
    const from = { x: 0, y: 0 }
    const to = { x: 90, y: 0 }
    expect(curvePoint(from, to, 0, 0.2, -0.2)).toEqual(from)
    expect(curvePoint(from, to, 1, 0.2, -0.2)).toEqual(to)
    expect(curvePoint(from, to, 0.25, 0.2, -0.2).y).toBeGreaterThan(0)
    expect(curvePoint(from, to, 0.75, 0.2, -0.2).y).toBeLessThan(0)
    expect(easeInOutSettle(0)).toBeCloseTo(0)
    expect(easeInOutSettle(1)).toBeCloseTo(1)
    expect(Math.max(...[0.8, 0.85, 0.9].map((t) => easeInOutSettle(t)))).toBeGreaterThan(1)
  })

  it("breathes within its radius", () => {
    for (let seconds = 0; seconds < 60; seconds += 0.37) {
      const at = breathe(seconds, 10, 1.3)
      expect(Math.abs(at.x)).toBeLessThanOrEqual(10)
      expect(Math.abs(at.y)).toBeLessThanOrEqual(10)
    }
    expect(breathe(1, 10)).not.toEqual(breathe(2, 10))
  })

  it("glances near the focus and inside the target", () => {
    const box = { x: 0, y: 0, w: 400, h: 300 }
    const focus = focusOffset(box)
    for (const [a, b] of [
      [0, 1],
      [0.25, 1],
      [0.5, 1],
      [0.75, 0.5]
    ] as const) {
      const values = [a, b]
      const glance = glanceOffset(box, () => values.shift()!)
      expect(Math.hypot(glance.x - focus.x, glance.y - focus.y)).toBeLessThanOrEqual(44.0001)
    }
    const tiny = { x: 0, y: 0, w: 6, h: 6 }
    for (let i = 0; i < 20; i++) {
      const glance = glanceOffset(tiny)
      expect(glance.x).toBeGreaterThanOrEqual(2)
      expect(glance.x).toBeLessThanOrEqual(4)
      expect(glance.y).toBeGreaterThanOrEqual(2)
      expect(glance.y).toBeLessThanOrEqual(4)
    }
  })

  it("speeds up as calls pile up", () => {
    expect(paceFor(0)).toBe(1)
    expect(paceFor(2)).toBe(1)
    expect(paceFor(6)).toBeLessThan(1)
    expect(paceFor(100)).toBe(0.35)
  })
})
