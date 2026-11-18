import { describe, expect, it } from "vite-plus/test"
import { keepsLiveCopy, liveExpired, liveWindowTop, pickLive, type LiveChoice } from "./live.ts"
import type { PoolFrame } from "./pool.ts"

describe("pickLive", () => {
  const spare = (id: string, route: string, state: PoolFrame["state"] = "ready"): PoolFrame => ({ id, route, state })

  const choice = (given: Partial<LiveChoice>): LiveChoice => ({
    route: "/pricing",
    spares: [],
    movable: true,
    ...given
  })

  it("takes the frame warming on the board first", () => {
    const spares = [spare("a", "/pricing"), spare("w", "/")]

    expect(pickLive(choice({ warming: "w", spares }))).toEqual({ from: "warming", frame: "w" })
  })

  it("takes a spare ready on the route before one it would have to send", () => {
    const spares = [spare("a", "/"), spare("b", "/pricing")]

    expect(pickLive(choice({ spares }))).toEqual({ from: "parked", frame: "b" })
  })

  it("sends a ready spare from another route when the app can be moved, and not otherwise", () => {
    const spares = [spare("a", "/")]

    expect(pickLive(choice({ spares }))).toEqual({ from: "sent", frame: "a" })
    expect(pickLive(choice({ spares, movable: false }))).toEqual({ from: "new" })
  })

  it("waits for a loading spare before loading a new frame", () => {
    expect(pickLive(choice({ spares: [spare("l", "/", "loading")] }))).toEqual({ from: "loading", frame: "l" })
    expect(pickLive(choice({ spares: [spare("l", "/", "loading")], movable: false }))).toEqual({ from: "new" })
    expect(pickLive(choice({ spares: [spare("l", "/pricing", "loading")], movable: false }))).toEqual({
      from: "loading",
      frame: "l"
    })
  })

  it("loads a new frame without spares, and passes over a warming frame that's gone", () => {
    expect(pickLive(choice({ warming: "gone" }))).toEqual({ from: "new" })
  })
})

describe("liveWindowTop", () => {
  const view = { viewTop: 0, boardTop: 0, scale: 0.5, pageHeight: 3000, windowHeight: 800 }

  it("sits at the board's top while the top is in view", () => {
    expect(liveWindowTop({ ...view, boardTop: 120 })).toBe(0)
  })

  it("follows the view down a tall board, in the page's pixels", () => {
    expect(liveWindowTop({ ...view, boardTop: -300 })).toBe(600)
  })

  it("stays within the board", () => {
    expect(liveWindowTop({ ...view, boardTop: -5000 })).toBe(2200)
    expect(liveWindowTop({ ...view, pageHeight: 600, boardTop: -200 })).toBe(0)
  })
})

describe("liveExpired", () => {
  it("ends live after 10 s out of view", () => {
    expect(liveExpired(undefined, 50_000)).toBe(false)
    expect(liveExpired(1000, 10_999)).toBe(false)
    expect(liveExpired(1000, 11_000)).toBe(true)
  })
})

describe("keepsLiveCopy", () => {
  const at = (path: string, search = "", outcome: "landed" | "redirected" = "landed") => ({
    path,
    search,
    hash: "",
    outcome
  })

  it("keeps the snapshot of a page still on its board's route, whatever its hash", () => {
    expect(keepsLiveCopy("/pricing?plan=pro", { ...at("/pricing", "?plan=pro"), hash: "#faq" })).toBe(true)
  })

  it("leaves the board's copy when a link moved the page to another route or query", () => {
    expect(keepsLiveCopy("/pricing", at("/about"))).toBe(false)
    expect(keepsLiveCopy("/pricing?plan=pro", at("/pricing", "?plan=team"))).toBe(false)
  })

  it("leaves the board's copy when a redirect took the page elsewhere, or it never said where it is", () => {
    expect(keepsLiveCopy("/account", at("/sign-in", "", "redirected"))).toBe(false)
    expect(keepsLiveCopy("/pricing", undefined)).toBe(false)
  })
})
