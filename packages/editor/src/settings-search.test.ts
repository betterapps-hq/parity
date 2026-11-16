import { describe, expect, it } from "vite-plus/test"
import { listInWords, matchesWords, rankSettings, type SearchableSetting } from "./settings-search.ts"

const settings: SearchableSetting[] = [
  {
    id: "theme",
    label: "Theme",
    keywords: ["dark", "light"],
    detail: "Previews show their mode's theme.",
    place: "General"
  },
  { id: "flag", label: "App lenses", detail: "Read from the project as Storybook is.", place: "Experiments" },
  { id: "configDir", label: "Config folder", place: "Storybook" },
  { id: "openIn", label: "Open stories in", place: "Storybook" },
  { id: "snapping", label: "Snap to screens and components", place: "Canvas" }
]

const ids = (query: string) => rankSettings(settings, query).map((match) => match.id)

describe("matching words", () => {
  it("matches when every typed word starts a word, in any order", () => {
    expect(matchesWords("Snap to screens and components", "comp snap")).toBe(true)
    expect(matchesWords("Snap to screens and components", "naps")).toBe(false)
    expect(matchesWords("Theme", "  ")).toBe(false)
  })
})

describe("ranking settings", () => {
  it("finds nothing for an empty search", () => {
    expect(ids(" ")).toEqual([])
  })

  it("puts a label's start before a word inside it", () => {
    expect(ids("co")).toEqual(["configDir", "snapping"])
  })

  it("finds a setting by another word for it and says which", () => {
    expect(rankSettings(settings, "dark")).toEqual([{ id: "theme", score: 2, keyword: "dark" }])
  })

  it("puts where a setting is before a description that names it", () => {
    expect(ids("story")).toEqual(["configDir", "openIn", "flag"])
  })
})

describe("listing values", () => {
  it("joins them as a sentence does", () => {
    expect(listInWords([])).toBe("")
    expect(listInWords(["PNG 1x"])).toBe("PNG 1x")
    expect(listInWords(["PNG 1x", "PNG 2x"])).toBe("PNG 1x and PNG 2x")
    expect(listInWords(["A", "B", "C"])).toBe("A, B and C")
  })
})
