import { describe, expect, it } from "vite-plus/test"
import { canvasOutlines } from "./outlines.ts"
import { designsSelection, layersSelection, previewsSelection } from "./selection.ts"

const board = "main/sign-in"

describe("the canvas's outlines", () => {
  it("outline a selected design's board", () => {
    expect(canvasOutlines({ design: board })).toEqual([{ target: { kind: "design", design: board }, hovered: false }])
  })

  it("outline each of several designs, each as itself", () => {
    expect(canvasOutlines(designsSelection(["main/a", "main/b"])).map(({ target }) => target)).toEqual([
      { kind: "design", design: "main/a" },
      { kind: "design", design: "main/b" }
    ])
  })

  it("outline a selected layer and not the board it's in", () => {
    expect(canvasOutlines(layersSelection(board, ["title", "email"], { mode: "desktop-light" }))).toEqual([
      { target: { kind: "layer", design: board, node: "title" }, hovered: false },
      { target: { kind: "layer", design: board, node: "email" }, hovered: false }
    ])
  })

  it("outline selected previews and not their board", () => {
    expect(canvasOutlines(previewsSelection(board, ["/desktop-light", "error/mobile-light"]))).toEqual([
      { target: { kind: "preview", design: board, preview: "/desktop-light" }, hovered: false },
      { target: { kind: "preview", design: board, preview: "error/mobile-light" }, hovered: false }
    ])
  })

  it("outline a note or a reference as itself", () => {
    expect(canvasOutlines({ note: "note-1" })).toEqual([{ target: { kind: "note", note: "note-1" }, hovered: false }])
    expect(canvasOutlines({ reference: "ref-1" })).toEqual([
      { target: { kind: "reference", reference: "ref-1" }, hovered: false }
    ])
  })

  it("outline what's hovered as hovered, beside what's selected", () => {
    const hovered = { kind: "design", design: "main/other" } as const

    expect(canvasOutlines(layersSelection(board, ["title"]), hovered)).toEqual([
      { target: { kind: "layer", design: board, node: "title" }, hovered: false },
      { target: hovered, hovered: true }
    ])
  })

  it("outline a hovered layer, not its board", () => {
    expect(canvasOutlines({}, { kind: "layer", design: board, node: "email" })).toEqual([
      { target: { kind: "layer", design: board, node: "email" }, hovered: true }
    ])
  })

  it("outline no hover on a board while a layer or preview in it is selected", () => {
    const hovered = { kind: "design", design: board } as const

    expect(canvasOutlines(layersSelection(board, ["title"]), hovered)).toEqual([
      { target: { kind: "layer", design: board, node: "title" }, hovered: false }
    ])
    expect(canvasOutlines(previewsSelection(board, ["/desktop-light"]), hovered)).toEqual([
      { target: { kind: "preview", design: board, preview: "/desktop-light" }, hovered: false }
    ])
  })

  it("outline something hovered and selected once, as selected", () => {
    expect(canvasOutlines({ design: board }, { kind: "design", design: board })).toEqual([
      { target: { kind: "design", design: board }, hovered: false }
    ])
  })

  it("outline nothing when nothing's selected or hovered", () => {
    expect(canvasOutlines({})).toEqual([])
  })
})
