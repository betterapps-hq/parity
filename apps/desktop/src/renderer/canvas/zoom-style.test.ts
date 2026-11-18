import { atom } from "tldraw"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { followZoom } from "./zoom-style.ts"

// A camera mid-zoom: tldraw's efficient zoom stays where the zoom started until the camera stops.
const zoom = atom("zoom", 1)
const efficient = atom("efficient zoom", 1)
const camera = { getZoomLevel: () => zoom.get(), getEfficientZoomLevel: () => efficient.get() }

const stops: (() => void)[] = []

function follow(near?: ReturnType<typeof atom<boolean>>) {
  const applied: number[] = []
  stops.push(followZoom(camera, near, (at) => applied.push(at)))

  return applied
}

afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop()
  }

  zoom.set(1)
  efficient.set(1)
})

describe("followZoom", () => {
  it("follows every frame of a zoom on a board near the view, and outside a board", () => {
    const near = follow(atom("near", true))
    const loose = follow()
    zoom.set(0.8)
    zoom.set(0.6)

    expect(near).toEqual([1, 0.8, 0.6])
    expect(loose).toEqual([1, 0.8, 0.6])
  })

  it("waits on a board away from the view until the zoom settles", () => {
    const applied = follow(atom("near", false))
    zoom.set(0.8)
    zoom.set(0.6)

    expect(applied).toEqual([1])

    efficient.set(0.6)

    expect(applied).toEqual([1, 0.6])
  })

  it("catches up mid-zoom as its board comes near, then follows", () => {
    const near = atom("near", false)
    const applied = follow(near)
    zoom.set(0.8)
    near.set(true)
    zoom.set(0.6)

    expect(applied).toEqual([1, 0.8, 0.6])
  })

  it("doesn't apply a zoom twice as its board goes away and comes back", () => {
    const near = atom("near", true)
    const applied = follow(near)
    near.set(false)
    near.set(true)
    efficient.set(0.5)
    efficient.set(1)

    expect(applied).toEqual([1])
  })
})
