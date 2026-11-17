import { describe, expect, it } from "vite-plus/test"
import { coversDesigns, type PreviewEnd, previewLives, type PreviewSettled, settleWithinMs } from "./preview-life.ts"
import { clock } from "./test-clock.ts"

function living(random = () => 0) {
  const timers = clock()
  const settled: PreviewSettled[] = []
  const lives = previewLives({ timers, now: timers.now, random, settled: (ended) => settled.push(ended) })

  return { timers, settled, lives }
}

describe("previewLives", () => {
  it("settles a preview when its write arrives, recording one in ten", () => {
    const { timers, settled, lives } = living(() => 0.05)
    const ends: PreviewEnd[] = []
    const life = lives.start("layout", 2, "multiplayer", (how) => ends.push(how))
    timers.tick(900)
    // A write before the drop isn't the one that covers it.
    expect(life.wrote()).toBe(false)
    life.awaitWrite()
    timers.tick(100)
    expect(life.wrote()).toBe(true)
    expect(ends).toEqual(["write"])
    expect(settled).toEqual([
      { extension: "multiplayer", kind: "layout", items: 2, how: "write", durationMs: 1000, concurrent: 1 }
    ])
    timers.tick(settleWithinMs)
    expect(ends).toEqual(["write"])
  })

  it("leaves nine in ten settled by their write unrecorded", () => {
    const { settled, lives } = living(() => 0.5)
    const life = lives.start("board", 1, "core", () => undefined)
    life.awaitWrite()
    life.wrote()
    expect(settled).toEqual([])
  })

  it("gives up 2 s after the drop without a write, and always records it", () => {
    const { timers, settled, lives } = living(() => 0.99)
    const ends: PreviewEnd[] = []
    const life = lives.start("absolute", 1, "core", (how) => ends.push(how))
    life.awaitWrite()
    timers.tick(settleWithinMs - 1)
    expect(ends).toEqual([])
    timers.tick(1)
    expect(ends).toEqual(["timeout"])
    expect(settled.map((ended) => ended.how)).toEqual(["timeout"])
    expect(life.wrote()).toBe(false)
  })

  it("counts previews open at once, and ends each once", () => {
    const { settled, lives } = living()
    const ends: PreviewEnd[] = []
    const mia = lives.start("board", 1, "core", (how) => ends.push(how))
    const jonas = lives.start("layout", 1, "core", (how) => ends.push(how))
    expect(lives.open).toBe(2)
    mia.end("cancel")
    mia.end("disposed")
    jonas.end("disposed")
    expect(ends).toEqual(["cancel", "disposed"])
    expect(settled.map(({ how, concurrent }) => ({ how, concurrent }))).toEqual([
      { how: "cancel", concurrent: 2 },
      { how: "disposed", concurrent: 1 }
    ])
    expect(lives.open).toBe(0)
  })
})

describe("coversDesigns", () => {
  const empty = {
    designs: { added: [], removed: [], renamed: [], changed: [] },
    layers: { added: [], removed: [], moved: [], changed: [] }
  }

  const designs = new Set(["app.par#home"])

  it("takes someone else's write to a previewed design as covering it", () => {
    const moved = { ...empty, layers: { ...empty.layers, moved: [{ design: "app.par#home", node: "card" }] } }
    const position = [{ design: "app.par#home", fields: ["position"] }]
    const placed = { ...empty, designs: { ...empty.designs, changed: position } }

    expect(coversDesigns({ origin: "remote", ...moved }, designs)).toBe(true)
    expect(coversDesigns({ origin: "remote", ...placed }, designs)).toBe(true)
  })

  it("doesn't take this person's edits, or writes to other designs, as covering it", () => {
    const address = { design: "app.par#home", node: "card" }
    const styled = { ...empty, layers: { ...empty.layers, changed: [{ address, fields: ["style"] }] } }
    const elsewhere = { ...empty, layers: { ...empty.layers, moved: [{ design: "app.par#pricing", node: "card" }] } }
    expect(coversDesigns({ origin: "edit", ...styled }, designs)).toBe(false)
    expect(coversDesigns({ origin: "remote", ...elsewhere }, designs)).toBe(false)
  })
})
