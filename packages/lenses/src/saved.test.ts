import { describe, expect, it } from "vite-plus/test"
import type { Layout } from "./layout.ts"
import type { Lens } from "./lens.ts"
import { defaultLayout, type JsonValue, readLayout, saveLayout } from "./saved.ts"

const lenses: Lens[] = [
  { id: "screens", name: "Screens", icon: "app-window", order: 2 },
  { id: "pages", name: "Pages", icon: "route", order: 1 },
  { id: "data", name: "Data", icon: "database", order: 3 },
  { id: "stories", name: "Stories", icon: "book-open", order: 4 }
]

const place = { x: 1600, y: 120, width: 1100, height: 720 }

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

  it("keeps how the main window is split, by each group's place, and where each window is", () => {
    const layout: Layout = {
      groups: [
        { id: "g1", where: "main", tabs: ["pages"], open: "pages" },
        { id: "g2", where: "main", tabs: [] },
        { id: "g3", where: "main", tabs: ["screens"], open: "screens" },
        { id: "g4", where: "window", tabs: ["data"], open: "data" }
      ],
      focus: "g1"
    }

    const splits = {
      across: "row" as const,
      parts: [
        { group: "g1", size: 600 },
        { group: "g3", size: 400 }
      ]
    }

    expect(saveLayout(layout, { splits, windows: { g4: place, g1: place } })).toEqual({
      groups: [
        { where: "main", tabs: ["pages"], open: "pages" },
        { where: "main", tabs: ["screens"], open: "screens" },
        { where: "window", tabs: ["data"], open: "data", bounds: place }
      ],
      focus: 0,
      splits: {
        across: "row",
        parts: [
          { group: 0, size: 600 },
          { group: 1, size: 400 }
        ]
      }
    })
  })

  it("leaves out splits that don't hold every group in the main window", () => {
    const layout: Layout = {
      groups: [
        { id: "g1", where: "main", tabs: ["pages"] },
        { id: "g2", where: "main", tabs: ["screens"] }
      ]
    }

    expect(saveLayout(layout, { splits: { group: "g1" } }).splits).toBeUndefined()
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

  it("keeps a lens listed twice in one group once", () => {
    expect(readLayout({ groups: [{ where: "main", tabs: ["pages", "data", "pages"] }] }, lenses)).toEqual({
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

  it("reads splits and windows' places back as they were saved", () => {
    const saved: JsonValue = {
      groups: [
        { where: "main", tabs: ["pages"], open: "pages" },
        { where: "main", tabs: ["screens"], open: "screens" },
        { where: "main", tabs: ["stories"], open: "stories" },
        { where: "window", tabs: ["data"], open: "data", bounds: place }
      ],
      focus: 3,
      splits: {
        across: "row",
        parts: [
          { group: 0, size: 600 },
          {
            across: "column",
            size: 400,
            parts: [
              { group: 1, size: 300 },
              { group: 2, size: 500 }
            ]
          }
        ]
      }
    }

    expect(readLayout(saved, lenses)).toEqual(saved)
  })

  it("closes the splits over a group that's gone, as the dock does when one closes", () => {
    const saved: JsonValue = {
      groups: [
        { where: "main", tabs: ["pages"] },
        { where: "main", tabs: ["erd"] },
        { where: "main", tabs: ["screens"] },
        { where: "main", tabs: ["stories"] }
      ],
      splits: {
        across: "row",
        parts: [
          { group: 0, size: 200 },
          {
            across: "column",
            size: 600,
            parts: [
              { group: 1, size: 100 },
              {
                across: "row",
                size: 300,
                parts: [
                  { group: 2, size: 1 },
                  { group: 3, size: 2 }
                ]
              }
            ]
          }
        ]
      }
    }

    // The column holds one part once ERD's group has gone, so its row joins the outer one, sharing the column's width.
    expect(readLayout(saved, lenses).splits).toEqual({
      across: "row",
      parts: [
        { group: 0, size: 200 },
        { group: 1, size: 200 },
        { group: 2, size: 400 }
      ]
    })
  })

  it("lays the main window's groups side by side when the splits can't be read or don't fit them", () => {
    const groups = [
      { where: "main", tabs: ["pages"] },
      { where: "main", tabs: ["screens"] }
    ]

    expect(readLayout({ groups, splits: { across: "diagonal" } }, lenses)).toEqual({
      groups: [
        { where: "main", tabs: ["pages"], open: "pages" },
        { where: "main", tabs: ["screens"], open: "screens" }
      ],
      focus: 0
    })
    expect(readLayout({ groups, splits: { group: 0 } }, lenses).splits).toBeUndefined()
    expect(
      readLayout({ groups, splits: { across: "row", parts: [{ group: 0 }, { group: 0 }] } }, lenses).splits
    ).toBeUndefined()
  })

  it("keeps a window's place only for a lens's own window, and drops one that can't be read", () => {
    const saved = {
      groups: [
        { where: "main", tabs: ["pages"], bounds: place },
        { where: "window", tabs: ["data"], bounds: { x: 0, y: 0, width: -1, height: 10 } }
      ]
    }

    expect(readLayout(saved, lenses).groups).toEqual([
      { where: "main", tabs: ["pages"], open: "pages" },
      { where: "window", tabs: ["data"], open: "data" }
    ])
  })
})
