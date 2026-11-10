import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { localPlacements, type Placement } from "./placements.ts"

function placed(id: string, design = "home-key"): Placement {
  return {
    found: {
      connector: "unsplash",
      id,
      kind: "photos",
      title: "Desk",
      image: { url: "https://images.unsplash.com/photo-1" },
      link: "https://unsplash.com/photos/1",
      credit: []
    },
    design,
    from: "agent",
    at: 1,
    told: false
  }
}

function fileIn(): string {
  return join(mkdtempSync(join(tmpdir(), "parity-placements-")), "data", "connector-placements.json")
}

describe("localPlacements", () => {
  it("counts a result once for each design it goes into, across copies of the app", async () => {
    const file = fileIn()
    const first = localPlacements(file)
    const second = localPlacements(file)

    expect(await Promise.all([first.add(placed("a")), first.add(placed("a"))])).toEqual([true, false])
    expect(await second.add(placed("b"))).toBe(true)
    expect(await first.add(placed("a", "pricing-key"))).toBe(true)
    expect((await localPlacements(file).untold()).map(({ found, design }) => [found.id, design])).toEqual([
      ["a", "pricing-key"],
      ["b", "home-key"],
      ["a", "home-key"]
    ])
  })

  it("keeps which sources took their report, to tell the others again", async () => {
    const file = fileIn()
    const log = localPlacements(file)
    await log.add(placed("a"))
    await log.add(placed("b"))
    await log.told(placed("a"))

    expect((await localPlacements(file).untold()).map(({ found }) => found.id)).toEqual(["b"])
  })

  it("counts again after a file it can't read, rather than not at all", async () => {
    const file = fileIn()
    await localPlacements(file).add(placed("a"))
    writeFileSync(file, "not json")

    expect(await localPlacements(file).add(placed("a"))).toBe(true)
  })
})
