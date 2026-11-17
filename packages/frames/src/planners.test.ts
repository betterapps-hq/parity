import { describe, expect, it } from "vite-plus/test"
import { type CopyKey, copyId, sharedMarkup, staleCopies } from "./keys.ts"
import { planPool, type PoolView } from "./pool.ts"
import { type BoardView, boardTier } from "./tiers.ts"

describe("boardTier", () => {
  const board = (view: Partial<BoardView>): BoardView => ({
    width: 600,
    near: true,
    last: "picture",
    copy: true,
    live: false,
    pointed: false,
    ...view
  })

  it("is live while the board holds the live frame", () => {
    expect(boardTier(board({ live: true, width: 10, near: false }))).toBe("live")
  })

  it("goes from picture to frozen only past 440 px, when near", () => {
    expect(boardTier(board({ width: 440 }))).toBe("picture")
    expect(boardTier(board({ width: 441 }))).toBe("frozen")
    expect(boardTier(board({ width: 900, near: false }))).toBe("picture")
  })

  it("stays frozen down to 360 px, so zooming doesn't flip it", () => {
    expect(boardTier(board({ last: "frozen", width: 400 }))).toBe("frozen")
    expect(boardTier(board({ last: "frozen", width: 360 }))).toBe("frozen")
    expect(boardTier(board({ last: "frozen", width: 359 }))).toBe("picture")
    expect(boardTier(board({ last: "frozen", near: false }))).toBe("picture")
  })

  it("stays a picture without a copy to show", () => {
    expect(boardTier(board({ copy: false, width: 2000 }))).toBe("picture")
  })

  it("brings a picture up to its copy when pointed at with Interact", () => {
    expect(boardTier(board({ width: 100, pointed: true }))).toBe("frozen")
  })

  it("ends live as frozen, or as a picture when it's out of view", () => {
    expect(boardTier(board({ last: "live" }))).toBe("frozen")
    expect(boardTier(board({ last: "live", near: false }))).toBe("picture")
  })

  it("keeps its tier while the window isn't drawn", () => {
    expect(boardTier(board({ last: "picture", near: undefined, width: 2000 }))).toBe("picture")
    expect(boardTier(board({ last: "frozen", near: undefined, width: 10 }))).toBe("frozen")
  })
})

describe("planPool", () => {
  const pool = (view: Partial<PoolView>): PoolView => ({
    spares: 2,
    focused: true,
    frames: [],
    routes: [],
    movable: true,
    root: "/",
    ...view
  })

  it("opens spares at the root to make up the count", () => {
    expect(planPool(pool({ routes: ["/a"] }))).toEqual({ move: [], open: [{ route: "/" }, { route: "/" }], close: [] })
  })

  it("keeps a spare already on a route in view and moves the others there, nearest first", () => {
    const frames = [
      { id: "f1", state: "ready", route: "/" },
      { id: "f2", state: "ready", route: "/b" }
    ] as const

    expect(planPool(pool({ frames, routes: ["/a", "/b", "/c"] }))).toEqual({
      move: [{ frame: "f1", route: "/a" }],
      open: [],
      close: []
    })
  })

  it("leaves a loading spare to finish", () => {
    const frames = [{ id: "f1", state: "loading", route: "/" }] as const

    expect(planPool(pool({ frames, routes: ["/a"] }))).toEqual({ move: [], open: [{ route: "/" }], close: [] })
  })

  it("closes every spare in a window that isn't focused, or with spares off", () => {
    const frames = [{ id: "f1", state: "ready", route: "/a" }] as const

    expect(planPool(pool({ frames, routes: ["/a"], focused: false })).close).toEqual(["f1"])
    expect(planPool(pool({ frames, routes: ["/a"], spares: 0 })).close).toEqual(["f1"])
  })

  it("closes spares past the count, keeping the ones on routes in view", () => {
    const frames = [
      { id: "f1", state: "ready", route: "/x" },
      { id: "f2", state: "ready", route: "/a" },
      { id: "f3", state: "loading", route: "/" }
    ] as const

    expect(planPool(pool({ frames, routes: ["/a"], spares: 1 }))).toEqual({ move: [], open: [], close: ["f1", "f3"] })
  })

  it("without a page router, opens spares at the routes they're for and replaces a spare on another route", () => {
    const frames = [{ id: "f1", state: "ready", route: "/x" }] as const

    expect(planPool(pool({ frames, routes: ["/a", "/b"], movable: false }))).toEqual({
      move: [],
      open: [{ route: "/a" }, { route: "/b" }],
      close: ["f1"]
    })
  })
})

describe("sharedMarkup", () => {
  const groups = new Map([
    [
      "/pricing",
      new Map([
        ["desktop-light", "m1"],
        ["desktop-dark", "m1"],
        ["mobile-light", "m2"]
      ])
    ]
  ])

  it("gives the mode itself first, then the modes that drew the same markup", () => {
    expect(sharedMarkup("/pricing", "desktop-dark", groups)).toEqual(["desktop-dark", "desktop-light"])
    expect(sharedMarkup("/pricing", "mobile-light", groups)).toEqual(["mobile-light"])
  })

  it("gives only the mode when it hasn't been frozen yet", () => {
    expect(sharedMarkup("/pricing", "tablet-light", groups)).toEqual(["tablet-light"])
    expect(sharedMarkup("/login", "desktop-light", groups)).toEqual(["desktop-light"])
  })
})

describe("staleCopies", () => {
  const key = (route: string, mode = "desktop"): CopyKey => ({ route, mode, state: "base" })

  const copies = [
    { key: key("/a"), files: ["src/routes/a.tsx", "src/routes/__root.tsx"] },
    { key: key("/b"), files: ["src/routes/b.tsx", "src/routes/__root.tsx"] },
    { key: key("/c"), files: "all" as const },
    { key: key("/d"), files: ["src/routes/d.tsx"] }
  ]

  it("finds the copies whose traces hold a changed file, and those with a whole-project trace", () => {
    const view = { distance: new Map() }

    expect(staleCopies(["src/routes/b.tsx"], copies, view)).toEqual([key("/b"), key("/c")])
    expect(staleCopies([], copies, view)).toEqual([])
  })

  it("puts the live board's route first, then the nearest", () => {
    const distance = new Map([
      [copyId(key("/a")), 300],
      [copyId(key("/b")), 10],
      [copyId(key("/c")), 50]
    ])

    expect(staleCopies(["src/routes/__root.tsx"], copies, { distance })).toEqual([key("/b"), key("/c"), key("/a")])
    expect(staleCopies(["src/routes/__root.tsx"], copies, { live: "/a", distance })).toEqual([
      key("/a"),
      key("/b"),
      key("/c")
    ])
  })
})
