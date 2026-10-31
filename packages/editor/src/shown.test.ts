import { walkNodes } from "@parity-app/core"
import { effectiveFixture } from "@parity-app/core/fixtures"
import { describe, expect, it } from "vite-plus/test"
import { boardReader, shownNode } from "./shown.ts"

const { designs, library, viewports, cases } = effectiveFixture

describe("a layer as the board shows it", () => {
  for (const { name, design, state, variants } of cases) {
    it(`reads each of the design's layers as core evaluates it: ${name}`, () => {
      const container = variants ? { ...design, view: { ...design.view, variants } } : design
      for (const viewport of [undefined, ...viewports]) {
        const read = boardReader(container, { state, viewport })
        walkNodes(container.root, (node) => {
          expect(shownNode(container, node.id, { state, viewport })).toEqual(read(node))
        })
      }
    })
  }

  it("shows a bound text's param default, the variant shown and the viewport's patches", () => {
    const card = designs.find((design) => design.id === "card")!
    expect(shownNode(card, "title")).toMatchObject({ text: "Card title", bind: { text: "title" } })
    const inline = { ...card, view: { variants: { layout: "inline" } } }
    expect(shownNode(inline, "body", { viewport: "mobile" })?.style).toEqual({ direction: "row", gap: 6, padding: 2 })
    expect(shownNode(card, "meta", { viewport: "mobile" })?.hidden).toBe(true)
  })

  it("reads a layer inside an instance by its path, given the library", () => {
    const profile = designs.find((design) => design.id === "profile")!
    expect(shownNode(profile, "person/title", { library })).toMatchObject({ text: "Ada Lovelace" })
    expect(shownNode(profile, "person/title")).toBeUndefined()
  })
})
