import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { redrawFrames, redrawingAttribute, redrawLayer } from "./layer-redraw.ts"

/** A stand-in for the camera's layer: which attributes it has. */
class Layer {
  attributes = new Set<string>()
  toggleAttribute(name: string, force?: boolean): boolean {
    const on = force ?? !this.attributes.has(name)
    if (on) this.attributes.add(name)
    else this.attributes.delete(name)
    return on
  }
}

/** Animation frames waiting to run, run one frame at a time. */
let frames = new Map<number, FrameRequestCallback>()
let next = 0

function runFrame(): void {
  const due = frames
  frames = new Map()
  for (const callback of due.values()) callback(performance.now())
}

describe("redrawLayer", () => {
  beforeEach(() => {
    frames = new Map()
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++next, callback)
      return next
    })
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("takes the layer off its own compositing for a couple of frames, then gives it back", () => {
    const layer = new Layer()
    redrawLayer(layer)
    for (let frame = 0; frame < redrawFrames; frame++) {
      expect(layer.attributes.has(redrawingAttribute)).toBe(true)
      runFrame()
    }
    expect(layer.attributes.has(redrawingAttribute)).toBe(false)
    expect(frames.size).toBe(0)
  })

  it("ends at once when stopped, waiting on no more frames", () => {
    const layer = new Layer()
    const end = redrawLayer(layer)
    end()
    expect(layer.attributes.has(redrawingAttribute)).toBe(false)
    expect(frames.size).toBe(0)
  })

  it("starts over when a redraw stopped for a new one", () => {
    const layer = new Layer()
    const first = redrawLayer(layer)
    runFrame()
    first()
    redrawLayer(layer)
    runFrame()
    expect(layer.attributes.has(redrawingAttribute)).toBe(true)
    runFrame()
    expect(layer.attributes.has(redrawingAttribute)).toBe(false)
  })
})
