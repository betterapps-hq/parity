import { type CanvasDocument, type ContainerSpec, defaultModeSettings, emptyDocument } from "@parity-app/core"
import { type DocBackend, type DocOp, OpProblem } from "@parity-app/multiplayer"
import { describeProjectDoc } from "@parity-app/multiplayer/testing"
import { describe, expect, it } from "vite-plus/test"
import { localProvider } from "./local-provider.ts"

describeProjectDoc(localProvider)

const home: ContainerSpec = {
  id: "home",
  name: "Home",
  kind: "screen",
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
          { type: "text", id: "b", text: "B" }
        ]
      },
      { type: "instance", id: "cta", design: "card", slots: { actions: [{ type: "text", id: "go", text: "Go" }] } }
    ]
  }
}

const card: ContainerSpec = {
  id: "card",
  name: "Card",
  kind: "component",
  position: { x: 1000, y: 0 },
  root: { type: "layout", id: "root", children: [{ type: "text", id: "label", text: "Label" }] }
}

const about: ContainerSpec = {
  id: "about",
  name: "About",
  kind: "screen",
  position: { x: 0, y: 1000 },
  root: { type: "layout", id: "root", children: [] }
}

const open = () => {
  const files: { path: string; document: CanvasDocument }[] = [
    { path: "app.par", document: { ...emptyDocument(), containers: [home, card] } },
    { path: "more.par", document: { ...emptyDocument(), containers: [about] } },
    { path: "empty.par", document: emptyDocument() }
  ]

  return localProvider.open({ files, main: "app.par", modes: defaultModeSettings })
}

/** The layers directly inside a design's root. */
const children = (backend: DocBackend, file: string, design: number) => {
  const { root } = backend.files().get(file)!.containers[design]!

  return root.type === "layout" ? root.children : []
}

const rename: DocOp = { op: "setDesign", design: "app.par#home", path: ["name"], value: "Start" }

describe("localProvider", () => {
  it("is one person's document, without merging", () => {
    const backend = open()

    expect(localProvider.name).toBe("local")
    expect(localProvider.sync).toBe(false)
    expect(backend.provider).toBe("local")
    expect(backend.sync).toBe(false)
  })

  it("holds the files it opened as they were given", () => {
    const backend = open()

    expect(backend.files().get("app.par")!.containers[0]).toBe(home)
    expect(backend.files().get("more.par")!.containers[0]).toBe(about)
    expect(backend.modes()).toBe(defaultModeSettings)
  })

  it("copies a changed layer and those above it; its siblings, other designs and other files stay the same object", () => {
    const backend = open()
    const before = backend.files()
    const [title, row, cta] = children(backend, "app.par", 0)
    const b = row?.type === "layout" ? row.children[1] : undefined
    backend.apply([{ op: "set", design: "app.par#home", node: "a", path: ["name"], value: "First" }], "edit")
    const after = backend.files()
    const [titleAfter, rowAfter, ctaAfter] = children(backend, "app.par", 0)

    expect(after).not.toBe(before)
    expect(after.get("app.par")).not.toBe(before.get("app.par"))
    expect(after.get("app.par")!.containers[0]).not.toBe(home)
    expect(rowAfter).not.toBe(row)
    expect(rowAfter?.type === "layout" && rowAfter.children[0]?.name).toBe("First")
    expect(rowAfter?.type === "layout" && rowAfter.children[1]).toBe(b)
    expect(titleAfter).toBe(title)
    expect(ctaAfter).toBe(cta)
    expect(after.get("app.par")!.containers[1]).toBe(card)
    expect(after.get("more.par")).toBe(before.get("more.par"))
    expect(after.get("empty.par")).toBe(before.get("empty.par"))
    expect(backend.modes()).toBe(defaultModeSettings)
  })

  it("copies only the instance whose slot a layer goes into", () => {
    const backend = open()
    const [title, row, cta] = children(backend, "app.par", 0)
    const go = cta?.type === "instance" ? cta.slots?.actions?.[0] : undefined

    backend.apply(
      [
        {
          op: "insert",
          design: "app.par#home",
          parent: "cta",
          slot: "actions",
          node: { type: "text", id: "more", text: "More" }
        }
      ],
      "edit"
    )

    const [titleAfter, rowAfter, ctaAfter] = children(backend, "app.par", 0)

    expect(ctaAfter).not.toBe(cta)
    expect(ctaAfter?.type === "instance" && ctaAfter.slots?.actions?.[0]).toBe(go)
    expect(titleAfter).toBe(title)
    expect(rowAfter).toBe(row)
  })

  it("keeps a design's layers when only its own fields change", () => {
    const backend = open()
    backend.apply([rename], "edit")
    const design = backend.files().get("app.par")!.containers[0]!

    expect(design.name).toBe("Start")
    expect(design.root).toBe(home.root)
  })

  it("keeps a file's designs when only its other fields change", () => {
    const backend = open()
    const before = backend.files().get("app.par")!

    backend.apply(
      [{ op: "setFileField", file: "app.par", field: "links", value: { docs: "https://example.com" } }],
      "edit"
    )

    const after = backend.files().get("app.par")!

    expect(after).not.toBe(before)
    expect(after.containers).toBe(before.containers)
  })

  it("changes the modes without touching any file", () => {
    const backend = open()
    const before = backend.files()
    const modes = { ...defaultModeSettings, modes: [] }
    const change = backend.apply([{ op: "setModes", modes }], "edit")

    expect(backend.modes()).toBe(modes)
    expect(backend.files()).toBe(before)
    expect(change.modes).toBe(true)
    expect(change.files).toEqual(["app.par"])
  })

  it("moves a design to another file, leaving the third as it was", () => {
    const backend = open()
    const before = backend.files()
    const change = backend.apply([{ op: "moveDesign", design: "app.par#card", file: "more.par" }], "edit")
    const after = backend.files()

    expect(after.get("app.par")!.containers).toEqual([home])
    expect(after.get("app.par")!.containers[0]).toBe(home)
    expect(after.get("more.par")!.containers[0]).toBe(about)
    expect(after.get("more.par")!.containers[1]).toBe(card)
    expect(after.get("empty.par")).toBe(before.get("empty.par"))
    expect(change.designs.renamed).toEqual([{ from: "app.par#card", to: "more.par#card" }])
  })

  it("says what changed, with a new version for each commit", () => {
    const backend = open()
    const first = backend.version()

    const change = backend.apply(
      [
        { op: "editText", design: "app.par#home", node: "title", edit: { kind: "replace", text: "Hi" } },
        { op: "remove", design: "app.par#home", node: "row" },
        { op: "addDesign", file: "empty.par", design: { ...about, id: "contact", name: "Contact" } }
      ],
      "edit"
    )

    expect(change.files.toSorted()).toEqual(["app.par", "empty.par"])
    expect(change.layers.changed).toEqual([{ address: { design: "app.par#home", node: "title" }, fields: ["text"] }])
    expect(change.layers.removed.map((address) => address.node).toSorted()).toEqual(["a", "b", "row"])
    expect(change.designs.added).toEqual(["empty.par#contact"])
    expect(change.modes).toBe(false)
    expect(change.version).toEqual(backend.version())
    expect(change.version).not.toEqual(first)
    expect(change.version.provider).toBe("local")
  })

  it("leaves everything as it was when an operation can't apply", () => {
    const backend = open()
    const before = backend.files()
    const version = backend.version()

    expect(() =>
      backend.apply([rename, { op: "setDesign", design: "app.par#missing", path: ["name"], value: "Gone" }], "edit")
    ).toThrow(OpProblem)
    expect(backend.files()).toBe(before)
    expect(backend.version()).toEqual(version)
  })

  it("can't be changed once disposed", () => {
    const backend = open()
    backend.dispose()

    expect(() => backend.apply([rename], "edit")).toThrow("disposed")
  })
})
