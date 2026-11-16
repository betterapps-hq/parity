import { describe, expect, it } from "vite-plus/test"
import { along, asEasing, simulate } from "./springs.ts"

describe("a simulated spring", () => {
  it("starts at 0 and settles on 1", () => {
    const { points } = simulate({ stiffness: 300, damping: 22 })

    expect(points[0]).toBe(0)
    expect(points.at(-1)).toBe(1)
  })

  it("overshoots and bounces back when it's loose, and doesn't when it's damped hard", () => {
    const loose = simulate({ stiffness: 520, damping: 13 })
    const firm = simulate({ stiffness: 100, damping: 40 })

    expect(Math.max(...loose.points)).toBeGreaterThan(1.1)
    expect(Math.max(...firm.points)).toBeLessThanOrEqual(1)
  })

  it("takes longer to settle the less it's damped", () => {
    const quick = simulate({ stiffness: 300, damping: 30 })
    const wobbly = simulate({ stiffness: 300, damping: 10 })

    expect(wobbly.duration).toBeGreaterThan(quick.duration)
    expect(quick.duration).toBeGreaterThan(0)
  })
})

describe("a spring as CSS", () => {
  const spring = { duration: 100, points: [0, 0.6, 1.08, 1] }

  it("is a linear() easing through its points", () => {
    expect(asEasing(spring)).toBe("linear(0.0000, 0.6000, 1.0800, 1.0000)")
  })

  it("is keyframes made from each point, spread evenly from start to end", () => {
    expect(along(spring, (progress) => ({ opacity: progress }))).toEqual([
      { opacity: 0, offset: 0 },
      { opacity: 0.6, offset: 1 / 3 },
      { opacity: 1.08, offset: 2 / 3 },
      { opacity: 1, offset: 1 }
    ])
  })
})
