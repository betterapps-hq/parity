import { describe, expect, it } from "vite-plus/test"
import { cacheCounter, frameFailure, restedFarWaitMs, watchRestedFar } from "./render-events.ts"

describe("frameFailure", () => {
  it("names a module that didn't load, as Chromium, Vite and Node word it", () => {
    for (const message of [
      "Failed to fetch dynamically imported module: http://localhost:5173/src/Card.tsx",
      'Failed to resolve import "./missing" from "src/Card.tsx". Does the file exist?',
      "Cannot find module './theme'",
      "The requested module '/src/ui.ts' does not provide an export named 'Card'"
    ]) {
      expect(frameFailure(message)).toBe("module not found")
    }
  })

  it("counts anything else as the frame's code throwing", () => {
    expect(frameFailure("Cannot read properties of undefined (reading 'map')")).toBe("render threw")
  })
})

describe("cacheCounter", () => {
  it("gives the session's totals and hit rates", () => {
    const counter = cacheCounter()
    counter.frame(true)
    counter.frame(true)
    counter.frame(false)
    counter.preview(false)
    expect(counter.report()).toEqual({
      frameHits: 2,
      frameMisses: 1,
      frameHitRate: 0.667,
      previewHits: 0,
      previewMisses: 1,
      previewHitRate: 0
    })
  })

  it("gives nothing until there's been a lookup since it last gave them, then the totals so far", () => {
    const counter = cacheCounter()
    expect(counter.report()).toBeUndefined()
    counter.preview(true)
    expect(counter.report()?.previewHits).toBe(1)
    expect(counter.report()).toBeUndefined()
    counter.preview(true)
    expect(counter.report()).toMatchObject({ previewHits: 2, previewMisses: 0, previewHitRate: 1 })
  })
})

describe("watchRestedFar", () => {
  const rest = { at: 1000, zoom: 0.1, pixelRatio: 1.5 }

  const showing = (bitmaps: number, skeletons = 0, placeholders = 0, live = 0) => ({
    bitmaps,
    skeletons,
    placeholders,
    live
  })

  it("ends once every frame in view shows its bitmap, with how long that took and what showed at rest", () => {
    const watch = watchRestedFar(rest)
    expect(watch.saw(1000, showing(10, 18, 2, 1))).toBeUndefined()
    expect(watch.saw(2500, showing(25, 6))).toBeUndefined()
    expect(watch.saw(4321.6, showing(31))).toEqual({
      zoom: 0.1,
      pixelRatio: 1.5,
      frames: 31,
      bitmaps: 31,
      skeletons: 0,
      placeholders: 0,
      live: 0,
      bitmapsAtRest: 10,
      skeletonsAtRest: 18,
      placeholdersAtRest: 2,
      liveAtRest: 1,
      untilBitmapsMs: 3322,
      ended: "bitmaps"
    })
  })

  it("gives up waiting for the bitmaps after a while, saying what still showed", () => {
    const watch = watchRestedFar(rest)
    watch.saw(1000, showing(0, 31))
    expect(watch.saw(1000 + restedFarWaitMs - 1, showing(4, 27))).toBeUndefined()
    const ended = watch.saw(1000 + restedFarWaitMs, showing(4, 27))
    expect(ended).toMatchObject({ frames: 31, bitmaps: 4, skeletons: 27, skeletonsAtRest: 31, ended: "waited" })
    expect(ended).not.toHaveProperty("untilBitmapsMs")
  })

  it("ends when the camera moves first", () => {
    const watch = watchRestedFar(rest)
    watch.saw(1000, showing(2, 5))
    expect(watch.moved(1600, showing(3, 4))).toMatchObject({
      bitmaps: 3,
      skeletons: 4,
      bitmapsAtRest: 2,
      ended: "moved"
    })
  })

  it("says it once", () => {
    const watch = watchRestedFar(rest)
    expect(watch.saw(1000, showing(5))).toMatchObject({ ended: "bitmaps", untilBitmapsMs: 0 })
    expect(watch.saw(1200, showing(5))).toBeUndefined()
    expect(watch.moved(1300, showing(5))).toBeUndefined()
  })

  it("takes what showed at rest from the first look that finds frames", () => {
    const watch = watchRestedFar(rest)
    expect(watch.saw(1000, showing(0))).toBeUndefined()
    expect(watch.saw(1250, showing(3, 8))).toBeUndefined()
    expect(watch.saw(2000, showing(11))).toMatchObject({ bitmapsAtRest: 3, skeletonsAtRest: 8, untilBitmapsMs: 1000 })
  })

  it("says nothing for a rest with no frames in view", () => {
    const watch = watchRestedFar(rest)
    expect(watch.saw(1000, showing(0))).toBeUndefined()
    expect(watch.saw(1000 + restedFarWaitMs, showing(0))).toBeUndefined()
    expect(watchRestedFar(rest).moved(1500, showing(0))).toBeUndefined()
  })
})
