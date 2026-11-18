import { describe, expect, it } from "vite-plus/test"
import { PointerTrail } from "./trail.ts"

/** A pointer moving right at 0.3px per ms, taken every 33 ms, and when each arrives: `late(i)` ms after it was taken. */
function moving(count: number, late: (index: number) => number) {
  return Array.from({ length: count }, (_, index) => {
    const t = index * 33

    return { sample: { t, at: { x: t * 0.3, y: 0 } }, arrived: 5000 + t + late(index) }
  })
}

/** Draws the trail every 16 ms from `from` to `to`, feeding it what's arrived by each frame: how far it moved in each. */
function draw(trail: PointerTrail, arrivals: ReturnType<typeof moving>, from: number, to: number): number[] {
  const steps: number[] = []
  let waiting = arrivals.toSorted((a, b) => a.arrived - b.arrived)
  let last: number | undefined

  for (let now = from; now <= to; now += 16) {
    for (const each of waiting.filter((arrival) => arrival.arrived <= now)) {
      trail.push(each.sample, each.arrived)
    }

    waiting = waiting.filter((arrival) => arrival.arrived > now)
    const x = trail.at(now)?.x

    if (x !== undefined && last !== undefined) {
      steps.push(x - last)
    }

    last = x ?? last
  }

  return steps
}

/** Arrival delays that wander between 2 ms and 90 ms, the same on every run. */
function uneven(index: number): number {
  return 2 + ((index * 37) % 89)
}

describe("PointerTrail", () => {
  it("never stops while positions keep coming unevenly, up to 90 ms late, and never jumps", () => {
    const trail = new PointerTrail()
    const arrivals = moving(120, uneven)
    // From once the first has been drawn until the last arrives.
    const steps = draw(trail, arrivals, 5000, 5000 + 119 * 33)
    const moving_ = steps.slice(8)

    expect(Math.min(...moving_)).toBeGreaterThan(0)
    // 0.3px per ms is 4.8px a frame; catching up goes at most twice as fast.
    expect(Math.max(...moving_)).toBeLessThanOrEqual(9.7)
  })

  it("slows down for a gap longer than its delay rather than stopping, and catches up after without skipping", () => {
    const trail = new PointerTrail()
    // A main thread busy for 250 ms holds back the positions taken meanwhile, which then arrive together.
    const arrivals = moving(90, (index) => (index >= 40 && index < 48 ? 5 + (48 - index) * 33 : 5))
    const steps = draw(trail, arrivals, 5000, 5000 + 89 * 33)
    const stalled = steps.slice(8).filter((step) => step <= 0).length

    // It runs out of positions for a few frames at most, and never moves more than twice its speed in one.
    expect(stalled).toBeLessThanOrEqual(6)
    expect(Math.max(...steps)).toBeLessThanOrEqual(9.7)
  })

  it("is drawn about its delay behind the positions", () => {
    const trail = new PointerTrail(100)
    const arrivals = moving(40, () => 3)
    draw(trail, arrivals, 5000, 5000 + 30 * 33)
    // At 5000 + 990, the newest arrived position was taken at 990 - 3; it's drawn about 100 ms before that.
    const x = trail.at(5000 + 30 * 33 + 16)!.x

    expect(x / 0.3).toBeGreaterThan(30 * 33 + 16 - 3 - 100 - 20)
    expect(x / 0.3).toBeLessThan(30 * 33 + 16 - 3 - 100 + 20)
  })

  it("after they keep still, picks up near where they are rather than crawling across the pause", () => {
    const trail = new PointerTrail()
    trail.push({ t: 0, at: { x: 0, y: 0 } }, 1000)
    trail.push({ t: 33, at: { x: 10, y: 0 } }, 1003)
    expect(trail.at(1200)).toEqual({ x: 10, y: 0 })

    // Two seconds still, then moving again.
    trail.push({ t: 2033, at: { x: 20, y: 0 } }, 3003)
    expect(trail.at(3003)!.x).toBeGreaterThan(19)
    expect(trail.at(3150)).toEqual({ x: 20, y: 0 })
    expect(trail.moving).toBe(false)
  })

  it("draws further behind after long gaps, up to 250 ms, and closer again once they're over", () => {
    const trail = new PointerTrail()
    // Positions every 33 ms, but held back 160 ms every 250 ms, as a busy main thread does.
    const arrivals = moving(300, (index) => (index % 8 < 5 ? 160 - (index % 8) * 33 : 2))
    draw(trail, arrivals, 5000, 5000 + 299 * 33)
    const behind = trail.delayMs

    trail.push({ t: 299 * 33 + 30_000, at: { x: 0, y: 0 } }, 5000 + 299 * 33 + 30_002)

    expect(behind).toBeGreaterThan(150)
    expect(behind).toBeLessThanOrEqual(250)
    expect(trail.delayMs).toBe(100)
  })

  it("ignores a position no newer than the latest, and counts those that arrived too late to draw on time", () => {
    const trail = new PointerTrail()
    trail.push({ t: 0, at: { x: 0, y: 0 } }, 1000)
    trail.push({ t: 33, at: { x: 10, y: 0 } }, 1003)
    trail.push({ t: 33, at: { x: 99, y: 0 } }, 1004)
    trail.at(1300)
    trail.push({ t: 66, at: { x: 20, y: 0 } }, 1300)

    expect(trail.latest).toEqual({ x: 20, y: 0 })
    expect(trail.takeLate()).toBe(1)
    expect(trail.takeLate()).toBe(0)
  })
})
