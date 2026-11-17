import { describe, expect, it } from "vite-plus/test"
import type { Layout } from "./layout.ts"
import type { Lens } from "./lens.ts"
import { defaultLayout, type JsonValue, readLayout, saveLayout } from "./saved.ts"

const lenses: Lens[] = [
  { id: "screens", name: "Screens", icon: "app-window", order: 2 },
  { id: "pages", name: "Pages", icon: "route", order: 1 },
  { id: "data", name: "Data", icon: "database", order: 3 }
]

describe("saving a layout", () => {
  it("keeps each group's tabs and which is in front, and focus by its place, without the dock's ids", () => {
    const layout: Layout = {
      groups: [
        { id: "g1", where: "main", tabs: ["pages", "screens"], open: "screens" },
        { id: "g2", where: "main", tabs: [] },
        { id: "g3", where: "window", tabs: ["data"], open: "data" }
      ],
      focus: "g3"
    }

    expect(saveLayout(layout)).toEqual({
      groups: [
        { where: "main", tabs: ["pages", "screens"], open: "screens" },
        { where: "window", tabs: ["data"], open: "data" }
      ],
      focus: 1
    })
  })
})

describe("reading a saved layout", () => {
  it("reads one back as it was saved", () => {
    const saved = {
      groups: [
        { where: "main", tabs: ["pages", "screens"], open: "screens" },
        { where: "window", tabs: ["data"], open: "data" }
      ],
      focus: 1
    }

    expect(readLayout(saved, lenses)).toEqual(saved)
  })

  it("drops lenses that are gone, and groups left empty, moving focus and the front tab with them", () => {
    const saved: JsonValue = {
      groups: [
        { where: "main", tabs: ["erd"] },
        { where: "main", tabs: ["routes", "pages", "data"], open: "routes" }
      ],
      focus: 0
    }

    expect(readLayout(saved, lenses)).toEqual({
      groups: [{ where: "main", tabs: ["pages", "data"], open: "pages" }],
      focus: 0
    })
  })

  it("keeps a lens in the first group that has it, since it's open once", () => {
    const saved = {
      groups: [
        { where: "main", tabs: ["pages"] },
        { where: "main", tabs: ["pages", "data"] }
      ],
      focus: 1
    }

    expect(readLayout(saved, lenses)).toEqual({
      groups: [
        { where: "main", tabs: ["pages"], open: "pages" },
        { where: "main", tabs: ["data"], open: "data" }
      ],
      focus: 1
    })
  })

  it("falls back to the project's default when it can't be read, or no lens it had is left", () => {
    const first = { groups: [{ where: "main", tabs: ["pages"], open: "pages" }], focus: 0 }

    expect(defaultLayout(lenses)).toEqual(first)
    expect(readLayout(undefined, lenses)).toEqual(first)
    expect(readLayout({ groups: "pages" }, lenses)).toEqual(first)
    expect(readLayout({ groups: [{ where: "main", tabs: ["erd"] }] }, lenses)).toEqual(first)
    expect(readLayout(undefined, lenses, { groups: [] })).toEqual({ groups: [] })
  })

  it("keeps a layout saved with every tab closed empty", () => {
    expect(readLayout({ groups: [] }, lenses)).toEqual({ groups: [] })
  })

  it("starts a project the lenses have nothing for on the first lens it has", () => {
    const missing = { title: "No OpenAPI document", description: "Add one.", action: "Choose a document…" }
    const withPagesMissing = lenses.map((lens) => (lens.id === "pages" ? { ...lens, unavailable: missing } : lens))

    expect(defaultLayout(withPagesMissing).groups[0]?.tabs).toEqual(["screens"])
    expect(defaultLayout([])).toEqual({ groups: [] })
  })
})
