import { describe, expect, it } from "vite-plus/test"
import {
  designsSelection,
  layersSelection,
  pickPreviews,
  previewsSelection,
  sameSelection,
  selectedDesigns,
  selectedNodes,
  selectedPreviews,
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

describe("selecting previews", () => {
  const design = "(stories)#plan-card"

  it("selects one preview as a mode and state of the design", () => {
    const one = previewsSelection(design, ["default/desktop-light"])

    expect(one).toEqual({ design, mode: "desktop-light", state: "default" })
    expect(selectedPreviews(one)).toEqual(["default/desktop-light"])
    expect(selectedDesigns(one)).toEqual([])
  })

  it("selects a preview alone with a click, never the same mode in other states", () => {
    const both = previewsSelection(design, ["default/desktop-light", "popular/desktop-light"])
    const clicked = pickPreviews(both, design, ["popular/desktop-light"], false)

    expect(selectedPreviews(clicked)).toEqual(["popular/desktop-light"])
  })

  it("adds a preview with Shift, the last picked holding the settings, and takes it away again", () => {
    const one = previewsSelection(design, ["default/desktop-light"])
    const two = pickPreviews(one, design, ["popular/desktop-dark"], true)

    expect(selectedPreviews(two)).toEqual(["default/desktop-light", "popular/desktop-dark"])
    expect(two).toMatchObject({ mode: "desktop-dark", state: "popular" })
    expect(selectedPreviews(pickPreviews(two, design, ["popular/desktop-dark"], true))).toEqual([
      "default/desktop-light"
    ])
  })

  it("adds a state's row with Shift, or takes it away when it's all selected", () => {
    const row = ["popular/desktop-light", "popular/desktop-dark"]
    const one = previewsSelection(design, ["default/desktop-light"])
    const added = pickPreviews(one, design, row, true)

    expect(selectedPreviews(added)).toEqual(["default/desktop-light", ...row])
    expect(selectedPreviews(pickPreviews(added, design, row, true))).toEqual(["default/desktop-light"])
  })

  it("selects the design alone once Shift takes its last preview away", () => {
    const one = previewsSelection(design, ["default/desktop-light"])

    expect(pickPreviews(one, design, ["default/desktop-light"], true)).toEqual({ design })
  })

  it("tells selections of different previews apart", () => {
    const a = previewsSelection(design, ["default/desktop-light", "popular/desktop-light"])
    const b = previewsSelection(design, ["default/desktop-dark", "popular/desktop-light"])

    expect(sameSelection(a, b)).toBe(false)
    expect(selectionKey(a)).not.toBe(selectionKey(b))
  })
})
