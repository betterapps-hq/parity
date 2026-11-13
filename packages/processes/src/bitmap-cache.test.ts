import { describe, expect, it } from "vite-plus/test"
import { type CachedFile, cacheRemovals } from "./bitmap-cache.ts"

const day = 24 * 60 * 60 * 1000
const now = 100 * day
const limits = { cap: 1000, keep: 800, maxAge: 30 * day, partialAge: 60_000 }

function file(path: string, project: string, size: number, used: number, partial?: boolean): CachedFile {
  const cached: CachedFile = { path, project, size, used }

  if (partial) {
    cached.partial = partial
  }

  return cached
}

describe("cacheRemovals", () => {
  it("removes nothing while the cache is under its cap and every project was used lately", () => {
    const files = [file("a/1", "a", 300, now - day), file("b/1", "b", 300, now - 2 * day)]
    expect(cacheRemovals(files, now, limits)).toEqual([])
  })

  it("removes a whole project none of whose bitmaps was used within the age limit", () => {
    const files = [
      file("old/1", "old", 10, now - 40 * day),
      file("old/2", "old", 10, now - 31 * day),
      file("new/1", "new", 10, now - 40 * day),
      file("new/2", "new", 10, now - day)
    ]

    // A project with one recent bitmap keeps its older ones too, until the cap says otherwise.
    expect(cacheRemovals(files, now, limits).sort()).toEqual(["old/1", "old/2"])
  })

  it("removes the least recently used past the cap, down to what it keeps", () => {
    const files = [
      file("a/1", "a", 400, now - 5000),
      file("a/2", "a", 400, now - 1000),
      file("b/1", "b", 400, now - 3000)
    ]

    // 1,200 bytes over a 1,000 cap: the oldest goes, leaving 800.
    expect(cacheRemovals(files, now, limits)).toEqual(["a/1"])
  })

  it("counts what the age limit removed before the cap", () => {
    const files = [file("old/1", "old", 600, now - 40 * day), file("a/1", "a", 600, now - 1000)]
    expect(cacheRemovals(files, now, limits)).toEqual(["old/1"])
  })

  it("removes a partial file a write left behind, and leaves one still being written", () => {
    const files = [
      file("a/1.tmp", "a", 50, now - 120_000, true),
      file("a/2.tmp", "a", 50, now - 1000, true),
      file("a/3", "a", 50, now - 1000)
    ]

    expect(cacheRemovals(files, now, limits)).toEqual(["a/1.tmp"])
  })

  it("doesn't let a partial file keep its project's old bitmaps", () => {
    const files = [file("old/1", "old", 10, now - 40 * day), file("old/2.tmp", "old", 10, now - 1000, true)]
    expect(cacheRemovals(files, now, limits)).toEqual(["old/1"])
  })
})
