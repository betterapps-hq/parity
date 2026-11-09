import { describe, expect, it } from "vite-plus/test"
import { type FindItem, findAnything, matchWords, rememberPick } from "./find-anything.ts"

type Group = "Designs" | "Layers" | "Edit" | "Tokens"

const groups: Group[] = ["Designs", "Layers", "Edit", "Tokens"]

const items: FindItem<Group>[] = [
  { id: "design:pricing", group: "Designs", label: "Pricing" },
  { id: "design:card", group: "Designs", label: "Plan card" },
  { id: "layer:pricing/title", group: "Layers", label: "Plans", keywords: "Pricing", searchOnly: true },
  { id: "layer:pricing/cta", group: "Layers", label: "Start free trial", keywords: "Pricing", searchOnly: true },
  { id: "layer:card/price", group: "Layers", label: "Price", keywords: "Plan card", searchOnly: true },
  { id: "action:duplicate", group: "Edit", label: "Duplicate", keywords: "Edit" },
  { id: "action:paste", group: "Edit", label: "Paste", keywords: "Edit" },
  { id: "token:--color-primary", group: "Tokens", label: "--color-primary", keywords: "Colors", searchOnly: true }
]

/** Each group's heading and labels, as the search lists them. */
const listed = (search: string, recent: string[] = [], limits = {}) =>
  findAnything(items, search, { recent, groups, limits }).map(
    ({ group, items: found }) => `${group}: ${found.map((item) => item.label).join(", ")}`
  )

describe("matching by the start of words", () => {
  it("ranks a name starting with what's typed over one with a word starting it, and rejects letters scattered", () => {
    expect(matchWords("New screen Object", "new")).toBe(1)
    expect(matchWords("New screen Object", "screen")).toBe(0.5)
    expect(matchWords("Interact with previews Tools", "new")).toBe(0)
  })

  it("matches each typed word in any order, ignoring case and spaces around", () => {
    expect(matchWords("Zoom to fit View", "fit zoom")).toBe(0.5)
    expect(matchWords("Zoom to fit View", "  ZOOM to ")).toBe(1)
    expect(matchWords("Zoom to fit View", "zoom out")).toBe(0)
  })

  it("splits token names at their dashes, so a word of one finds it", () => {
    expect(matchWords("--color-primary Colors", "primary")).toBe(0.5)
  })

  it("lists everything before anything's typed", () => {
    expect(matchWords("Undo Edit", "")).toBe(1)
  })
})

describe("finding anything", () => {
  it("lists designs and actions before anything's typed, leaving layers and tokens for a search", () => {
    expect(listed("")).toEqual(["Designs: Pricing, Plan card", "Edit: Duplicate, Paste"])
  })

  it("lists each kind's matches under its heading, best first, and leaves out a heading with none", () => {
    expect(listed("pri")).toEqual([
      "Designs: Pricing",
      "Layers: Price, Plans, Start free trial",
      "Tokens: --color-primary"
    ])
  })

  it("matches a layer by its design's name too", () => {
    expect(listed("plan card")).toEqual(["Designs: Plan card", "Layers: Price"])
  })

  it("caps a group while searching, keeping its best", () => {
    expect(listed("pri", [], { Layers: 1 })).toContain("Layers: Price")
  })

  it("puts recent picks first, latest first, and doesn't list them again below", () => {
    expect(listed("", ["action:paste", "design:card"])).toEqual([
      "Recent: Paste, Plan card",
      "Designs: Pricing",
      "Edit: Duplicate"
    ])
  })

  it("keeps recent picks that match while searching, including layers, and drops ones that are gone", () => {
    expect(listed("p", ["layer:card/price", "design:gone", "action:duplicate"])).toEqual([
      "Recent: Price",
      "Designs: Pricing, Plan card",
      "Layers: Plans, Start free trial",
      "Edit: Paste",
      "Tokens: --color-primary"
    ])
  })
})

describe("remembering picks", () => {
  it("puts the latest first, once, and keeps at most six", () => {
    expect(rememberPick(["a", "b", "c"], "b")).toEqual(["b", "a", "c"])
    expect(rememberPick(["a", "b", "c", "d", "e", "f"], "g")).toEqual(["g", "a", "b", "c", "d", "e"])
  })
})
