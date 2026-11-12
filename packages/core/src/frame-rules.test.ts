import type { NodeStyle } from "@parity-app/style"
import { describe, expect, it } from "vite-plus/test"
import type { ClassPrinter } from "./adapters.ts"
import type { ContainerSpec, DesignNode } from "./document.ts"
import { frameRules, nodeSelector, previewRules, withClasses, writeClasses } from "./frame-rules.ts"
import { componentLibrary, type RenderNode, resolveDesign } from "./render.ts"

const design: ContainerSpec = {
  id: "card",
  name: "Card",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    style: { gap: 4, padding: 2 },
    children: [
      { type: "text", id: "title", text: "Hello", style: { width: 8 } },
      { type: "component", id: "button", component: "Button", props: { children: "Go" }, style: { opacity: 50 } }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "wide", name: "Wide", overrides: { title: { style: { width: 20 } } } }
  ]
}

function render(root: ContainerSpec["root"], state = design.states[0]) {
  return resolveDesign(root, state, "desktop")
}

function withStyle(id: string, style: NodeStyle): ContainerSpec["root"] {
  const root = structuredClone(design.root)

  if (root.type !== "layout") {
    throw new Error("The card's root is a layout")
  }

  const node = id === "root" ? root : root.children.find((child) => child.id === id)!
  node.style = { ...node.style, ...style }

  return root
}

/** A rule set as a frame writes it: the node's selector, then a line for each declaration. */
function rule(nodeId: string, declarations: string[]): string {
  const lines = declarations.map((declaration) => `  ${declaration};`)

  return [`[data-canvas-node="${nodeId}"] {`, ...lines, "}", ""].join("\n")
}

const rootRule = rule("root", [
  "display: flex",
  "padding: calc(var(--spacing) * 2)",
  "flex-direction: column",
  "gap: calc(var(--spacing) * 4)"
])

const titleRule = rule("title", ["margin: 0", "width: calc(var(--spacing) * 8)"])

/** Classes for an element that declares a width, as a framework that only writes widths would give. */
function widthClasses(declarations: readonly { property: string; value: string }[]): string[] | undefined {
  return declarations.some(({ property }) => property === "width") ? ["w-8"] : undefined
}

/** The drawn node with this id, anywhere in the tree, in components' slots too. */
function drawn(tree: readonly RenderNode[], id: string): RenderNode | undefined {
  for (const node of tree) {
    if (node.kind === "text") {
      continue
    }

    if (node.nodeId === id) {
      return node
    }

    const found = drawn(node.kind === "element" ? node.children : Object.values(node.slots).flat(), id)

    if (found) {
      return found
    }
  }

  return undefined
}

describe("nodeSelector", () => {
  it("finds a node by its id, an instance's inner node too", () => {
    expect(nodeSelector("title")).toBe('[data-canvas-node="title"]')
    expect(nodeSelector("card/title")).toBe('[data-canvas-node="card/title"]')
  })

  it("escapes a quote and a backslash in an id", () => {
    expect(nodeSelector(String.raw`a"b\c`)).toBe(String.raw`[data-canvas-node="a\"b\\c"]`)
  })
})

describe("frameRules", () => {
  it("writes a rule for each element that has declarations, in the tree's order, and none for a component", () => {
    const css = frameRules(render(design.root))
    expect(css).toBe([rootRule, titleRule].join("\n"))
    expect(css).not.toContain("button")
  })

  it("writes the rules of an instance's inner nodes by their ids", () => {
    const screen: DesignNode = { type: "instance", id: "first", design: "card" }
    const css = frameRules(resolveDesign(screen, undefined, "desktop", componentLibrary([design])))
    expect(css).toContain('[data-canvas-node="first"] {\n')
    expect(css).toContain(rule("first/title", ["margin: 0", "width: calc(var(--spacing) * 8)"]))
  })

  it("leaves out an element drawn by classes", () => {
    expect(frameRules(withClasses(render(design.root), widthClasses))).toBe(rootRule)
  })

  it("leaves out an element with no declarations", () => {
    const tree: RenderNode[] = [{ kind: "element", nodeId: "bare", tag: "div", declarations: [], children: [] }]
    expect(frameRules(tree)).toBe("")
  })

  it("puts the rules in a cascade layer when given one", () => {
    const css = frameRules(render(design.root), { layer: "utilities" })
    expect(css).toBe(`@layer utilities {\n${[rootRule, titleRule].join("\n")}}\n`)
  })

  it("is empty for a tree with nothing to draw, in a layer too", () => {
    const button: DesignNode = { type: "component", id: "button", component: "Button", style: { opacity: 50 } }
    expect(frameRules([])).toBe("")
    expect(frameRules(resolveDesign(button, undefined, "desktop"))).toBe("")
    expect(frameRules(resolveDesign(button, undefined, "desktop"), { layer: "utilities" })).toBe("")
  })
})

describe("previewRules", () => {
  it("gives a rule only for the element a style edit changes", () => {
    const css = previewRules(render(design.root), render(withStyle("title", { width: 80 })))
    expect(css).toBe(rule("title", ["margin: 0", "width: calc(var(--spacing) * 80)"]))
  })

  it("rolls back what the edit removes, before the declarations it keeps", () => {
    const css = previewRules(render(design.root), render(withStyle("root", { gap: undefined })))

    expect(css).toBe(
      rule("root", [
        "gap: revert-layer",
        "display: flex",
        "padding: calc(var(--spacing) * 2)",
        "flex-direction: column"
      ])
    )
  })

  it("leaves a component's change to its inline style", () => {
    expect(previewRules(render(design.root), render(withStyle("button", { opacity: 40 })))).toBe("")
  })

  it("follows the state each render shows", () => {
    const wide = design.states[1]
    // In Wide, the state's own width wins over the base design's, so a base edit to it changes nothing there.
    expect(previewRules(render(design.root, wide), render(withStyle("title", { width: 80 }), wide))).toBe("")
    expect(previewRules(render(design.root), render(design.root, wide))).toBe(
      rule("title", ["margin: 0", "width: calc(var(--spacing) * 20)"])
    )
  })

  it("is empty when nothing changes, in a layer too", () => {
    expect(previewRules(render(design.root), render(design.root))).toBe("")
    expect(previewRules(render(design.root), render(design.root), { layer: "utilities" })).toBe("")
  })

  it("leaves out elements found in only one of the trees", () => {
    const swapped = structuredClone(design.root)

    if (swapped.type !== "layout") {
      throw new Error("The card's root is a layout")
    }

    // The title is gone and a note is new: neither is a change of style.
    swapped.children = [{ type: "text", id: "note", text: "Saved", style: { width: 12 } }, ...swapped.children.slice(1)]
    expect(previewRules(render(design.root), render(swapped))).toBe("")
  })

  it("puts the rules in a cascade layer when given one", () => {
    const css = previewRules(render(design.root), render(withStyle("title", { width: 80 })), { layer: "utilities" })
    expect(css).toBe(`@layer utilities {\n${rule("title", ["margin: 0", "width: calc(var(--spacing) * 80)"])}}\n`)
  })
})

describe("withClasses", () => {
  it("puts classes on the elements the framework can draw, and leaves the others as they are", () => {
    const given = render(design.root)
    const tree = withClasses(given, widthClasses)
    expect(drawn(tree, "title")).toEqual({ ...drawn(given, "title"), classes: ["w-8"] })
    expect(drawn(tree, "root")).not.toHaveProperty("classes")
    expect(drawn(tree, "button")).toEqual(drawn(given, "button"))
  })

  it("leaves the tree it was given as it is", () => {
    const tree = render(design.root)
    const before = structuredClone(tree)
    withClasses(tree, widthClasses)
    expect(tree).toEqual(before)
  })

  it("gives no classes to an element with no declarations", () => {
    const tree: RenderNode[] = [{ kind: "element", nodeId: "bare", tag: "div", declarations: [], children: [] }]
    expect(withClasses(tree, () => ["hidden"])).toEqual(tree)
  })

  it("reaches the elements inside a component's slots", () => {
    const cell: DesignNode = {
      type: "component",
      id: "cell",
      component: "TableCell",
      slots: { children: [{ type: "text", id: "amount", text: "$1,200", style: { width: 8 } }] }
    }

    const tree = withClasses(resolveDesign(cell, undefined, "desktop"), widthClasses)
    expect(drawn(tree, "amount")).toMatchObject({ kind: "element", classes: ["w-8"] })
    expect(drawn(tree, "cell")).not.toHaveProperty("classes")
  })
})

describe("writeClasses", () => {
  /** A framework with a class for padding and for gap, and none for anything else. */
  const printer: ClassPrinter = {
    print: (declarations) => {
      const known = declarations.filter(({ property }) => property === "padding" || property === "gap")

      return {
        output: known.map(({ property, value }) => `${property}-${value}`),
        unwritten: declarations.filter((declaration) => !known.includes(declaration))
      }
    },
    read: (classes) => ({ declarations: [], unread: classes }),
    css: (classes) => classes.map((name) => `.${name}{}`).join("")
  }

  it("writes each declaration's classes by itself, and none for one the framework can't write", () => {
    const written = writeClasses(printer, new Set(), [
      { property: "padding", value: "1px" },
      { property: "color", value: "red" },
      { property: "gap", value: "2px" }
    ])

    expect(written.classes).toEqual([["padding-1px"], null, ["gap-2px"]])
  })

  it("compiles every class written so far, so a frame's elements keep the ones they already have", () => {
    const names = new Set<string>()

    expect(writeClasses(printer, names, [{ property: "padding", value: "1px" }]).css).toBe(".padding-1px{}")
    expect(writeClasses(printer, names, [{ property: "gap", value: "2px" }]).css).toBe(".padding-1px{}.gap-2px{}")
    // Asked again, a class is written once.
    expect(writeClasses(printer, names, [{ property: "padding", value: "1px" }]).css).toBe(".padding-1px{}.gap-2px{}")
  })
})
