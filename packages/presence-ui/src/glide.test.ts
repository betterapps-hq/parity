import { describe, expect, it } from "vite-plus/test"
import { glideEase, glideMs, pointerFrame, type PointerTrack } from "./glide.ts"

describe("glideMs", () => {
  it("takes longer the further the pointer has to go, from 280ms to 720ms", () => {
    expect(glideMs(0)).toBe(280)
    expect(glideMs(200)).toBe(360)
    expect(glideMs(300)).toBe(540)
    expect(glideMs(5000)).toBe(720)
  })
})

describe("glideEase", () => {
  it("leaves quickly and arrives slowly, from 0 to 1", () => {
    expect(glideEase(0)).toBe(0)
    expect(glideEase(1)).toBe(1)
    expect(glideEase(0.25)).toBeGreaterThan(0.6)
    expect(glideEase(0.75)).toBeGreaterThan(0.97)
  })
})

describe("pointerFrame", () => {
  it("draws it where its positions say, frame by frame", () => {
    const first = pointerFrame({}, { at: { x: 10, y: 20 }, now: 0 })
    const second = pointerFrame(first.track, { at: { x: 12, y: 21 }, now: 16 })

    expect([first.at, second.at]).toEqual([
      { x: 10, y: 20 },
      { x: 12, y: 21 }
    ])
    expect(second.gliding).toBe(false)
  })

  it("stays where it was left while off the canvas", () => {
    const first = pointerFrame({}, { at: { x: 40, y: 40 }, now: 0 })
    const off = pointerFrame(first.track, { at: { x: 40, y: 40 }, offCanvas: true, now: 100 })

    expect(off.at).toEqual({ x: 40, y: 40 })
    expect(off.track.wasOff).toBe(true)
  })

  it("glides back from where it was left, for longer the further it is, following them as they move", () => {
    const left: PointerTrack = { shown: { x: 0, y: 0 }, wasOff: true }
    const near = pointerFrame(left, { at: { x: 30, y: 40 }, now: 1000 })
    const far = pointerFrame(left, { at: { x: 300, y: 0 }, now: 1000 })

    expect(near.track.glide?.ms).toBe(280)
    expect(far.track.glide?.ms).toBe(540)
    expect(far.at).toEqual({ x: 0, y: 0 })

    const during = pointerFrame(far.track, { at: { x: 320, y: 0 }, now: 1135 })
    const after = pointerFrame(during.track, { at: { x: 330, y: 0 }, now: 1540 })

    expect(during.at.x).toBeGreaterThan(0.6 * 320)
    expect(during.at.x).toBeLessThan(320)
    expect(during.gliding).toBe(true)
    expect(after.at).toEqual({ x: 330, y: 0 })
    expect(after.gliding).toBe(false)
  })

  it("jumps back instead of gliding with reduced motion", () => {
    const back = pointerFrame(
      { shown: { x: 0, y: 0 }, wasOff: true },
      { at: { x: 300, y: 0 }, now: 1000, reduced: true }
    )

    expect(back.at).toEqual({ x: 300, y: 0 })
    expect(back.gliding).toBe(false)
  })
})
