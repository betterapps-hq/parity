import { describe, expect, it } from "vite-plus/test"
import { cacheCounter, frameFailure } from "./render-events.ts"

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
