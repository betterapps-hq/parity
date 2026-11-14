import { type ContainerSpec, defaultModeSettings, resolveModes } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { prunedView, withPrunedView } from "./prune-view.ts"

const [primary, second] = resolveModes(defaultModeSettings).map((mode) => mode.id)

if (!primary || !second) {
  throw new Error("the default modes have fewer than two")
}

/** A story file's design with two stories, Default and Outline, as its states. */
const story: ContainerSpec = {
  id: "story:button",
  name: "Button",
  kind: "story",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", children: [] },
  states: [
    { id: "Default", name: "Default" },
    { id: "Outline", name: "Outline" }
  ]
}

describe("pruning a design's view", () => {
  it("takes away modes the project no longer has, wherever the view names them", () => {
    const design: ContainerSpec = {
      ...story,
      view: {
        mode: "gone",
        modes: [second, "gone"],
        order: ["gone", second],
        scales: { [second]: 0.5, gone: 0.25 },
        previews: { [`Default/${second}`]: { scale: 0.5 }, "Default/gone": { scale: 0.25 } }
      }
    }

    expect(prunedView(design, { modes: defaultModeSettings })).toEqual({
      modes: [second],
      order: [second],
      scales: { [second]: 0.5 },
      previews: { [`Default/${second}`]: { scale: 0.5 } }
    })
  })

  it("takes away states the design no longer has, as a story taken out of its file", () => {
    const design: ContainerSpec = {
      ...story,
      view: {
        state: "Removed",
        states: ["Outline", "Removed"],
        stateOrder: ["Removed", "Outline", "Default"],
        previews: { [`Removed/${primary}`]: { width: 320 }, [`Outline/${primary}`]: { width: 360 } }
      }
    }

    expect(prunedView(design, { modes: defaultModeSettings })).toEqual({
      states: ["Outline"],
      stateOrder: ["Outline", "Default"],
      previews: { [`Outline/${primary}`]: { width: 360 } }
    })
  })

  it("keeps a screen's previews, whose state is its base", () => {
    const screen: ContainerSpec = {
      ...story,
      kind: "screen",
      states: undefined,
      view: { previews: { [`/${primary}`]: { width: 320 }, [`default/${second}`]: { width: 360 } } }
    }

    expect(prunedView(screen, { modes: defaultModeSettings })).toBe(screen.view)
  })

  it("takes away the values of params a page's route no longer takes, and keeps them for a design", () => {
    const page: ContainerSpec = {
      ...story,
      kind: "screen",
      states: undefined,
      view: { params: { id: "1", slug: "a" } }
    }

    expect(prunedView(page, { modes: defaultModeSettings, params: ["slug"] })).toEqual({ params: { slug: "a" } })
    expect(prunedView(page, { modes: defaultModeSettings })).toBe(page.view)
  })

  it("leaves a view that names nothing gone as it is, and drops one left empty", () => {
    const fine: ContainerSpec = { ...story, view: { modes: [second], states: ["Outline"] } }
    const stale: ContainerSpec = { ...story, view: { modes: ["gone"] } }

    expect(withPrunedView(fine, { modes: defaultModeSettings })).toBe(fine)
    expect(withPrunedView(stale, { modes: defaultModeSettings }).view).toBeUndefined()
  })
})
