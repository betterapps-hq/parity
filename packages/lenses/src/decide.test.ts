import { describe, expect, it } from "vite-plus/test"
import { canSplit, close, drop, followLink, openTab, show, splitRight, toMain, toWindow } from "./decide.ts"
import type { Group, Layout } from "./layout.ts"

type Id = "pages" | "screens" | "components" | "stories" | "data"

/** A group in the main window, with its first tab in front unless another is named. */
const main = (id: string, tabs: Id[], open: Id | undefined = tabs[0]): Group<Id> => ({ id, where: "main", tabs, open })

/** A group in a window of its own. */
const own = (id: string, tabs: Id[], open: Id | undefined = tabs[0]): Group<Id> => ({ id, where: "window", tabs, open })

const layout = (focus: string | undefined, ...groups: Group<Id>[]): Layout<Id> =>
  focus === undefined ? { groups } : { groups, focus }

const empty: Layout<Id> = { groups: [] }

describe("showing a lens, as a link opens", () => {
  it("shows it where it's open, in another group or a window of its own", () => {
    expect(show(layout("a", main("a", ["pages"]), main("b", ["data"])), "data")).toEqual([
      { kind: "reveal", lens: "data" }
    ])
    expect(show(layout("a", main("a", ["pages"]), own("w", ["data"])), "data")).toEqual([
      { kind: "reveal", lens: "data" }
    ])
  })

  it("puts it in place of the main window's tab in focus, at that tab's index", () => {
    expect(show(layout("a", main("a", ["pages", "screens", "data"], "screens")), "stories")).toEqual([
      { kind: "add", lens: "stories", to: { group: "a", index: 1 } },
      { kind: "close", lens: "screens" }
    ])
  })

  it("uses the main window's group even while a lens's own window has focus", () => {
    expect(show(layout("w", main("a", ["pages"]), own("w", ["data"])), "stories")).toEqual([
      { kind: "add", lens: "stories", to: { group: "a", index: 0 } },
      { kind: "close", lens: "pages" }
    ])
  })

  it("opens it in a new tab with every tab closed", () => {
    expect(show(empty, "pages")).toEqual([{ kind: "add", lens: "pages", to: { edge: "right" } }])
  })
})

describe("opening a lens in a new tab, as Ctrl+click opens a link", () => {
  it("adds a tab to the main window's group in focus", () => {
    expect(openTab(layout("b", main("a", ["pages"]), main("b", ["data"])), "stories")).toEqual([
      { kind: "add", lens: "stories", to: { group: "b" } }
    ])
  })

  it("shows it where it's open instead, since a lens is open once", () => {
    expect(openTab(layout("a", main("a", ["pages", "data"])), "data")).toEqual([{ kind: "reveal", lens: "data" }])
  })

  it("adds it at the main window's right edge when nothing's open", () => {
    expect(openTab(empty, "data")).toEqual([{ kind: "add", lens: "data", to: { edge: "right" } }])
  })
})

describe("splitting a lens right", () => {
  it("moves its tab to a new group right of the group in focus", () => {
    const tabs = layout("a", main("a", ["pages", "data"]))
    expect(splitRight(tabs, "data")).toEqual([{ kind: "move", lens: "data", to: { group: "a", side: "right" } }])
    expect(canSplit(tabs, "data")).toBe(true)
  })

  it("opens one that isn't open there, beside the group in focus, in any window", () => {
    expect(splitRight(layout("w", main("a", ["pages"]), own("w", ["data"])), "stories")).toEqual([
      { kind: "add", lens: "stories", to: { group: "w", side: "right" } }
    ])
    expect(splitRight(empty, "stories")).toEqual([{ kind: "add", lens: "stories", to: { edge: "right" } }])
  })

  it("does nothing for a lens alone in the group in focus", () => {
    const alone = layout("b", main("a", ["pages"]), main("b", ["data"]))
    expect(splitRight(alone, "data")).toEqual([])
    expect(canSplit(alone, "data")).toBe(false)
    expect(canSplit(alone, "pages")).toBe(true)
  })
})

describe("moving a lens to a window of its own and back", () => {
  it("moves an open lens's tab to a window, where it was let go", () => {
    const tabs = layout("a", main("a", ["pages", "data"]))
    expect(toWindow(tabs, "data")).toEqual([{ kind: "window", lens: "data" }])
    expect(toWindow(tabs, "data", { x: 900, y: 40 })).toEqual([{ kind: "window", lens: "data", at: { x: 900, y: 40 } }])
  })

  it("opens a lens that isn't open in the main window first", () => {
    expect(toWindow(layout("a", main("a", ["pages"])), "data")).toEqual([
      { kind: "add", lens: "data", to: { group: "a" } },
      { kind: "window", lens: "data" }
    ])
  })

  it("moves a lens in its own window back into the main window's group", () => {
    expect(toMain(layout("w", main("a", ["pages"]), main("b", ["stories"]), own("w", ["data"])), "data")).toEqual([
      { kind: "move", lens: "data", to: { group: "a" } }
    ])
  })

  it("makes a new group in the main window when it has none, and leaves a lens already there", () => {
    expect(toMain(layout("w", own("w", ["data"])), "data")).toEqual([
      { kind: "move", lens: "data", to: { edge: "right" } }
    ])
    expect(toMain(layout("a", main("a", ["data"])), "data")).toEqual([])
    expect(toMain(empty, "data")).toEqual([])
  })
})

describe("closing a lens", () => {
  it("closes its tab, and does nothing for one that isn't open", () => {
    expect(close(layout("a", main("a", ["pages"])), "pages")).toEqual([{ kind: "close", lens: "pages" }])
    expect(close(empty, "pages")).toEqual([])
  })
})

describe("following a link from the panels", () => {
  const split = layout("b", main("a", ["pages"]), main("b", ["data", "screens"]))

  it("shows the lens in the group in focus's front tab, where the panels are", () => {
    expect(followLink(split, "stories", false)).toEqual([
      { kind: "add", lens: "stories", to: { group: "b", index: 0 } },
      { kind: "close", lens: "data" }
    ])
  })

  it("shows it where it's open, beside or not, when that's another group", () => {
    expect(followLink(split, "pages", true)).toEqual([{ kind: "reveal", lens: "pages" }])
  })

  it("puts it beside the group in focus: a new one there, or its own tab moved out", () => {
    expect(followLink(split, "stories", true)).toEqual([
      { kind: "add", lens: "stories", to: { group: "b", side: "right" } }
    ])
    expect(followLink(split, "screens", true)).toEqual([
      { kind: "move", lens: "screens", to: { group: "b", side: "right" } }
    ])
  })

  it("leaves a lens alone in the group in focus where it is", () => {
    expect(followLink(layout("a", main("a", ["pages"])), "pages", true)).toEqual([])
  })
})

describe("dropping a lens from the lens bar", () => {
  const tabs = layout("a", main("a", ["pages"]), main("b", ["data"]))

  it("opens one that isn't open where it's dropped, else in the main window's group", () => {
    expect(drop(tabs, "stories", { group: "b", side: "below" })).toEqual([
      { kind: "add", lens: "stories", to: { group: "b", side: "below" } }
    ])
    expect(drop(tabs, "stories", undefined)).toEqual([{ kind: "add", lens: "stories", to: { group: "a" } }])
  })

  it("moves an open one there, and leaves it with nowhere named", () => {
    expect(drop(tabs, "data", { group: "a" })).toEqual([{ kind: "move", lens: "data", to: { group: "a" } }])
    expect(drop(tabs, "data", undefined)).toEqual([])
  })
})
