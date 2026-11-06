import { describe, expect, it } from "vite-plus/test"
import {
  designsSelection,
  layersSelection,
  sameSelection,
  selectedDesigns,
  selectedNodes,
  selectionKey,
  toggleLayer
} from "./selection.ts"

describe("the selection", () => {
  it("lists layers with the one picked last at the end, and keeps the frame they were picked in", () => {
    const picked = layersSelection("main/sign-in", ["title", "email", "email"], {
      mode: "mobile-light",
      state: "error"
    })
    expect(picked).toEqual({
      design: "main/sign-in",
      node: "email",
      nodes: ["title", "email"],
      mode: "mobile-light",
      state: "error"
    })
    expect(selectedNodes(picked)).toEqual(["title", "email"])
    expect(selectedDesigns(picked)).toEqual([])
  })

  it("selects a design whole when no layers are given", () => {
    expect(layersSelection("main/sign-in", [], { mode: "mobile-light" })).toEqual({ design: "main/sign-in" })
  })

  it("lists designs only when no layer or mode column is selected", () => {
    const designs = designsSelection(["main/sign-in", "main/pricing"])
    expect(selectedDesigns(designs)).toEqual(["main/sign-in", "main/pricing"])
    expect(selectedDesigns({ design: "main/sign-in", mode: "tablet-light" })).toEqual([])
    expect(designsSelection([])).toEqual({})
  })

  it("adds and takes out layers with Shift, keeping the frame they were first picked in", () => {
    const first = layersSelection("main/sign-in", ["title"], { mode: "mobile-light", state: "error" })
    const both = toggleLayer(first, "main/sign-in", "email", { mode: "desktop-light", state: "default" })
    expect(both).toMatchObject({ node: "email", nodes: ["title", "email"], mode: "mobile-light", state: "error" })
    expect(toggleLayer(both, "main/sign-in", "email", {})).toMatchObject({ node: "title", mode: "mobile-light" })
    // In another design it starts again from that layer.
    expect(toggleLayer(both, "main/pricing", "plan", { mode: "desktop-light" })).toEqual({
      design: "main/pricing",
      node: "plan",
      mode: "desktop-light"
    })
  })

  it("keys a selection the same however its layers were picked, but not in another frame", () => {
    const one = layersSelection("main/sign-in", ["title", "email"], { state: "error" })
    const other = layersSelection("main/sign-in", ["email", "title"], { state: "error" })
    expect(selectionKey(one)).toBe(selectionKey(other))
    expect(sameSelection(one, other)).toBe(false)
    expect(selectionKey(layersSelection("main/sign-in", ["title", "email"], { state: "loading" }))).not.toBe(
      selectionKey(one)
    )
  })
})
