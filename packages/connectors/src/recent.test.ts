import { describe, expect, it } from "vite-plus/test"
import { type RecentSearch, remember } from "./recent.ts"

function searched(query: string, connector = "mobbin", at = 0): RecentSearch {
  return { connector, kind: "screens", query, filters: { platform: "web" }, at }
}

describe("remember", () => {
  it("puts the newest first, and moves a search run again up with its latest filters", () => {
    const before = [searched("pricing page"), searched("sign in")]
    const again = { ...searched("Pricing page", "mobbin", 9), filters: { platform: "ios" } }

    expect(remember(before, again)).toEqual([again, searched("sign in")])
  })

  it("keeps each connector's latest few, without crowding out another's", () => {
    const mobbins = ["a", "b", "c"].map((query) => searched(query))
    const photo = searched("desk", "unsplash")

    expect(remember([...mobbins, photo], searched("d"), 3).map(({ query }) => query)).toEqual(["d", "a", "b", "desk"])
  })
})
