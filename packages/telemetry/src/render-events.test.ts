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
      frames: { hits: 2, misses: 1, hitRate: 0.667 },
      previews: { hits: 0, misses: 1, hitRate: 0 }
    })
  })

  it("gives nothing until there's been a lookup since it last gave them, then the totals so far", () => {
    const counter = cacheCounter()
    expect(counter.report()).toBeUndefined()
    counter.preview(true)
    expect(counter.report()?.previews.hits).toBe(1)
    expect(counter.report()).toBeUndefined()
    counter.preview(true)
    expect(counter.report()?.previews).toEqual({ hits: 2, misses: 0, hitRate: 1 })
  })
})
