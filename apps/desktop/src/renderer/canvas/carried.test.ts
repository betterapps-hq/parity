import { describe, expect, it } from "vite-plus/test"
import { carriedPictures, type Timers } from "./carried.ts"

/** Timers that run only when the test moves the clock on. */
function clock(): Timers & { tick(ms: number): void } {
  let now = 0
  let next = 1
  const waiting = new Map<number, { at: number; run: () => void }>()

  return {
    set(run, ms) {
      const id = next++
      waiting.set(id, { at: now + ms, run })

      return id
    },
    clear(id) {
      waiting.delete(id)
    },
    tick(ms) {
      now += ms

      for (const [id, { at, run }] of waiting) {
        if (at <= now) {
          waiting.delete(id)
          run()
        }
      }
    }
  }
}

// SAFETY: a carried picture only compares its area by identity, which any object stands in for in Node.
const area = {} as Element

function pickedUp() {
  const timers = clock()
  const pictures = carriedPictures<string>(timers)
  pictures.pickUp({ area, picture: "Churn", at: { x: 201, y: 42 }, grab: { x: 50, y: 26 } })

  return { timers, pictures }
}

describe("carriedPictures", () => {
  it("carries a picture picked up, following the pointer", () => {
    const { pictures } = pickedUp()
    expect(pictures.store.get()).toEqual({
      area,
      picture: "Churn",
      at: { x: 201, y: 42 },
      grab: { x: 50, y: 26 },
      phase: "carrying"
    })
    pictures.carry({ x: 150, y: 50 })
    expect(pictures.store.get()).toMatchObject({ at: { x: 150, y: 50 }, phase: "carrying" })
  })

  it("flies a dropped picture into where it lands for 180 ms, then it's gone and what waited runs", () => {
    const { timers, pictures } = pickedUp()
    const landed: string[] = []
    pictures.letGo("dropping", { x: 12, y: 42 }, false, () => landed.push("landed"))
    expect(pictures.store.get()).toMatchObject({ at: { x: 12, y: 42 }, phase: "dropping" })
    // It no longer follows the pointer.
    pictures.carry({ x: 300, y: 300 })
    expect(pictures.store.get()?.at).toEqual({ x: 12, y: 42 })
    timers.tick(179)
    expect(landed).toEqual([])
    timers.tick(1)
    expect(landed).toEqual(["landed"])
    expect(pictures.store.get()).toBeUndefined()
  })

  it("keeps where a dropped picture lands while it flies there, for its outline", () => {
    const { timers, pictures } = pickedUp()
    const spot = { x: 12, y: 42, w: 87, h: 51, radius: 8 }
    pictures.letGo("dropping", { x: 12, y: 42 }, false, () => undefined, spot)
    expect(pictures.store.get()).toMatchObject({ phase: "dropping", spot })
    timers.tick(180)
    expect(pictures.store.get()).toBeUndefined()
  })

  it("flies a cancelled picture back for 260 ms", () => {
    const { timers, pictures } = pickedUp()
    const landed: string[] = []
    pictures.letGo("cancelling", { x: 201, y: 42 }, false, () => landed.push("back"))
    expect(pictures.store.get()).toMatchObject({ at: { x: 201, y: 42 }, phase: "cancelling" })
    timers.tick(259)
    expect(landed).toEqual([])
    timers.tick(1)
    expect(landed).toEqual(["back"])
    expect(pictures.store.get()).toBeUndefined()
  })

  it("lands at once with reduced motion", () => {
    const { pictures } = pickedUp()
    const landed: string[] = []
    pictures.letGo("dropping", { x: 12, y: 42 }, true, () => landed.push("landed"))
    expect(landed).toEqual(["landed"])
    expect(pictures.store.get()).toBeUndefined()
  })

  it("lands at once when nothing was carried, so what waits isn't left waiting", () => {
    const pictures = carriedPictures<string>(clock())
    const landed: string[] = []
    pictures.letGo("cancelling", { x: 0, y: 0 }, false, () => landed.push("landed"))
    expect(landed).toEqual(["landed"])
  })

  it("lands a flight still going when another picture is picked up, once", () => {
    const { timers, pictures } = pickedUp()
    const landed: string[] = []
    pictures.letGo("dropping", { x: 12, y: 42 }, false, () => landed.push("first"))
    pictures.pickUp({ area, picture: "Users", at: { x: 107, y: 42 }, grab: { x: 10, y: 10 } })
    expect(landed).toEqual(["first"])
    expect(pictures.store.get()).toMatchObject({ picture: "Users", phase: "carrying" })
    timers.tick(500)
    expect(landed).toEqual(["first"])
    expect(pictures.store.get()).toMatchObject({ picture: "Users", phase: "carrying" })
  })

  it("lands a flight at once when it's finished", () => {
    const { timers, pictures } = pickedUp()
    const landed: string[] = []
    pictures.letGo("cancelling", { x: 201, y: 42 }, false, () => landed.push("back"))
    pictures.finish()
    expect(landed).toEqual(["back"])
    expect(pictures.store.get()).toBeUndefined()
    timers.tick(500)
    expect(landed).toEqual(["back"])
  })
})
