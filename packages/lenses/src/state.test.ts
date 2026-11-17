import { describe, expect, it } from "vite-plus/test"
import type { Layout } from "./layout.ts"
import { barOrder, inOrder, type Lens, lensForShortcut } from "./lens.ts"
import { inFocus, isEmpty, markOf, menuOf } from "./state.ts"

type Id = "pages" | "screens" | "data" | "api"

const lenses: Lens<Id>[] = [
  {
    id: "api",
    name: "API",
    icon: "server",
    order: 4,
    shortcut: "Ctrl+4",
    unavailable: { title: "No OpenAPI document", description: "Add one.", action: "Choose a document…" }
  },
  { id: "data", name: "Data", icon: "database", order: 3, shortcut: "Ctrl+3" },
  { id: "pages", name: "Pages", icon: "route", order: 1, shortcut: "Ctrl+1" },
  { id: "screens", name: "Screens", icon: "app-window", order: 2, shortcut: "Ctrl+2" }
]

const lens = (id: Id) => lenses.find((each) => each.id === id)!

/** Pages and Screens as tabs in the main window, Screens in front, and Data in a window of its own, which has focus. */
const layout: Layout<Id> = {
  groups: [
    { id: "a", where: "main", tabs: ["pages", "screens"], open: "screens" },
    { id: "w", where: "window", tabs: ["data"], open: "data" }
  ],
  focus: "w"
}

describe("lenses as data", () => {
  it("lists them in order, and the lens bar puts the ones the project has nothing for last", () => {
    const withMissingFirst = lenses.map((each) =>
      each.id === "pages" ? { ...each, unavailable: lens("api").unavailable } : each
    )

    expect(inOrder(lenses).map((each) => each.id)).toEqual(["pages", "screens", "data", "api"])
    expect(barOrder(withMissingFirst).map((each) => each.id)).toEqual(["screens", "data", "pages", "api"])
  })

  it("finds the lens a shortcut shows", () => {
    expect(lensForShortcut(lenses, "Ctrl+2")?.id).toBe("screens")
    expect(lensForShortcut(lenses, "Ctrl+9")).toBeUndefined()
  })
})

describe("the lens in focus and the empty window", () => {
  it("is the front tab of the group in focus, in any window", () => {
    expect(inFocus(layout)).toBe("data")
    expect(inFocus({ ...layout, focus: "a" })).toBe("screens")
  })

  it("falls back to the first group with tabs when none has focus", () => {
    expect(inFocus({ groups: layout.groups })).toBe("screens")
  })

  it("is none, and the window empty, with every tab closed", () => {
    expect(inFocus({ groups: [] })).toBeUndefined()
    expect(isEmpty({ groups: [] })).toBe(true)
    expect(isEmpty({ groups: [{ id: "a", where: "main", tabs: [] }] })).toBe(true)
    expect(isEmpty(layout)).toBe(false)
  })
})

describe("the lens bar's marks", () => {
  it("marks the lens in focus, and where the others are open", () => {
    expect(markOf(layout, lens("data"))).toEqual({ focus: true, unavailable: false })
    expect(markOf(layout, lens("screens"))).toEqual({ focus: false, elsewhere: "tab", unavailable: false })
    expect(markOf(layout, lens("pages"))).toEqual({ focus: false, elsewhere: "tab", unavailable: false })
    expect(markOf({ ...layout, focus: "a" }, lens("data"))).toEqual({
      focus: false,
      elsewhere: "window",
      unavailable: false
    })
  })

  it("marks a lens the project has nothing for, open or not", () => {
    expect(markOf(layout, lens("api"))).toEqual({ focus: false, unavailable: true })
  })
})

describe("which menu items are enabled", () => {
  it("offers a lens that isn't open everything but moving back and closing", () => {
    expect(menuOf({ groups: [] }, lens("pages"))).toEqual({
      openInNewTab: true,
      splitRight: true,
      moveToNewWindow: true,
      moveToMainWindow: false,
      close: false
    })
  })

  it("offers a lens alone in its own window moving back, not to another window", () => {
    expect(menuOf(layout, lens("data"))).toEqual({
      openInNewTab: false,
      splitRight: false,
      moveToNewWindow: false,
      moveToMainWindow: true,
      close: true
    })
  })

  it("offers a tab beside others in the main window splitting and a window of its own", () => {
    expect(menuOf(layout, lens("pages"))).toEqual({
      openInNewTab: false,
      splitRight: true,
      moveToNewWindow: true,
      moveToMainWindow: false,
      close: true
    })
  })

  it("keeps a lens the project has nothing for in the main window", () => {
    expect(menuOf(layout, lens("api")).moveToNewWindow).toBe(false)
  })
})
