import {
  type CanvasDocument,
  type ContainerSpec,
  type DesignNode,
  defaultModeSettings,
  emptyDocument
} from "@parity-app/core"
import { noTokenEdits, sameDesign, sameDocument } from "@parity-app/editor"
import { describe, expect, it } from "vite-plus/test"
import { applyPlain, type DocState } from "./apply.ts"
import { containerOps, fileOps } from "./diff-ops.ts"
import { generateProject, projectSizes } from "./testing/generate-project.ts"

const stateOf = (files: { path: string; document: CanvasDocument }[]): DocState => ({
  files: new Map(files.map((file) => [file.path, file.document])),
  main: files[0]!.path,
  modes: defaultModeSettings,
  tokens: noTokenEdits
})

/** Applies `containerOps(before, after)` to `before`, as a backend would, and gives back the design it leaves. */
function roundTrip(before: ContainerSpec, after: ContainerSpec): ContainerSpec {
  const state = stateOf([{ path: "app.par", document: { ...emptyDocument(), containers: [before] } }])
  const next = applyPlain(state, containerOps(`app.par#${before.id}`, before, after))

  return next.files.get("app.par")!.containers[0]!
}

const children = (node: DesignNode): DesignNode[] => ("children" in node ? node.children : [])

function withChildren(node: DesignNode, next: DesignNode[]): DesignNode {
  return node.type === "layout" ? { ...node, children: next } : node
}

const base: ContainerSpec = {
  id: "home",
  name: "Home",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    children: [
      { type: "text", id: "title", text: "Hello" },
      {
        type: "layout",
        id: "row",
        children: [
          { type: "text", id: "a", text: "A" },
          { type: "text", id: "b", text: "B" },
          { type: "text", id: "c", text: "C" }
        ]
      },
      { type: "instance", id: "cta", design: "card", slots: { actions: [{ type: "text", id: "go", text: "Go" }] } }
    ]
  }
}

describe("containerOps", () => {
  const row = (design: ContainerSpec) => children(design.root)[1]!

  it.each<[string, (design: ContainerSpec) => ContainerSpec]>([
    [
      "a renamed layer",
      (design) => ({
        ...design,
        root: withChildren(design.root, [
          { ...children(design.root)[0]!, name: "Heading" },
          ...children(design.root).slice(1)
        ])
      })
    ],
    [
      "reordered siblings",
      (design) => ({
        ...design,
        root: withChildren(design.root, [
          children(design.root)[0]!,
          withChildren(row(design), [...children(row(design))].reverse()),
          children(design.root)[2]!
        ])
      })
    ],
    [
      "a layer moved to another parent",
      (design) => ({
        ...design,
        root: withChildren(design.root, [
          children(row(design))[0]!,
          children(design.root)[0]!,
          withChildren(row(design), children(row(design)).slice(1)),
          children(design.root)[2]!
        ])
      })
    ],
    [
      "a removed layer",
      (design) => ({ ...design, root: withChildren(design.root, children(design.root).slice(0, 2)) })
    ],
    [
      "a new layer holding existing ones",
      (design) => ({
        ...design,
        root: withChildren(design.root, [
          { type: "layout", id: "wrap", children: [children(design.root)[0]!] },
          ...children(design.root).slice(1)
        ])
      })
    ],
    [
      "a changed type that keeps its id",
      (design) => ({
        ...design,
        root: withChildren(design.root, [
          { type: "layout", id: "title", children: [] },
          ...children(design.root).slice(1)
        ])
      })
    ],
    [
      "a new text",
      (design) => ({
        ...design,
        root: withChildren(design.root, [{ type: "text", id: "title", text: "Hi" }, ...children(design.root).slice(1)])
      })
    ],
    [
      "a style key set and one taken away",
      (design) => ({
        ...design,
        root: withChildren(design.root, [
          { type: "text", id: "title", text: "Hello", style: { fontWeight: { value: 700 } } },
          ...children(design.root).slice(1)
        ])
      })
    ],
    [
      "a slot filled with nothing",
      (design) => ({
        ...design,
        root: withChildren(design.root, [
          ...children(design.root).slice(0, 2),
          { type: "instance", id: "cta", design: "card", slots: { icon: [], actions: [] } }
        ])
      })
    ],
    [
      "a slot taken away",
      (design) => ({
        ...design,
        root: withChildren(design.root, [
          ...children(design.root).slice(0, 2),
          { type: "instance", id: "cta", design: "card" }
        ])
      })
    ],
    ["a new root", (design) => ({ ...design, root: { type: "layout", id: "frame", children: [design.root] } })],
    ["design fields", (design) => ({ ...design, name: "Start", position: { x: 5, y: 5 } })]
  ])("makes the design it's given from %s", (_, change) => {
    const after = change(base)

    expect(sameDesign(roundTrip(base, after), after)).toBe(true)
  })

  it("is empty for the same object, and skips what's the same object inside", () => {
    expect(containerOps("app.par#home", base, base)).toEqual([])

    const after = { ...base, name: "Start" }
    expect(containerOps("app.par#home", base, after)).toEqual([
      { op: "setDesign", design: "app.par#home", path: ["name"], value: "Start" }
    ])
  })

  it("makes every design of a generated project from its reverse", () => {
    for (const { document } of generateProject(projectSizes.small)) {
      for (const design of document.containers) {
        // SAFETY: reversing children keeps each layer's type, so the root stays the layout it was.
        const reversed = { ...design, root: reverse(design.root) as ContainerSpec["root"] }

        expect(sameDesign(roundTrip(design, reversed), reversed)).toBe(true)
      }
    }
  })
})

function reverse(node: DesignNode): DesignNode {
  return node.type === "layout" ? { ...node, children: children(node).map(reverse).reverse() } : node
}

describe("fileOps", () => {
  const files = generateProject(projectSizes.small)
  const before = files[0]!.document

  const roundTripFile = (from: CanvasDocument | undefined, to: CanvasDocument | undefined) => {
    const state = stateOf([
      { path: "main.par", document: emptyDocument() },
      ...(from ? [{ path: "app.par", document: from }] : [])
    ])

    return applyPlain(state, fileOps("app.par", from, to)).files.get("app.par")
  }

  it("makes a file with designs reordered, added, removed and changed, and notes and fields changed", () => {
    const [first, second, third, ...rest] = before.containers

    const after: CanvasDocument = {
      ...before,
      containers: [third!, { ...first!, name: "Renamed" }, ...rest, { ...second!, id: "copy" }],
      notes: [{ id: "n", text: "Note", position: { x: 0, y: 0 } }],
      links: []
    }

    expect(sameDocument(roundTripFile(before, after)!, after)).toBe(true)
  })

  it("adds and removes a whole file", () => {
    expect(roundTripFile(undefined, before)).toEqual(before)
    expect(roundTripFile(before, undefined)).toBeUndefined()
  })
})
