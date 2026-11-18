import { describe, expect, it } from "vite-plus/test"
import { changeState, goneAfterMs, keepEntriesMs, keptLensLayouts, readState } from "./state-file.ts"

const tabs = (roots: string[], at: number) => ({ roots, at })

/** The windows `text` holds. */
const windowsIn = (text: string) => readState(text).values.windows

describe("state.json", () => {
  it("keeps each window part's value as it was saved, for that part to read", () => {
    const text = changeState(undefined, { kind: "set", key: "layout", value: { left: false } })

    expect(readState(text).values.values).toEqual({ layout: { left: false } })
  })

  it("keeps keys it doesn't know, and refuses to write over text that doesn't parse", () => {
    const text = changeState(JSON.stringify({ newer: 1 }), { kind: "set", key: "recentSearches", value: ["a"] })

    expect(JSON.parse(text)).toMatchObject({ newer: 1, recentSearches: ["a"] })
    expect(() => changeState("{ half", { kind: "claim", id: "a", at: 0 })).toThrow(/isn't JSON/)
  })
})

describe("each project's lens layout", () => {
  const layout = (lens: string) => ({ groups: [{ where: "main", tabs: [lens] }] })

  const save = (text: string | undefined, project: string, lens: string) =>
    changeState(text, { kind: "lensLayout", project, layout: layout(lens) })

  const layouts = (text: string) => readState(text).values.values.lensLayouts

  it("is saved by the project's root, keeping the projects another copy saved meanwhile", () => {
    // Two copies started with nothing saved; each saves its own project into the file as it is then.
    const first = save(undefined, "D:/work/app", "pages")
    const second = save(first, "D:/work/site", "screens")

    expect(layouts(second)).toEqual({ "D:/work/app": layout("pages"), "D:/work/site": layout("screens") })
    expect(layouts(save(second, "D:/work/app", "stories"))).toEqual({
      "D:/work/site": layout("screens"),
      "D:/work/app": layout("stories")
    })
  })

  it("keeps the 50 projects saved most recently, and starts again over a value that isn't a map", () => {
    let text = changeState(undefined, { kind: "set", key: "lensLayouts", value: "broken" })
    text = save(text, "D:/work/first", "pages")

    expect(layouts(text)).toEqual({ "D:/work/first": layout("pages") })

    for (let n = 0; n < keptLensLayouts; n++) {
      text = save(text, `D:/work/${n}`, "pages")
    }

    expect(Object.keys(layouts(text) ?? {})).toHaveLength(keptLensLayouts)
    expect(layouts(text)).not.toHaveProperty("D:/work/first")
  })
})

describe("a window's tabs", () => {
  it("are taken from the newest copy that's gone", () => {
    const now = 10 * goneAfterMs

    const text = JSON.stringify({
      windows: { old: tabs(["D:/old"], now - 5 * goneAfterMs), last: tabs(["D:/shop"], now - 2 * goneAfterMs) }
    })

    const after = windowsIn(changeState(text, { kind: "claim", id: "new", at: now }))

    expect(after).toEqual({ old: tabs(["D:/old"], now - 5 * goneAfterMs), new: tabs(["D:/shop"], now) })
  })

  it("aren't taken from a copy still running", () => {
    const now = 10 * goneAfterMs
    const text = JSON.stringify({ windows: { running: tabs(["D:/shop"], now - 1000) } })

    expect(windowsIn(changeState(text, { kind: "claim", id: "new", at: now }))["new"]).toEqual(tabs([], now))
  })

  it("go to only one of two copies starting together", () => {
    const now = 10 * goneAfterMs
    let text = JSON.stringify({ windows: { gone: tabs(["D:/shop"], 0) } })
    text = changeState(text, { kind: "claim", id: "one", at: now })
    text = changeState(text, { kind: "claim", id: "two", at: now })

    expect(windowsIn(text)).toEqual({ one: tabs(["D:/shop"], now), two: tabs([], now) })
  })

  it("stay with a window that reloads", () => {
    const tabsSaved = { roots: ["D:/shop"], active: "D:/shop" }
    const saved = changeState(undefined, { kind: "tabs", id: "one", tabs: tabsSaved, at: 1 })
    const text = changeState(saved, { kind: "claim", id: "one", at: 2 })

    expect(windowsIn(text)).toEqual({ one: { roots: ["D:/shop"], active: "D:/shop", at: 2 } })
  })

  it("are forgotten after a week", () => {
    const text = JSON.stringify({ windows: { stale: tabs(["D:/shop"], 0) } })

    expect(windowsIn(changeState(text, { kind: "tabs", id: "one", tabs: { roots: [] }, at: keepEntriesMs }))).toEqual({
      one: tabs([], keepEntriesMs)
    })
  })
})
