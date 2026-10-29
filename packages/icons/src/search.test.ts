import { describe, expect, it } from "vitest"
import { iconEntries } from "./entries.ts"
import { editDistance, iconIndex, searchIcons, words } from "./search.ts"

const lucide = iconIndex(
  [
    "X",
    "Box",
    "Axe",
    "CreditCard",
    "SquarePen",
    "Pencil",
    "ArrowDown",
    "CircleArrowDown",
    "Settings",
    "Ear",
    "Album"
  ].map((name) => ({ label: name, name })),
  { SquarePen: ["Edit", "PenBox", "LucideEdit", "SquarePenIcon"], Album: ["SquareBookmark", "AlbumIcon"] },
  { X: ["cancel", "close", "delete", "remove"], Settings: ["cog", "edit", "gear", "preferences"] }
)
const labels = (query: string) => searchIcons(lucide, query).map((entry) => entry.label)

describe("words", () => {
  it("splits names at capitals and digits, and queries at spaces and dashes", () => {
    expect(words("ArrowDown01Icon")).toEqual(["arrow", "down", "01", "icon"])
    expect(words("IconHTTPGet")).toEqual(["icon", "http", "get"])
    expect(words(" sign-out ")).toEqual(["sign", "out"])
  })
})

describe("searchIcons", () => {
  it("puts an icon named exactly what was typed first", () => {
    expect(labels("x")[0]).toBe("X")
  })

  it("ranks a whole word over the start of one, and letters inside a word last", () => {
    expect(labels("pen")).toEqual(["SquarePen", "Pencil"])
    expect(labels("edit").at(-1)).toBe("CreditCard")
  })

  it("takes the query's words in any order", () => {
    expect(labels("down arrow")).toEqual(["ArrowDown", "CircleArrowDown"])
    expect(labels("arrowdown")[0]).toBe("ArrowDown")
  })

  it("finds icons by their other names", () => {
    expect(labels("edit")).toContain("SquarePen")
    expect(labels("bookmark")).toEqual(["Album"])
  })

  it("finds icons by the tags their set publishes, the first tags counting most", () => {
    expect(labels("close")).toEqual(["X"])
    expect(labels("gear")).toEqual(["Settings"])
    const tagged = iconIndex(
      ["Rose", "Calendar"].map((name) => ({ label: name, name })),
      {},
      { Rose: ["flower", "petals", "gift", "date"], Calendar: ["date", "month"] }
    )
    expect(searchIcons(tagged, "date").map((entry) => entry.label)).toEqual(["Calendar", "Rose"])
  })

  it("ranks a word the name says over one a later tag says", () => {
    const index = iconIndex(
      ["X", "PanelLeftClose", "ShoppingCart", "Van"].map((name) => ({ label: name, name })),
      {},
      { X: ["cancel", "close"], ShoppingCart: ["trolley", "cart"], Van: ["minivan", "cart"] }
    )
    expect(searchIcons(index, "close").map((entry) => entry.label)).toEqual(["X", "PanelLeftClose"])
    expect(searchIcons(index, "cart").map((entry) => entry.label)).toEqual(["ShoppingCart", "Van"])
  })

  it("adds icons only some words find when every word finds too few", () => {
    const index = iconIndex(
      ["Moon", "Sun", "Eclipse"].map((name) => ({ label: name, name })),
      {},
      { Moon: ["dark", "night"], Eclipse: ["dark mode", "theme"] }
    )
    expect(searchIcons(index, "dark mode").map((entry) => entry.label)).toEqual(["Eclipse", "Moon"])
  })

  it("forgives a typo in a longer word, but not in a short one", () => {
    expect(labels("setings")).toEqual(["Settings"])
    expect(labels("gaer")).toEqual([])
  })

  it("leaves out words nearly every icon has", () => {
    const tabler = iconIndex(
      ["IconHome", "IconUser", "IconBell"].map((name) => ({ label: name, name })),
      {},
      {}
    )
    expect(searchIcons(tabler, "icon")).toEqual([])
    expect(searchIcons(tabler, "home").map((entry) => entry.label)).toEqual(["IconHome"])
  })

  it("lists every icon for an empty query", () => {
    expect(searchIcons(lucide, "  ")).toHaveLength(11)
  })
})

describe("editDistance", () => {
  it("counts a swap of neighbours once and stops past the limit", () => {
    expect(editDistance("calender", "calendar", 2)).toBe(1)
    expect(editDistance("gaer", "gear", 1)).toBe(1)
    expect(editDistance("settings", "x", 2)).toBe(3)
  })
})

describe("iconEntries", () => {
  it("lists each icon once in the chosen style, for sets that write styles and sizes into names", () => {
    const fluent = {
      render: "export" as const,
      variants: {
        pattern: "^(?<name>.+?)(?<size>\\d+)?(?<style>Regular|Filled)$",
        styles: ["Regular", "Filled"],
        default: { style: "Regular" }
      }
    }
    const names = ["AddRegular", "AddFilled", "Add24Regular", "Bell"]
    expect(iconEntries(names, fluent, "Filled")).toEqual([{ label: "Add", name: "AddFilled" }])
  })

  it("sets the style prop for sets that take one", () => {
    const phosphor = {
      render: "export" as const,
      variants: { prop: "weight", styles: ["regular", "bold"], default: { style: "regular" } }
    }
    expect(iconEntries(["Gear"], phosphor, "bold")).toEqual([
      { label: "Gear", name: "Gear", props: { weight: "bold" } }
    ])
    expect(iconEntries(["Gear"], phosphor, "regular")).toEqual([{ label: "Gear", name: "Gear" }])
  })
})
