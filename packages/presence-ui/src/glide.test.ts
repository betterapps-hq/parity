import { describe, expect, it } from "vite-plus/test"
import { glideMs, type PointerTrack, pointerMove } from "./glide.ts"

const fresh: PointerTrack = { glideEnds: 0 }

describe("glideMs", () => {
  it("takes longer the further the pointer has to go, from 280ms to 720ms", () => {
    expect(glideMs(0)).toBe(280)
    expect(glideMs(200)).toBe(360)
    expect(glideMs(300)).toBe(540)
    expect(glideMs(5000)).toBe(720)
  })
})

describe("pointerMove", () => {
  it("places the first position at once", () => {
    const { transition, track } = pointerMove(fresh, { at: { x: 10, y: 20 }, now: 0, stepMs: 80 })

    expect(transition).toBe("none")
    expect(track).toEqual({ last: { x: 10, y: 20 }, wasOff: false, glideEnds: 0 })
  })

  it("moves to each later position in a straight line in the time positions take to arrive", () => {
    const first = pointerMove(fresh, { at: { x: 0, y: 0 }, now: 0, stepMs: 80 })
    const { transition } = pointerMove(first.track, { at: { x: 5, y: 5 }, now: 80, stepMs: 80 })

    expect(transition).toBe("transform 80ms linear, opacity 400ms ease-out")
  })

  it("stays where it was left while off the canvas, and fades", () => {
    const first = pointerMove(fresh, { at: { x: 40, y: 40 }, now: 0, stepMs: 80 })
    const off = pointerMove(first.track, { at: { x: 40, y: 40 }, offCanvas: true, now: 100, stepMs: 80 })

    expect(off.track.wasOff).toBe(true)
    expect(off.transition).toContain("opacity 400ms")
  })

  it("glides back from where it was left, for longer the further it is", () => {
    const left = { last: { x: 0, y: 0 }, wasOff: true, glideEnds: 0 }
    const near = pointerMove(left, { at: { x: 30, y: 40 }, now: 1000, stepMs: 80 })
    const far = pointerMove(left, { at: { x: 300, y: 0 }, now: 1000, stepMs: 80 })

    expect(near.transition).toBe("transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out")
    expect(far.transition).toBe("transform 540ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out")
    expect(far.track.glideEnds).toBe(1540)
  })

  it("finishes a glide with positions that arrive during it, rather than restarting it", () => {
    const back = pointerMove(
      { last: { x: 0, y: 0 }, wasOff: true, glideEnds: 0 },
      { at: { x: 300, y: 0 }, now: 1000, stepMs: 80 }
    )

    const during = pointerMove(back.track, { at: { x: 310, y: 0 }, now: 1200, stepMs: 80 })
    const after = pointerMove(during.track, { at: { x: 320, y: 0 }, now: 1600, stepMs: 80 })

    expect(during.transition).toContain("transform 340ms")
    expect(after.transition).toBe("transform 80ms linear, opacity 400ms ease-out")
    expect(after.track.glideEnds).toBe(0)
  })

  it("jumps back instead of gliding with reduced motion", () => {
    const { transition, track } = pointerMove(
      { last: { x: 0, y: 0 }, wasOff: true, glideEnds: 0 },
      { at: { x: 300, y: 0 }, now: 1000, stepMs: 80, reduced: true }
    )

    expect(transition).toBe("opacity 200ms ease-out")
    expect(track.glideEnds).toBe(0)
  })
})
