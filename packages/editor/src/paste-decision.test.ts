import type { DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  decidePaste,
  noLayoutHere,
  nothingToPaste,
  type PasteAction,
  type PasteAsk,
  type PasteContent,
  pasteContents,
  pasteStepName,
  unreadablePaste
} from "./paste-decision.ts"

/** Clipboard content that pastes as layers. */
const layerish: PasteContent[] = ["layers", "image", "svg", "video", "text"]
const media: PasteContent[] = ["layers", "image", "svg", "video"]

const empty: PasteAction = { do: "nothing", reason: "empty", message: nothingToPaste }
const quietlyEmpty: PasteAction = { do: "nothing", reason: "empty" }
const quiet = "Paste stays quiet on an empty clipboard, as it does in other apps"
const unreadable: PasteAction = { do: "nothing", reason: "unreadable", message: unreadablePaste }
const wrongKind = (message: string): PasteAction => ({ do: "nothing", reason: "wrongKind", message })
const unavailable: PasteAction = { do: "nothing" }

/**
 * Each row: which paste, where it would go, what's on the clipboard, and what it does. Every paste, place and kind of
 * content is in exactly one row. Where pastes differ on purpose, the row says why.
 */
type Row = [ask: PasteAsk, contents: PasteContent | readonly PasteContent[], does: PasteAction, onPurpose?: string]

const table: Row[] = [
  // Paste (Ctrl+V and Edit > Paste)
  [{ how: "paste", where: "design" }, layerish, { do: "layers", at: "selection" }],
  [{ how: "paste", where: "canvas" }, media, { do: "screen", at: "view" }],
  [{ how: "paste", where: "canvas" }, "text", { do: "textFrame", at: "view" }, "text alone makes a frame that hugs it"],
  [{ how: "paste", where: "design" }, "designs", { do: "designs", at: "beside" }],
  [{ how: "paste", where: "canvas" }, "designs", { do: "designs", at: "beside" }],
  [{ how: "paste", where: "design" }, "notes", { do: "notes", at: "beside" }],
  [{ how: "paste", where: "canvas" }, "notes", { do: "notes", at: "beside" }],
  [{ how: "paste", where: "design" }, "unreadable", unreadable],
  [{ how: "paste", where: "canvas" }, "unreadable", unreadable],
  [{ how: "paste", where: "design" }, "empty", quietlyEmpty, quiet],
  [{ how: "paste", where: "canvas" }, "empty", quietlyEmpty, quiet],

  // Paste over selection (Ctrl+Shift+V)
  [{ how: "over", where: "layers" }, layerish, { do: "layers", at: "over" }],
  [
    { how: "over", where: "layers" },
    ["designs", "notes"],
    wrongKind("Copy layers to paste them over layers"),
    "layers go over layers"
  ],
  [{ how: "over", where: "designs" }, "designs", { do: "designs", at: "selection" }],
  [
    { how: "over", where: "designs" },
    [...layerish, "notes"],
    wrongKind("Copy screens or components to paste them over the selection"),
    "designs go over designs"
  ],
  [{ how: "over", where: "layers" }, "unreadable", unreadable],
  [{ how: "over", where: "designs" }, "unreadable", unreadable],
  [{ how: "over", where: "layers" }, "empty", empty],
  [{ how: "over", where: "designs" }, "empty", empty],
  [
    { how: "over", where: "nothing" },
    pasteContents,
    unavailable,
    "unavailable with nothing selected to go over, as its menu item shows"
  ],

  // Paste to replace (Ctrl+Shift+R)
  [{ how: "replace", where: "layers" }, layerish, { do: "layers", at: "replace" }],
  [
    { how: "replace", where: "layers" },
    ["designs", "notes"],
    wrongKind("Copy layers to replace layers with them"),
    "only layers replace layers"
  ],
  [{ how: "replace", where: "layers" }, "unreadable", unreadable],
  [{ how: "replace", where: "layers" }, "empty", empty],
  [
    { how: "replace", where: "nothing" },
    pasteContents,
    unavailable,
    "unavailable with no layers selected, as its menu item shows"
  ],

  // Paste here, from the canvas's right-click menu
  [{ how: "here", where: "layout" }, layerish, { do: "layers", at: "pointer" }],
  [{ how: "here", where: "canvas" }, media, { do: "screen", at: "pointer" }],
  [
    { how: "here", where: "canvas" },
    "text",
    { do: "textFrame", at: "pointer" },
    "text alone makes a frame that hugs it"
  ],
  [
    { how: "here", where: "noLayout" },
    layerish,
    { do: "nothing", reason: "noTarget", message: noLayoutHere },
    "Paste here goes where the pointer is, so it never picks another place, and refuses before an image is saved"
  ],
  [
    { how: "here", where: "layout" },
    "designs",
    { do: "designs", at: "pointer" },
    "designs and notes go on the canvas wherever the pointer is"
  ],
  [{ how: "here", where: "noLayout" }, "designs", { do: "designs", at: "pointer" }],
  [{ how: "here", where: "canvas" }, "designs", { do: "designs", at: "pointer" }],
  [{ how: "here", where: "layout" }, "notes", { do: "notes", at: "pointer" }],
  [{ how: "here", where: "noLayout" }, "notes", { do: "notes", at: "pointer" }],
  [{ how: "here", where: "canvas" }, "notes", { do: "notes", at: "pointer" }],
  [{ how: "here", where: "layout" }, "unreadable", unreadable],
  [{ how: "here", where: "noLayout" }, "unreadable", unreadable],
  [{ how: "here", where: "canvas" }, "unreadable", unreadable],
  [{ how: "here", where: "layout" }, "empty", empty],
  [{ how: "here", where: "noLayout" }, "empty", empty],
  [{ how: "here", where: "canvas" }, "empty", empty]
]

/** The table one paste, place and content to a row. */
const cases = table.flatMap(([ask, contents, does]) =>
  [contents].flat().map((content) => ({
    ask,
    content,
    does,
    name: `${ask.how} with ${ask.where}: ${content}`
  }))
)

/** Every paste and place there is. */
const asks: PasteAsk[] = [
  { how: "paste", where: "design" },
  { how: "paste", where: "canvas" },
  { how: "over", where: "layers" },
  { how: "over", where: "designs" },
  { how: "over", where: "nothing" },
  { how: "replace", where: "layers" },
  { how: "replace", where: "nothing" },
  { how: "here", where: "layout" },
  { how: "here", where: "noLayout" },
  { how: "here", where: "canvas" }
]

describe("what a paste does", () => {
  it.each(cases)("$name", ({ ask, content, does }) => {
    expect(decidePaste(ask, content)).toEqual(does)
  })

  it("has every paste, place and content in exactly one row", () => {
    const every = asks.flatMap((ask) => pasteContents.map((content) => `${ask.how} with ${ask.where}: ${content}`))

    expect(cases.map(({ name }) => name).toSorted()).toEqual(every.toSorted())
  })

  it("says the same about an empty clipboard whichever paste it is but Paste, and about an unreadable copy", () => {
    const available = asks.filter((ask) => ask.where !== "nothing")
    const placed = available.filter((ask) => ask.how !== "paste")

    expect(new Set(placed.map((ask) => JSON.stringify(decidePaste(ask, "empty"))))).toEqual(
      new Set([JSON.stringify(empty)])
    )
    expect(new Set(available.map((ask) => JSON.stringify(decidePaste(ask, "unreadable"))))).toEqual(
      new Set([JSON.stringify(unreadable)])
    )
  })
})

const layer = (id: string): DesignNode => ({ type: "text", id, text: id })
const image = (id: string): DesignNode => ({ type: "image", id, src: `images/${id}.png` })
const video = (id: string): DesignNode => ({ type: "video", id, src: `videos/${id}.mp4` })

describe("a paste's undo step", () => {
  it.each<[name: string, how: "paste" | "here", content: PasteContent, nodes: DesignNode[]]>([
    ["Paste layer", "paste", "layers", [layer("a")]],
    ["Paste 2 layers", "paste", "layers", [layer("a"), layer("b")]],
    ["Paste text", "paste", "text", [layer("a")]],
    ["Paste image", "paste", "image", [image("a")]],
    ["Paste image", "paste", "svg", [image("a")]],
    ["Paste 2 images", "paste", "image", [image("a"), image("b")]],
    ["Paste video", "paste", "video", [video("a")]],
    ["Paste 3 files", "paste", "image", [image("a"), video("b"), image("c")]],
    ["Paste layer here", "here", "layers", [layer("a")]],
    ["Paste 2 layers here", "here", "layers", [layer("a"), layer("b")]],
    ["Paste text here", "here", "text", [layer("a")]],
    ["Paste image here", "here", "image", [image("a")]],
    ["Paste 2 videos here", "here", "video", [video("a"), video("b")]]
  ])("%s, for %s of %s", (name, how, content, nodes) => {
    expect(pasteStepName(how, content, nodes)).toBe(name)
  })
})
