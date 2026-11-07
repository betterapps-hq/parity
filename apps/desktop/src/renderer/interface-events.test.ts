import { describe, expect, it } from "vite-plus/test"
import { tabEvents } from "./interface-events.ts"

const project = (id: string) => ({ id })
const blank = (id: string) => ({ id, blank: true })

describe("tabEvents", () => {
  it("records a new tab opening and coming to the front", () => {
    expect(
      tabEvents({ tabs: [project("a")], active: "a" }, { tabs: [project("a"), blank("new-1")], active: "new-1" })
    ).toEqual([
      { name: "tab.opened", attributes: { kind: "new", tabs: 2 } },
      { name: "tab.switched", attributes: { from: "project", to: "new" } }
    ])
  })

  it("records a tab closing and Home taking its place", () => {
    expect(tabEvents({ tabs: [project("a")], active: "a" }, { tabs: [], active: undefined })).toEqual([
      { name: "tab.closed", attributes: { kind: "project", tabs: 0 } },
      { name: "tab.switched", attributes: { from: "project", to: "home" } }
    ])
  })

  it("doesn't count a tab that takes a new id as opening, closing or switching", () => {
    expect(
      tabEvents({ tabs: [project("opening-1")], active: "opening-1" }, { tabs: [project("/app")], active: "/app" })
    ).toEqual([])
  })

  it("records switching between open tabs, and nothing when nothing changed", () => {
    const tabs = [project("a"), project("b")]
    expect(tabEvents({ tabs, active: "a" }, { tabs, active: "b" })).toEqual([
      { name: "tab.switched", attributes: { from: "project", to: "project" } }
    ])
    expect(tabEvents({ tabs, active: "a" }, { tabs, active: "a" })).toEqual([])
  })
})
