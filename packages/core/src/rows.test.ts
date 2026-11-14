import { describe, expect, it } from "vite-plus/test"
import { boardLayout, rowWrapWidth, wrapRow } from "./board.ts"
import { containerSpec, type ContainerSpec } from "./document.ts"
import { orderedStates, reorderShown, shownStates, withShownStates, withStateOrder } from "./rows.ts"

/** Plan card's stories, as a story file's design has them: a state each. */
function plans(view: ContainerSpec["view"] = {}): ContainerSpec {
  return {
    id: "plans",
    name: "Plan card",
    kind: "component",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] },
    states: [
      { id: "default", name: "Default" },
      { id: "popular", name: "Popular" },
      { id: "team", name: "Team and Business" }
    ],
    view
  }
}

const ids = (design: ContainerSpec) => shownStates(design).map((state) => state.id)

describe("shownStates", () => {
  it("shows the first state by default, the one the view names, every one, or those it lists", () => {
    expect(ids(plans())).toEqual(["default"])
    expect(ids(plans({ state: "popular" }))).toEqual(["popular"])
    expect(ids(plans({ allStates: true }))).toEqual(["default", "popular", "team"])
    expect(ids(plans({ states: ["team", "default"] }))).toEqual(["default", "team"])
  })

  it("draws them in the design's own order, states it doesn't name after", () => {
    const design = plans({ allStates: true, stateOrder: ["team"] })

    expect(orderedStates(design).map((state) => state.id)).toEqual(["team", "default", "popular"])
    expect(ids(design)).toEqual(["team", "default", "popular"])
  })
})

describe("withShownStates", () => {
  it("writes the fewest words: one state, every state, or the list", () => {
    const design = plans()

    expect(withShownStates({}, design, ["default"])).toEqual({})
    expect(withShownStates({}, design, ["popular"])).toEqual({ state: "popular" })
    expect(withShownStates({ state: "popular" }, design, ["default", "popular", "team"])).toEqual({
      state: "popular",
      allStates: true
    })
    expect(withShownStates({ allStates: true }, design, ["team", "default"])).toEqual({ states: ["default", "team"] })
  })

  it("keeps a state shown, never none", () => {
    expect(withShownStates({ state: "team" }, plans(), [])).toEqual({ state: "team" })
  })

  it("keeps what a design file can hold", () => {
    const view = withStateOrder(withShownStates({}, plans(), ["popular", "team"]), plans(), [
      "team",
      "popular",
      "default"
    ])

    expect(containerSpec.safeParse(plans(view)).success).toBe(true)
  })
})

describe("withStateOrder", () => {
  it("keeps an order of its own, and drops the design's own", () => {
    expect(withStateOrder({}, plans(), ["team", "default", "popular"])).toEqual({
      stateOrder: ["team", "default", "popular"]
    })
    expect(withStateOrder({ stateOrder: ["team"] }, plans(), ["default", "popular", "team"])).toEqual({})
  })
})

describe("wrapRow", () => {
  it("wraps a row past two and a half of its widest preview, or 1600", () => {
    expect(rowWrapWidth([200, 300])).toBe(1600)
    expect(rowWrapWidth([1280, 390])).toBe(3200)
    // Five 390-wide previews with 24 between them run 2046, so the fifth goes on a line of its own.
    expect(wrapRow([390, 390, 390, 390, 390], 1600)).toEqual([
      [0, 1, 2],
      [3, 4]
    ])
    expect(wrapRow([390, 390, 390], 1600)).toEqual([[0, 1, 2]])
  })

  it("judges a line by the gap up close", () => {
    const fits = 1600 - 2 * boardLayout.between

    expect(wrapRow([fits / 3, fits / 3, fits / 3], 1600)).toEqual([[0, 1, 2]])
    expect(wrapRow([fits / 3, fits / 3, fits / 3 + 1], 1600)).toEqual([[0, 1], [2]])
  })
})

describe("reorderShown", () => {
  it("moves an entry among those shown, leaving hidden ones in place", () => {
    const order = ["a", "b", "c", "d"]

    expect(reorderShown(order, ["a", "b", "d"], 0, 2)).toEqual(["b", "d", "c", "a"])
    expect(reorderShown(order, ["a", "c", "d"], 2, 0)).toEqual(["d", "b", "a", "c"])
    expect(reorderShown(order, order, 1, 1)).toEqual(order)
  })
})
