import { describe, expect, it } from "vite-plus/test"
import { carriedPictures, carriedSet } from "./carried.ts"
import { clock } from "./test-clock.ts"

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

describe("carriedSet", () => {
  it("carries a picture for each drag at once, each flying on its own", () => {
    const timers = clock()
    const set = carriedSet<string>(timers)
    // SAFETY: a carried picture keeps whoever carries it as it's given, without reading their palette.
    const by = { palette: { color: "red" } as never, label: "Mia" }
    set.of("local").pickUp({ area, picture: "Churn", at: { x: 0, y: 0 }, grab: { x: 0, y: 0 } })
    set.of("preview-1").pickUp({ area, picture: "Users", at: { x: 50, y: 0 }, grab: { x: 0, y: 0 }, by })
    expect([...set.store.get().keys()]).toEqual(["local", "preview-1"])
    set.of("preview-1").carry({ x: 60, y: 10 })
    expect(set.store.get().get("preview-1")).toMatchObject({ at: { x: 60, y: 10 }, by })
    expect(set.store.get().get("local")?.at).toEqual({ x: 0, y: 0 })

    const landed: string[] = []
    set.of("local").letGo("dropping", { x: 12, y: 0 }, false, () => landed.push("local"))
    set.of("preview-1").letGo("cancelling", { x: 50, y: 0 }, false, () => landed.push("preview"))
    timers.tick(180)
    expect(landed).toEqual(["local"])
    expect([...set.store.get().keys()]).toEqual(["preview-1"])
    timers.tick(80)
    expect(landed).toEqual(["local", "preview"])
    expect(set.store.get().size).toBe(0)
  })

  it("lands a forgotten drag's flight at once and leaves the others", () => {
    const timers = clock()
    const set = carriedSet<string>(timers)
    set.of("local").pickUp({ area, picture: "Churn", at: { x: 0, y: 0 }, grab: { x: 0, y: 0 } })
    set.of("preview-1").pickUp({ area, picture: "Users", at: { x: 50, y: 0 }, grab: { x: 0, y: 0 } })
    const landed: string[] = []
    set.of("preview-1").letGo("dropping", { x: 0, y: 0 }, false, () => landed.push("preview"))
    set.forget("preview-1")
    expect(landed).toEqual(["preview"])
    expect([...set.store.get().keys()]).toEqual(["local"])
  })
})
