import { describe, expect, it } from "vite-plus/test"
import {
  type FrozenElement,
  maxSheetText,
  maxSnapshotDepth,
  maxSnapshotElements,
  maxSnapshotText,
  parsePageSheets,
  parsePageSnapshot
} from "./snapshot.ts"

const body = (children: FrozenElement["children"] = []): FrozenElement => ({ tag: "body", attributes: [], children })

/** A snapshot as a page sends it. */
const snapshot = () => ({
  location: { path: "/pricing", search: "", hash: "", outcome: "landed" },
  viewport: { width: 1280, height: 800 },
  pageHeight: 2400,
  root: { classes: ["geist"], attributes: [["lang", "en"]], style: "" },
  body: body([{ tag: "main", attributes: [["class", "plans"]], children: ["Plans"] }]),
  sheets: [{ hash: "abc" }, { href: "https://fonts.example.com/a.css" }],
  markup: "m1"
})

/** A body `depth` elements deep, counting the body. */
function nested(depth: number): FrozenElement {
  let inner: FrozenElement = { tag: "div", attributes: [], children: [] }

  for (let level = 2; level < depth; level += 1) {
    inner = { tag: "div", attributes: [], children: [inner] }
  }

  return body([inner])
}

describe("parsePageSnapshot", () => {
  it("reads a snapshot as the page sent it", () => {
    expect(parsePageSnapshot(snapshot())).toEqual(snapshot())
  })

  it("keeps svg and math namespaces", () => {
    const svg: FrozenElement = { tag: "svg", namespace: "svg", attributes: [], children: [] }

    expect(parsePageSnapshot({ ...snapshot(), body: body([svg]) }).body.children).toEqual([svg])
  })

  it("refuses a body that isn't <body>, or a node that's neither text nor an element", () => {
    expect(() => parsePageSnapshot({ ...snapshot(), body: { tag: "div", attributes: [], children: [] } })).toThrow(
      "expected the body element"
    )
    expect(() => parsePageSnapshot({ ...snapshot(), body: { tag: "body", attributes: [], children: [42] } })).toThrow(
      "/body/children/0: expected text or an element"
    )
  })

  it("refuses a sheet entry with both a hash and an address, or an address that isn't a URL", () => {
    expect(() => parsePageSnapshot({ ...snapshot(), sheets: [{ hash: "a", href: "https://a.example/" }] })).toThrow(
      "/sheets/0"
    )
    expect(() => parsePageSnapshot({ ...snapshot(), sheets: [{ href: "fonts.css" }] })).toThrow("/sheets/0")
  })

  it("refuses an unknown outcome", () => {
    expect(() =>
      parsePageSnapshot({ ...snapshot(), location: { path: "/", search: "", hash: "", outcome: "x" } })
    ).toThrow("/location/outcome")
  })

  it(`takes ${maxSnapshotElements} elements and refuses one more`, () => {
    const children = Array.from({ length: maxSnapshotElements - 1 }, () => ({ tag: "i", attributes: [], children: [] }))

    expect(parsePageSnapshot({ ...snapshot(), body: body(children) }).body.children).toHaveLength(
      maxSnapshotElements - 1
    )
    expect(() => parsePageSnapshot({ ...snapshot(), body: body([...children, children[0]!]) })).toThrow(
      `at most ${maxSnapshotElements} elements`
    )
  })

  it(`takes a depth of ${maxSnapshotDepth} and refuses one more, without overflowing on a deeper one`, () => {
    expect(() => parsePageSnapshot({ ...snapshot(), body: nested(maxSnapshotDepth) })).not.toThrow()
    expect(() => parsePageSnapshot({ ...snapshot(), body: nested(maxSnapshotDepth + 1) })).toThrow(
      `at most ${maxSnapshotDepth} elements deep`
    )
    expect(() => parsePageSnapshot({ ...snapshot(), body: nested(100_000) })).toThrow(`at most ${maxSnapshotDepth}`)
  })

  it("refuses a body past the text cap", () => {
    const text = "x".repeat(maxSnapshotText / 2)

    expect(() => parsePageSnapshot({ ...snapshot(), body: body([text, text]) })).toThrow(
      `at most ${maxSnapshotText} characters`
    )
  })

  it("refuses an empty body whose own attributes pass the text cap", () => {
    const huge: FrozenElement = { tag: "body", attributes: [["class", "x".repeat(maxSnapshotText)]], children: [] }

    expect(() => parsePageSnapshot({ ...snapshot(), body: huge })).toThrow(`at most ${maxSnapshotText} characters`)
  })
})

describe("parsePageSheets", () => {
  it("reads sheets and refuses one past its cap", () => {
    expect(parsePageSheets([{ id: "a", text: "a{}" }])).toEqual([{ id: "a", text: "a{}" }])
    expect(() => parsePageSheets([{ id: "a", text: "x".repeat(maxSheetText + 1) }])).toThrow(
      `at most ${maxSheetText} characters`
    )
  })
})
