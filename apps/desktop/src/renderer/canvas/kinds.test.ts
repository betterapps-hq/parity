import type { DesignNode, LibraryInfo } from "@parity-app/core"
import { createElement as h } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vite-plus/test"
import type { ProjectSession } from "../workspace.ts"
import { ProjectContext } from "./context.ts"
import { chipFor, kindColors, layerLabel, NodeIcon, nodeColor, textFor } from "./kinds.tsx"

// Text layers have a color of their own (PAR-792), so they stand out among a design's layers.
describe("a text layer's color", () => {
  const text = { type: "text", id: "title", text: "Pricing" } satisfies DesignNode
  const layout = { type: "layout", id: "card", children: [text] } satisfies DesignNode

  it("is green, apart from the layout around it", () => {
    expect(nodeColor(text)).toBe(kindColors.text)
    expect(nodeColor(layout)).toBe(kindColors.layer)
  })

  it("has its own chip and its own step for text on a panel", () => {
    expect(chipFor(kindColors.text)).toEqual({ background: "var(--canvas-text-chip)", color: "white" })
    expect(textFor(kindColors.text)).toBe("var(--canvas-text-text)")
  })
})

// Every icon layer shows Smile, the Icons tab's icon, whatever it draws (PAR-793), so an icon of a kind's glyph or of a
// button's never reads as that kind or that button.
describe("an icon layer's icon", () => {
  // SAFETY: telling an icon layer apart reads only a library's id and kind.
  const libraries = [
    { id: "nova", kind: "components" },
    { id: "lucide", kind: "icons" }
  ] as LibraryInfo[]

  // SAFETY: the icon reads only the project's libraries.
  const project = { info: { libraries } } as ProjectSession
  const check = { type: "component", id: "check", component: "lucide/Check" } satisfies DesignNode
  const card = { type: "component", id: "card", component: "nova/Card" } satisfies DesignNode

  const inProject = (node: DesignNode) =>
    renderToStaticMarkup(h(ProjectContext, { value: project }, h(NodeIcon, { node })))

  it("is Smile in a project's tab, where a library's other components keep the Box", () => {
    expect(inProject(check)).toContain("lucide-smile")
    expect(inProject(card)).toContain("lucide-box")
  })

  it("is Smile outside a tab when it's given the project's libraries, as Search actions gives them", () => {
    expect(renderToStaticMarkup(h(NodeIcon, { node: check, libraries }))).toContain("lucide-smile")
    expect(renderToStaticMarkup(h(NodeIcon, { node: check }))).toContain("lucide-box")
  })
})

// An icon's name is what tells it from the others, since each shows Smile (PAR-796).
describe("an icon layer's label", () => {
  // SAFETY: naming an icon layer reads only a library's id and kind.
  const libraries = [{ id: "lucide", kind: "icons" }] as LibraryInfo[]
  const plus = { type: "component", id: "plus", component: "lucide/Plus" } satisfies DesignNode

  it("is its icon when the project's libraries are given, and its name when it has one", () => {
    expect(layerLabel(plus, [], undefined, libraries)).toBe("Plus")
    expect(layerLabel({ ...plus, name: "Add" }, [], undefined, libraries)).toBe("Add")
  })

  it("is the component's id without them, as before", () => {
    expect(layerLabel(plus, [])).toBe("lucide/Plus")
  })
})
