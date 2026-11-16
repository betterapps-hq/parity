import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { RecentSearch } from "@parity-app/connectors"
import { describe, expect, it } from "vite-plus/test"
import { localHistory } from "./search-history.ts"

function searched(query: string, at = 0): RecentSearch {
  return { connector: "mobbin", kind: "screens", query, filters: { platform: "web" }, at }
}

function fileIn(): string {
  return join(mkdtempSync(join(tmpdir(), "parity-history-")), "data", "recent-searches.json")
}

describe("localHistory", () => {
  it("keeps searches across copies of the app, newest first", async () => {
    const file = fileIn()

    await localHistory(file).add(searched("pricing page", 1))
    const second = localHistory(file)
    await Promise.all([second.add(searched("sign in", 2)), second.add(searched("billing", 3))])

    expect((await localHistory(file).list()).map(({ query }) => query)).toEqual(["billing", "sign in", "pricing page"])
  })

  it("starts again from a file it can't read, and leaves out a search that doesn't read", async () => {
    const broken = fileIn()
    const mixed = fileIn()
    await localHistory(broken).add(searched("x"))
    writeFileSync(broken, "not json")
    await localHistory(mixed).add(searched("x"))
    writeFileSync(mixed, JSON.stringify({ searches: [searched("kept"), { query: 3 }] }))

    expect(await localHistory(broken).list()).toEqual([])
    expect(await localHistory(mixed).list()).toEqual([searched("kept")])
  })
})
