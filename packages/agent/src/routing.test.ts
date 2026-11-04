import { describe, expect, it } from "vite-plus/test"
import {
  type Copy,
  type CopyEntry,
  matchTab,
  normalizeRoot,
  openTabs,
  projectFor,
  readCopyEntry,
  type RoutedTab,
  route
} from "./routing.ts"

function tab(root: string, active = false): RoutedTab {
  return { id: root, name: root.split(/[\\/]/).at(-1)!, root, active }
}
function entry(app: number, startedAt: number): CopyEntry {
  return { version: 1, url: `http://127.0.0.1:${4000 + app}`, token: `token-${app}`, app, startedAt }
}
function copy(app: number, startedAt: number, tabs: RoutedTab[], focusedAt?: number): Copy {
  return { entry: entry(app, startedAt), report: { tabs, ...(focusedAt === undefined ? {} : { focusedAt }) } }
}

/** The person's app, started first, and a copy a session started later. */
const shop = "/work/shop"
const blog = "/work/blog"
const person = (focusedAt?: number, tabs = [tab(shop, true)]) => copy(10, 1000, tabs, focusedAt)
const session = (focusedAt?: number, tabs = [tab(blog, true)]) => copy(20, 2000, tabs, focusedAt)
const anywhere = "/home/person"

function goes(copies: Copy[], request: Parameters<typeof route>[1]) {
  const result = route(copies, request)
  return result.kind === "copy" ? { app: result.copy.entry.app, tab: result.tab?.id } : result.code
}

describe("route", () => {
  it("reaches both copies when each has its own project open", () => {
    const copies = [person(5000), session(6000)]
    expect(goes(copies, { kind: "tab", tab: shop, folder: anywhere })).toEqual({ app: 10, tab: shop })
    expect(goes(copies, { kind: "tab", tab: "blog", folder: anywhere })).toEqual({ app: 20, tab: blog })
  })

  it("sends a project open in two copies to the one running longest", () => {
    const copies = [session(9000, [tab(shop, true)]), person(5000)]
    expect(goes(copies, { kind: "tab", tab: shop, folder: anywhere })).toEqual({ app: 10, tab: shop })
    expect(goes(copies, { kind: "tab", folder: shop })).toEqual({ app: 10, tab: shop })
  })

  it("names what the person is looking at with active: the active tab of the copy focused last", () => {
    expect(goes([person(5000), session(6000)], { kind: "tab", tab: "active", folder: shop })).toEqual({
      app: 20,
      tab: blog
    })
    expect(goes([person(7000), session(6000)], { kind: "tab", tab: "active", folder: blog })).toEqual({
      app: 10,
      tab: shop
    })
  })

  it("without a tab, goes to the project the agent works in, even while the person looks at another", () => {
    const copies = [person(5000), session(6000)]
    expect(goes(copies, { kind: "tab", folder: "/work/shop/src/components" })).toEqual({ app: 10, tab: shop })
  })

  it("without a tab, outside any open project, goes to what the person is looking at", () => {
    expect(goes([person(5000), session(6000)], { kind: "tab", folder: anywhere })).toEqual({ app: 20, tab: blog })
  })

  it("prefers the deepest project holding the folder", () => {
    const copies = [person(5000, [tab("/work"), tab("/work/shop/packages/ui", true)])]
    expect(goes(copies, { kind: "tab", folder: "/work/shop/packages/ui/src" })).toEqual({
      app: 10,
      tab: "/work/shop/packages/ui"
    })
    expect(goes(copies, { kind: "tab", folder: "/work/shopping" })).toEqual({ app: 10, tab: "/work" })
  })

  it("falls back to the copy running longest when no copy says when it was focused", () => {
    expect(goes([session(), person()], { kind: "tab", folder: anywhere })).toEqual({ app: 10, tab: shop })
  })

  it("skips a copy with no project open when looking for the active tab", () => {
    expect(goes([person(5000), session(9000, [])], { kind: "tab", tab: "active", folder: anywhere })).toEqual({
      app: 10,
      tab: shop
    })
  })

  it("says what is open when no copy has the project", () => {
    const result = route([person(5000), session(6000)], { kind: "tab", tab: "/work/docs", folder: anywhere })
    expect(result).toMatchObject({
      kind: "none",
      code: "unknown_tab",
      message: 'No open tab matches "/work/docs". Tabs: /work/shop, /work/blog'
    })
  })

  it("says nothing is open, or nothing is running", () => {
    expect(goes([person(5000, [])], { kind: "tab", folder: anywhere })).toBe("unknown_tab")
    expect(goes([], { kind: "tab", folder: anywhere })).toBe("not_running")
    expect(goes([], { kind: "open", root: shop })).toBe("not_running")
  })

  it("opens a project in the copy that has it, else in the one the person used last", () => {
    expect(goes([person(5000), session(6000)], { kind: "open", root: shop })).toEqual({ app: 10, tab: undefined })
    expect(goes([person(5000), session(6000)], { kind: "open", root: "/work/docs" })).toEqual({
      app: 20,
      tab: undefined
    })
  })

  it("matches Windows folders whatever their case and slashes", () => {
    const copies = [copy(10, 1000, [tab("C:\\Work\\Shop", true)], 5000), copy(20, 2000, [tab("D:\\blog", true)], 6000)]
    expect(goes(copies, { kind: "tab", tab: "c:/work/shop/", folder: anywhere })).toEqual({
      app: 10,
      tab: "C:\\Work\\Shop"
    })
    expect(goes(copies, { kind: "tab", folder: "c:\\work\\SHOP\\src" })).toEqual({ app: 10, tab: "C:\\Work\\Shop" })
  })
})

describe("openTabs", () => {
  it("lists each project once, active only where active points", () => {
    const copies = [session(9000, [tab(shop, true), tab(blog)]), person(5000)]
    expect(openTabs(copies)).toEqual([tab(shop, true), tab(blog)])
    expect(openTabs([person(9000, [tab(shop), tab(blog, true)]), session(5000, [tab(shop, true)])])).toEqual([
      tab(shop),
      tab(blog, true)
    ])
  })
})

describe("matchTab", () => {
  const tabs = [tab("/work/shop"), { id: "/work/two", name: "shop", root: "/work/two", active: false }]
  it("matches an id, then a folder, then a name", () => {
    expect(matchTab(tabs, "/work/shop")?.root).toBe("/work/shop")
    expect(matchTab(tabs, "/work/shop/")?.root).toBe("/work/shop")
    expect(matchTab(tabs, "shop")?.root).toBe("/work/shop")
    expect(matchTab(tabs, "nothing")).toBeUndefined()
  })
  it("keeps case on POSIX folders", () => {
    expect(matchTab(tabs, "/Work/Shop")).toBeUndefined()
  })
})

describe("normalizeRoot", () => {
  it("compares Windows folders without case or slash differences", () => {
    expect(normalizeRoot("C:\\Work\\Shop\\")).toBe("c:/work/shop")
    expect(normalizeRoot("C:\\")).toBe("c:/")
    expect(normalizeRoot("\\\\server\\share\\x")).toBe("//server/share/x")
  })
  it("keeps POSIX folders as they are, less a trailing slash", () => {
    expect(normalizeRoot("/Work/Shop/")).toBe("/Work/Shop")
    expect(normalizeRoot("/")).toBe("/")
  })
})

describe("projectFor", () => {
  it("doesn't take a folder that only starts with the project's name", () => {
    expect(projectFor("/work/shopping", [tab(shop)])).toBeUndefined()
    expect(projectFor(shop, [tab(shop)])?.root).toBe(shop)
  })
})

describe("readCopyEntry", () => {
  it("reads an entry", () => {
    expect(readCopyEntry(JSON.stringify(entry(10, 1000)))).toEqual(entry(10, 1000))
  })
  it("reads a file from before the registry as its copy", () => {
    expect(readCopyEntry(JSON.stringify({ url: "http://127.0.0.1:1", token: "t", pid: 5 }))).toEqual({
      version: 0,
      url: "http://127.0.0.1:1",
      token: "t",
      app: 5,
      startedAt: 0
    })
  })
  it("reads nothing from a missing, broken or foreign file", () => {
    expect(readCopyEntry(undefined)).toBeUndefined()
    expect(readCopyEntry("{")).toBeUndefined()
    expect(readCopyEntry("[]")).toBeUndefined()
    expect(readCopyEntry(JSON.stringify({ url: "x", token: 1 }))).toBeUndefined()
  })
})
