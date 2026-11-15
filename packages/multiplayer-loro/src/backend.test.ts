import {
  type CanvasDocument,
  type ContainerSpec,
  containerSpec,
  defaultModeSettings,
  emptyDocument,
  type ModeSettings
} from "@parity-app/core"
import { createProjectDoc, type DocOp, type ProjectDoc } from "@parity-app/multiplayer"
import { LoroMap, LoroText } from "loro-crdt"
import { describe, expect, it } from "vite-plus/test"
import { type LoroBackend, openLoro } from "./backend.ts"
import { childrenOf, readDesign, rootsOf, slotKey } from "./layout.ts"

const card: ContainerSpec = {
  id: "card",
  name: "Card",
  kind: "component",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    children: [
      { type: "text", id: "label", text: "Label" },
      { type: "layout", id: "actions", slot: "actions", children: [] }
    ]
  },
  params: { label: { type: "text", default: "Label" } },
  states: [
    { id: "base", name: "Base" },
    { id: "hover", name: "Hover", overrides: { label: { style: { fontWeight: { value: 700 } } } } }
  ]
}

const home: ContainerSpec = {
  id: "home",
  name: "Home",
  kind: "screen",
  position: { x: 1000, y: 0 },
  root: {
    type: "layout",
    id: "root",
    style: { opacity: { value: 1 } },
    children: [
      { type: "text", id: "title", text: "Hello", style: { fontWeight: { value: 400 } } },
      {
        type: "layout",
        id: "row",
        children: [
          { type: "text", id: "a", text: "A" },
          { type: "text", id: "b", text: "B" }
        ]
      },
      {
        type: "instance",
        id: "cta",
        design: "card",
        slots: { actions: [{ type: "text", id: "go", text: "Go" }], empty: [] }
      }
    ]
  }
}

const frame = (id: string): ContainerSpec => ({
  id,
  name: id,
  kind: "frame",
  position: { x: 0, y: 2000 },
  root: { type: "layout", id: "root", children: [{ type: "text", id: "label", text: "Label" }] }
})

const note = (id: string) => ({ id, text: id, position: { x: 0, y: 0 } })

const files = (): { path: string; document: CanvasDocument; drawn?: boolean }[] => [
  {
    path: "app.par",
    document: { ...emptyDocument(), containers: [card, home], notes: [note("n1"), note("n2")], links: [] }
  },
  { path: "more.par", document: { ...emptyDocument(), containers: [] } },
  { path: "pages.par", document: { ...emptyDocument(), containers: [{ ...home, id: "page" }] }, drawn: true }
]

const open = (modes: ModeSettings = defaultModeSettings) => {
  const backend = openLoro({ files: files(), main: "app.par", modes })
  const doc = createProjectDoc(backend, { undoLimit: 200, main: "app.par" })

  return { backend, doc }
}

const apply = (doc: ProjectDoc, ops: DocOp[]) => {
  const result = doc.transact("Change", ops, { origin: "edit" })

  if (!result.ok) {
    throw new Error(`Refused: ${JSON.stringify(result.problem)}`)
  }
}

/** What Loro holds is what the plain values hold, drawn files aside. */
const expectInStep = (backend: LoroBackend) => {
  const plain = new Map([...backend.files()].filter(([path]) => path !== "pages.par"))
  const read = backend.read()
  expect(read.files).toEqual(plain)
  expect(read.modes).toEqual(backend.modes())
}

describe("loroProvider's backend", () => {
  it("holds what the plain values hold after every kind of operation", () => {
    const { backend, doc } = open()
    expectInStep(backend)

    const steps: DocOp[][] = [
      [
        { op: "insert", design: "app.par#home", parent: "row", before: "b", node: { type: "text", id: "x", text: "X" } }
      ],
      [
        {
          op: "insert",
          design: "app.par#home",
          parent: "cta",
          slot: "empty",
          node: { type: "text", id: "y", text: "Y" }
        }
      ],
      [
        {
          op: "insert",
          design: "app.par#home",
          parent: "cta",
          slot: "fresh",
          node: { type: "text", id: "z", text: "Z" }
        }
      ],
      [{ op: "move", design: "app.par#home", node: "x", parent: "cta", slot: "actions", before: "go" }],
      [{ op: "move", design: "app.par#home", node: "a", parent: "root" }],
      [{ op: "remove", design: "app.par#home", node: "b" }],
      [{ op: "set", design: "app.par#home", node: "title", path: ["style", "opacity"], value: { value: 0.5 } }],
      [{ op: "set", design: "app.par#home", node: "title", path: ["style", "fontWeight"] }],
      [{ op: "set", design: "app.par#home", node: "title", path: ["style", "opacity"] }],
      [{ op: "set", design: "app.par#home", node: "title", path: ["style"], value: { opacity: { value: 0.25 } } }],
      [{ op: "set", design: "app.par#home", node: "title", path: ["name"], value: "Title" }],
      [{ op: "set", design: "app.par#home", node: "title", path: ["text"], value: "Hi there" }],
      [
        {
          op: "editText",
          design: "app.par#home",
          node: "title",
          edit: { kind: "splice", at: 2, remove: 6, insert: "!" }
        }
      ],
      [{ op: "editText", design: "app.par#home", node: "a", edit: { kind: "replace", text: "Replaced" } }],
      [{ op: "addSlot", design: "app.par#home", node: "cta", slot: "first", before: "actions" }],
      [{ op: "removeSlot", design: "app.par#home", node: "cta", slot: "actions" }],
      [{ op: "setDesign", design: "app.par#card", path: ["states"] }],
      [{ op: "replaceRoot", design: "app.par#card", root: { type: "layout", id: "frame", children: [] } }],
      [{ op: "setDesign", design: "app.par#card", path: ["params", "size"], value: { type: "text", default: "M" } }],
      [{ op: "setDesign", design: "app.par#card", path: ["params", "label"] }],
      [{ op: "setDesign", design: "app.par#card", path: ["name"], value: "Button" }],
      [{ op: "addFile", file: "new.par", fields: { links: [] } }],
      [{ op: "addDesign", file: "new.par", design: frame("copy") }],
      [{ op: "addDesign", file: "app.par", design: frame("first"), before: "app.par#card" }],
      [{ op: "moveDesign", design: "app.par#first", before: "app.par#home" }],
      [{ op: "moveDesign", design: "app.par#first", file: "more.par" }],
      [{ op: "removeDesign", design: "new.par#copy" }],
      [{ op: "setNote", file: "app.par", note: note("n3"), before: "n1" }],
      [{ op: "setNote", file: "app.par", note: { ...note("n1"), text: "Changed" } }],
      [{ op: "setNote", file: "app.par", note: note("n2"), before: "n3" }],
      [{ op: "removeNote", file: "app.par", id: "n1" }],
      [{ op: "setFileField", file: "app.par", field: "links" }],
      [{ op: "setFileField", file: "more.par", field: "links", value: [] }],
      [{ op: "removeFile", file: "new.par" }],
      [{ op: "addFile", file: "new.par" }],
      [{ op: "setModes", modes: { ...defaultModeSettings, $schema: "modes.json" } }]
    ]

    for (const ops of steps) {
      apply(doc, ops)
      expectInStep(backend)
    }

    // Undo runs every inverse back through the same path.
    while (doc.history().canUndo) {
      doc.undo()
      expectInStep(backend)
    }

    expect(doc.history().canUndo).toBe(false)
  })

  it("lays designs and layers out in one tree, with slots as nodes and record fields and text mergeable", () => {
    const { backend } = open()
    const roots = rootsOf(backend.doc.getTree("designs"))
    expect(roots.map((root) => root.data.get("id"))).toEqual(["card", "home"])
    expect(backend.doc.getTree("designs").isFractionalIndexEnabled()).toBe(true)

    const [designRoot] = childrenOf(roots[1]!)
    const [title, , cta] = childrenOf(designRoot!)
    expect(title!.data.get("text")).toBeInstanceOf(LoroText)
    expect(title!.data.get("style")).toBeInstanceOf(LoroMap)
    // Made with `ensureMergeable*`, so two people making one get the same container.
    const style = title!.data.get("style")
    expect(style instanceof LoroMap ? style.id : "").toContain(">style")
    expect(childrenOf(cta!).map((slot) => slot.data.get(slotKey))).toEqual(["actions", "empty"])
    expect(childrenOf(childrenOf(cta!)[1]!)).toEqual([])
    expect(roots[0]!.data.get("params")).toBeInstanceOf(LoroMap)
    expect(backend.doc.getMap("notes").get("app.par")?.toJSON()).toEqual([note("n1"), note("n2")])
  })

  it("reads fields back in the order core's schema lists them", () => {
    const { backend } = open()
    const design = readDesign(rootsOf(backend.doc.getTree("designs"))[0]!)
    expect(Object.keys(design)).toEqual(Object.keys(containerSpec.parse(card)))
    expect(Object.keys(design.root)).toEqual(Object.keys(containerSpec.parse(card).root))
  })

  it("keeps drawn files and token edits out of Loro", () => {
    const { backend, doc } = open()
    expect([...backend.read().files.keys()]).toEqual(["app.par", "more.par"])
    const frontiers = JSON.stringify(backend.doc.frontiers())
    const version = backend.version()

    const drawnResult = doc.transact(
      "Draw",
      [{ op: "setDesign", design: "pages.par#page", path: ["name"], value: "Drawn" }],
      {
        origin: "code"
      }
    )

    expect(drawnResult).toMatchObject({ ok: true })
    expect(doc.design("pages.par#page")?.name).toBe("Drawn")
    expect(JSON.stringify(backend.doc.frontiers())).toBe(frontiers)
    expect(backend.version()).not.toEqual(version)

    doc.transact("Tokens", [{ op: "setTokens", tokens: new Map() }], { origin: "edit" })
    expect(JSON.stringify(backend.doc.frontiers())).toBe(frontiers)
  })

  it("makes one commit for each transaction, with no message", () => {
    const { backend, doc } = open()
    let commits = 0
    backend.doc.subscribe((batch) => {
      if (batch.by === "local") {
        commits += 1
      }
    })

    apply(doc, [
      { op: "set", design: "app.par#home", node: "title", path: ["name"], value: "One" },
      { op: "set", design: "app.par#home", node: "a", path: ["name"], value: "Two" },
      { op: "setNote", file: "app.par", note: note("n3") }
    ])
    expect(commits).toBe(1)
    const changes = [...backend.doc.getAllChanges().values()].flat()
    expect(changes.every((change) => change.message === undefined)).toBe(true)
  })

  it("splices text by UTF-16 offset, as the plain values do", () => {
    const { backend, doc } = open()
    apply(doc, [{ op: "editText", design: "app.par#home", node: "title", edit: { kind: "replace", text: "a😀b" } }])
    apply(doc, [
      { op: "editText", design: "app.par#home", node: "title", edit: { kind: "splice", at: 3, remove: 1, insert: "c" } }
    ])
    expect(doc.node({ design: "app.par#home", node: "title" })).toMatchObject({ text: "a😀c" })
    expectInStep(backend)
  })

  it("starts a record or a file added again empty, though Loro keeps what it held", () => {
    const { backend, doc } = open()
    apply(doc, [{ op: "set", design: "app.par#home", node: "title", path: ["style"] }])
    apply(doc, [{ op: "set", design: "app.par#home", node: "title", path: ["style", "opacity"], value: { value: 1 } }])
    expect(doc.node({ design: "app.par#home", node: "title" })).toMatchObject({ style: { opacity: { value: 1 } } })
    expectInStep(backend)

    apply(doc, [{ op: "setNote", file: "more.par", note: note("m1") }])
    apply(doc, [{ op: "removeFile", file: "more.par" }])
    apply(doc, [{ op: "addFile", file: "more.par" }])
    expect(backend.read().files.get("more.par")).toEqual(emptyDocument())
    expectInStep(backend)
  })

  it("exchanges changes with a replica opened from its snapshot, each holding what Loro holds", () => {
    const a = openLoro({ files: files(), main: "app.par", modes: defaultModeSettings })

    const b = openLoro(
      { files: files(), main: "app.par", modes: defaultModeSettings },
      a.doc.export({ mode: "snapshot" })
    )

    const seen: string[][] = []
    b.subscribe((change) => seen.push([...change.files]))

    a.apply([{ op: "set", design: "app.par#home", node: "title", path: ["name"], value: "Shared" }], "edit")
    a.apply([{ op: "addFile", file: "new.par" }], "edit")
    a.apply([{ op: "addDesign", file: "new.par", design: { ...card, id: "copy" } }], "edit")
    a.apply([{ op: "setModes", modes: { ...defaultModeSettings, $schema: "modes.json" } }], "edit")
    b.receive(a.updates(b.versionVector()))

    expect(b.files()).toEqual(a.files())
    expect(b.modes()).toEqual(a.modes())
    expect(seen.flat().toSorted()).toEqual(["app.par", "new.par"])
    expectInStep(b)

    b.apply([{ op: "move", design: "new.par#copy", node: "label", parent: "actions" }], "edit")
    b.apply([{ op: "removeDesign", design: "app.par#card" }], "edit")
    a.receive(b.updates(a.versionVector()))
    expect(a.files()).toEqual(b.files())
    expectInStep(a)
  })

  it("repairs a merge the same way on both replicas, deriving the new id from the node", () => {
    const a = openLoro({ files: files(), main: "app.par", modes: defaultModeSettings })

    const b = openLoro(
      { files: files(), main: "app.par", modes: defaultModeSettings },
      a.doc.export({ mode: "snapshot" })
    )

    const layer = { type: "text", id: "same", text: "Same" } as const
    a.apply([{ op: "insert", design: "app.par#home", parent: "row", node: layer }], "edit")
    b.apply([{ op: "insert", design: "app.par#home", parent: "row", node: layer }], "edit")
    a.apply([{ op: "replaceRoot", design: "app.par#card", root: { type: "layout", id: "one", children: [] } }], "edit")
    b.apply([{ op: "replaceRoot", design: "app.par#card", root: { type: "layout", id: "two", children: [] } }], "edit")

    const fromA = a.updates(b.versionVector())
    const fromB = b.updates(a.versionVector())
    b.receive(fromA)
    a.receive(fromB)
    expect(
      a
        .repairs()
        .map((repair) => repair.kind)
        .toSorted()
    ).toEqual(["id", "patches", "roots"])
    expect(b.repairs()).toEqual(a.repairs())

    b.receive(a.updates(b.versionVector()))
    a.receive(b.updates(a.versionVector()))
    expect(a.files()).toEqual(b.files())
    expect(a.read().files).toEqual(b.read().files)
    expect(containerSpec.safeParse(a.files().get("app.par")?.containers[0]).success).toBe(true)
    expectInStep(a)
    expectInStep(b)
  })

  it("drops states merged onto a design that no longer takes them", () => {
    const a = openLoro({ files: files(), main: "app.par", modes: defaultModeSettings })

    const b = openLoro(
      { files: files(), main: "app.par", modes: defaultModeSettings },
      a.doc.export({ mode: "snapshot" })
    )

    a.apply(
      [
        { op: "setDesign", design: "app.par#card", path: ["states"] },
        { op: "setDesign", design: "app.par#card", path: ["params"] },
        { op: "setDesign", design: "app.par#card", path: ["kind"], value: "frame" }
      ],
      "edit"
    )

    // Edits elsewhere first, so this set is later than the other person's delete and wins the field.
    for (const name of ["One", "Two", "Three"]) {
      b.apply([{ op: "setDesign", design: "app.par#home", path: ["name"], value: name }], "edit")
    }

    b.apply(
      [{ op: "setDesign", design: "app.par#card", path: ["states"], value: [{ id: "base", name: "Base" }] }],
      "edit"
    )
    const fromA = a.updates(b.versionVector())
    const fromB = b.updates(a.versionVector())
    a.receive(fromB)
    b.receive(fromA)
    expect(a.repairs().map((repair) => repair.kind)).toContain("states")
    expect(a.files().get("app.par")?.containers[0]?.states).toBeUndefined()
    expect(b.files().get("app.par")?.containers[0]?.states).toBeUndefined()
    expectInStep(a)
  })
})
