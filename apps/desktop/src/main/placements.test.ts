import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { localPlacements, type Placement } from "./placements.ts"

function placed(id: string, design = "D:/shop::home"): Placement {
  return { connector: "unsplash", id, kind: "photos", design, from: "agent", at: 1 }
}

function fileIn(): string {
  return join(mkdtempSync(join(tmpdir(), "parity-placements-")), "data", "connector-placements.json")
}

describe("localPlacements", () => {
  it("counts a result once for each design it goes into, across copies of the app", async () => {
    const file = fileIn()
    const first = localPlacements(file)

    expect(await Promise.all([first.add(placed("a")), first.add(placed("a"))])).toEqual([true, false])
    expect(await localPlacements(file).add(placed("a"))).toBe(false)
    expect(await localPlacements(file).add(placed("a", "D:/shop::pricing"))).toBe(true)
  })

  it("counts again after a file it can't read, rather than not at all", async () => {
    const file = fileIn()
    await localPlacements(file).add(placed("a"))
    writeFileSync(file, "not json")

    expect(await localPlacements(file).add(placed("a"))).toBe(true)
  })
})
