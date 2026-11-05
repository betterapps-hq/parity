import type { ContainerSpec } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { activeState, editingState } from "./editing-state.ts"

const design: ContainerSpec = {
  id: "checkout",
  name: "Checkout",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", children: [] },
  states: [
    { id: "default", name: "Default" },
    { id: "error", name: "Error" },
    { id: "loading", name: "Loading" }
  ]
}
const showingError = { ...design, view: { state: "error" } }

describe("the state edits go to", () => {
  it("is the state the layer was picked in", () => {
    expect(editingState(showingError, "loading").id).toBe("loading")
  })

  it("is the state the board shows when none was picked, or the one picked is gone", () => {
    expect(editingState(showingError, undefined).id).toBe("error")
    expect(editingState(showingError, "deleted").id).toBe("error")
  })

  it("is the base state when the board shows none, or one that's gone", () => {
    expect(editingState(design, undefined).id).toBe("default")
    expect(activeState({ ...design, view: { state: "deleted" } }).id).toBe("default")
  })
})
