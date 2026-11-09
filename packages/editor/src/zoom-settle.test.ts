import { describe, expect, it } from "vite-plus/test"
import { holdZoom, type ZoomHeld, zoomHeldFrom, zoomSettle, zoomSettled } from "./zoom-settle.ts"

/** The zoom held through animation frames at these times, each with the zoom the frame shows. */
function frames(start: ZoomHeld, shown: [now: number, zoom: number][]): ZoomHeld {
  return shown.reduce((held, [now, zoom]) => holdZoom(held, zoom, now), start)
}

describe("zoomSettled", () => {
  it("settles once the zoom holds for three frames and 150 milliseconds", () => {
    const held = frames(zoomHeldFrom(1, 0), [
      [16, 1],
      [33, 1],
      [50, 1]
    ])

    expect(zoomSettled(held, 50)).toBe(false)

    const later = frames(held, [
      [133, 1],
      [150, 1]
    ])

    expect(zoomSettled(later, 150)).toBe(true)
  })

  it("starts again whenever the zoom changes", () => {
    const held = frames(zoomHeldFrom(1, 0), [
      [100, 1],
      [200, 1],
      [300, 1.1]
    ])

    expect(held).toEqual({ zoom: 1.1, since: 300, frames: 0 })
    expect(zoomSettled(held, 300)).toBe(false)
  })

  it("doesn't settle between slow frames that each zoom, however long they take (PAR-655)", () => {
    // On a busy machine frames took 150 to 300 ms, longer than tldraw's camera timeout, and each moved the zoom on.
    let held = zoomHeldFrom(1, 0)

    for (let frame = 1; frame <= 15; frame++) {
      const now = frame * 280
      held = holdZoom(held, 1 + frame / 10, now)
      expect(zoomSettled(held, now)).toBe(false)
    }

    // Once it stops, it settles after the frames it has to hold for.
    const end = 15 * 280

    for (let frame = 1; frame < zoomSettle.frames; frame++) {
      held = holdZoom(held, held.zoom, end + frame * 280)
    }

    expect(zoomSettled(held, end + 2 * 280)).toBe(false)
    held = holdZoom(held, held.zoom, end + 3 * 280)
    expect(zoomSettled(held, end + 3 * 280)).toBe(true)
  })

  it("doesn't settle between a mouse wheel's notches when frames are quick", () => {
    // At 60 frames a second, a notch every 100 ms leaves five frames without one, but not 150 ms.
    let held = zoomHeldFrom(1, 0)

    for (let now = 16; now <= 1000; now += 16) {
      const zoom = 1 + Math.floor(now / 100) / 10
      held = holdZoom(held, zoom, now)
      expect(zoomSettled(held, now)).toBe(false)
    }
  })
})
