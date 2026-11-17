import {
  type CanvasDocument,
  canvasDocument,
  type ContainerSpec,
  containerSpec,
  type DesignNode,
  defaultModeSettings,
  emptyDocument,
  type JsonValue,
  type ModeSettings,
  type NoteSpec,
  nodeIds,
  type ReferenceSpec
} from "@parity-app/core"
import { rebaseText, spliceAt, type TokenEdit, withEditedText } from "@parity-app/editor"
import { describe, expect, it } from "vite-plus/test"
import {
  applyAgentChanges,
  changeTokens,
  restoreCopy,
  setModes,
  typeInContainer,
  updateContainer,
  updateNote,
  updateView
} from "../callers.ts"
import { createProjectDoc } from "../project-doc.ts"
import type { DocChange, DocOp, DocProvider, ProjectDoc } from "../types.ts"
import type { ReplicaPair } from "./replicas.ts"

/*
 * The tests every provider passes, through `createProjectDoc` (docs/proposals/multiplayer.md: The shared tests). The
 * concurrent ones run only for a provider that offers a `ReplicaPair`.
 */

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
      { type: "instance", id: "cta", design: "card", slots: { actions: [{ type: "text", id: "go", text: "Go" }] } }
    ]
  }
}

const about: ContainerSpec = {
  id: "about",
  name: "About",
  kind: "screen",
  position: { x: 0, y: 1000 },
  root: { type: "layout", id: "root", children: [{ type: "text", id: "intro", text: "About us" }] }
}

const note = (id: string, text = id): NoteSpec => ({ id, text, position: { x: 0, y: 0 } })

const reference = (id: string): ReferenceSpec => ({
  id,
  connector: "mobbin",
  sourceId: id,
  app: "Example",
  link: `https://example.com/${id}`,
  image: { url: `https://example.com/${id}.png` },
  position: { x: 0, y: 0 }
})

const files = (): { path: string; document: CanvasDocument }[] => [
  { path: "app.par", document: { ...emptyDocument(), containers: [card, home], notes: [note("n1"), note("n2")] } },
  { path: "more.par", document: { ...emptyDocument(), containers: [about] } }
]

const darkModes: ModeSettings = {
  ...defaultModeSettings,
  modes: [...defaultModeSettings.modes, { id: "small", name: "Small", values: { viewport: "mobile" } }]
}

const primary = (value: string): TokenEdit => ({ name: "primary", theme: "default", value, original: "black" })

/** The tests every provider passes, as a Vitest suite. */
export function describeProjectDoc(provider: DocProvider, options: { replicas?: ReplicaPair } = {}): void {
  const open = (modes: ModeSettings = defaultModeSettings) => {
    const doc = createProjectDoc(provider.open({ files: files(), main: "app.par", modes }), {
      undoLimit: 200,
      main: "app.par"
    })

    const changes: DocChange[] = []
    doc.subscribe((change) => changes.push(change))

    return { doc, changes }
  }

  const apply = (doc: ProjectDoc, ops: DocOp[], label = "Change") => {
    const result = doc.transact(label, ops, { origin: "edit" })

    if (!result.ok) {
      throw new Error(`Refused: ${JSON.stringify(result.problem)}`)
    }

    return result.change
  }

  const layer = (doc: ProjectDoc, design: string, node: string) => doc.node({ design, node })

  describe(`ProjectDoc on ${provider.name}`, () => {
    describe("reading and writing", () => {
      it("reads back the files it opened, with the modes kept apart", () => {
        const { doc } = open(darkModes)

        expect(doc.file("app.par")).toEqual(files()[0]!.document)
        expect(doc.file("more.par")).toEqual(files()[1]!.document)
        expect(doc.modes()).toEqual(darkModes)
        expect(doc.design("app.par#home")).toEqual(home)
        expect(doc.parent({ design: "app.par#home", node: "a" })).toEqual({ node: "row" })
        expect(doc.parent({ design: "app.par#home", node: "go" })).toEqual({ node: "cta", slot: "actions" })
        expect(doc.parent({ design: "app.par#home", node: "root" })).toBe("design")
      })

      it("changes only what a transaction touched; everything else stays the same object", () => {
        const { doc } = open()
        const before = doc.files()
        const row = layer(doc, "app.par#home", "row")
        apply(doc, [{ op: "set", design: "app.par#home", node: "title", path: ["name"], value: "Heading" }])

        expect(layer(doc, "app.par#home", "title")?.name).toBe("Heading")
        expect(layer(doc, "app.par#home", "row")).toBe(row)
        expect(doc.design("app.par#card")).toBe(before.get("app.par")!.containers[0])
        expect(doc.file("more.par")).toBe(before.get("more.par"))
      })

      it("inserts before a sibling, into slots, and moves", () => {
        const { doc } = open()
        apply(doc, [
          {
            op: "insert",
            design: "app.par#home",
            parent: "row",
            before: "b",
            node: { type: "text", id: "c", text: "C" }
          },
          {
            op: "insert",
            design: "app.par#home",
            parent: "cta",
            slot: "actions",
            node: { type: "text", id: "more", text: "More" }
          },
          { op: "move", design: "app.par#home", node: "a", parent: "root", before: "title" }
        ])

        const root = doc.design("app.par#home")!.root
        expect(root.type === "layout" && root.children.map((child) => child.id)).toEqual(["a", "title", "row", "cta"])
        const row = layer(doc, "app.par#home", "row")
        expect(row?.type === "layout" && row.children.map((child) => child.id)).toEqual(["c", "b"])
        const cta = layer(doc, "app.par#home", "cta")
        expect(cta?.type === "instance" && cta.slots?.actions?.map((child) => child.id)).toEqual(["go", "more"])
      })

      it("adds a slot filled with nothing, takes one away, and replaces the root", () => {
        const { doc } = open()
        apply(doc, [{ op: "addSlot", design: "app.par#home", node: "cta", slot: "icon", before: "actions" }])
        let cta = layer(doc, "app.par#home", "cta")
        expect(cta?.type === "instance" && cta.slots).toEqual({
          icon: [],
          actions: [{ type: "text", id: "go", text: "Go" }]
        })

        apply(doc, [{ op: "removeSlot", design: "app.par#home", node: "cta", slot: "actions" }])
        cta = layer(doc, "app.par#home", "cta")
        expect(cta?.type === "instance" && cta.slots).toEqual({ icon: [] })

        apply(doc, [
          {
            op: "replaceRoot",
            design: "more.par#about",
            root: { type: "layout", id: "frame", children: [{ type: "text", id: "intro", text: "About us" }] }
          }
        ])
        expect(doc.design("more.par#about")?.root.id).toBe("frame")
      })

      it("sets a field, a record key, and takes them away; a record left empty goes", () => {
        const { doc } = open()
        apply(doc, [
          { op: "set", design: "app.par#home", node: "a", path: ["style", "fontWeight"], value: { value: 600 } },
          { op: "set", design: "app.par#home", node: "a", path: ["hidden"], value: true }
        ])
        expect(layer(doc, "app.par#home", "a")).toEqual({
          type: "text",
          id: "a",
          text: "A",
          hidden: true,
          style: { fontWeight: { value: 600 } }
        })

        apply(doc, [
          { op: "set", design: "app.par#home", node: "a", path: ["style", "fontWeight"] },
          { op: "set", design: "app.par#home", node: "a", path: ["hidden"] }
        ])
        expect(layer(doc, "app.par#home", "a")).toEqual({ type: "text", id: "a", text: "A" })
      })

      it("edits text by splice and by replace", () => {
        const { doc } = open()
        apply(doc, [
          {
            op: "editText",
            design: "app.par#home",
            node: "title",
            edit: { kind: "splice", at: 5, remove: 0, insert: "!" }
          }
        ])
        expect(layer(doc, "app.par#home", "title")).toMatchObject({ text: "Hello!" })

        apply(doc, [{ op: "editText", design: "app.par#home", node: "title", edit: { kind: "replace", text: "Hi" } }])
        expect(layer(doc, "app.par#home", "title")).toMatchObject({ text: "Hi" })
      })

      it("adds and removes files, designs, notes, references and file fields, and token values", () => {
        const { doc } = open()
        apply(doc, [
          { op: "addFile", file: "new.par", fields: { links: [] } },
          { op: "addDesign", file: "new.par", design: { ...about, id: "copy" } },
          { op: "setNote", file: "app.par", note: note("n0"), before: "n1" },
          { op: "setReference", file: "app.par", reference: reference("r1") },
          { op: "removeDesign", design: "more.par#about" },
          { op: "setTokens", tokens: new Map([["primary/default", primary("red")]]) }
        ])

        expect(doc.file("new.par")?.containers.map((design) => design.id)).toEqual(["copy"])
        expect(doc.file("app.par")?.notes?.map((each) => each.id)).toEqual(["n0", "n1", "n2"])
        expect(doc.file("app.par")?.references?.map((each) => each.id)).toEqual(["r1"])
        expect(doc.file("more.par")?.containers).toEqual([])
        expect(doc.tokens().get("primary/default")?.value).toBe("red")

        apply(doc, [{ op: "removeFile", file: "new.par" }])
        expect(doc.file("new.par")).toBeUndefined()
      })

      it("moves a note that's otherwise unchanged", () => {
        const { doc } = open()
        const before = doc.file("app.par")?.notes?.find((each) => each.id === "n2")
        apply(doc, [{ op: "setNote", file: "app.par", note: before!, before: "n1" }])

        expect(doc.file("app.par")?.notes?.map((each) => each.id)).toEqual(["n2", "n1"])
      })

      it("keeps a layer's id while its type changes, through a remove and an insert", () => {
        const { doc } = open()
        apply(doc, [
          { op: "remove", design: "app.par#home", node: "cta" },
          {
            op: "insert",
            design: "app.par#home",
            parent: "root",
            node: { type: "layout", id: "cta", children: [{ type: "text", id: "go", text: "Go" }] }
          }
        ])

        expect(layer(doc, "app.par#home", "cta")?.type).toBe("layout")
      })

      it("applies an insert followed by a set on the new layer", () => {
        const { doc } = open()
        apply(doc, [
          { op: "insert", design: "app.par#home", parent: "row", node: { type: "text", id: "c", text: "C" } },
          { op: "set", design: "app.par#home", node: "c", path: ["name"], value: "Third" }
        ])

        expect(layer(doc, "app.par#home", "c")?.name).toBe("Third")
      })

      it.each([
        ["an unknown design", { op: "remove", design: "app.par#nope", node: "a" }, "unknownDesign"],
        ["an unknown layer", { op: "remove", design: "app.par#home", node: "nope" }, "unknownNode"],
        [
          "a taken id",
          { op: "insert", design: "app.par#home", parent: "row", node: { type: "text", id: "a", text: "A" } },
          "takenId"
        ],
        ["a move into itself", { op: "move", design: "app.par#home", node: "row", parent: "a" }, "intoItself"],
        [
          "a before that isn't a sibling",
          { op: "move", design: "app.par#home", node: "a", parent: "root", before: "b" },
          "notSibling"
        ],
        [
          "a fixed field",
          { op: "set", design: "app.par#home", node: "a", path: ["type"], value: "layout" },
          "fixedField"
        ],
        ["an unknown file", { op: "addDesign", file: "nope.par", design: about }, "unknownFile"],
        ["a taken file", { op: "addFile", file: "more.par" }, "takenFile"],
        [
          "a value that leaves the design invalid",
          { op: "set", design: "app.par#home", node: "a", path: ["style", "fontWeight"], value: "heavy" },
          "invalid"
        ]
      ] satisfies [string, DocOp, string][])("refuses %s, changing nothing", (_, op, kind) => {
        const { doc, changes } = open()
        const before = doc.files()

        const result = doc.transact(
          "Change",
          [{ op: "set", design: "app.par#home", node: "title", path: ["name"], value: "First" }, op],
          { origin: "edit" }
        )

        expect(result.ok).toBe(false)
        expect(!result.ok && result.problem.kind).toBe(kind)
        expect(doc.files()).toBe(before)
        expect(changes).toEqual([])
        expect(doc.history().canUndo).toBe(false)
      })

      it("returns no change and makes no step for a transaction that changes nothing", () => {
        const { doc, changes } = open()

        const result = doc.transact(
          "Nothing",
          [{ op: "set", design: "app.par#home", node: "title", path: ["text"], value: "Hello" }],
          { origin: "edit" }
        )

        expect(result).toEqual({ ok: true, change: undefined })
        expect(changes).toEqual([])
        expect(doc.history().canUndo).toBe(false)
      })

      it("replaces a file as one step that isn't written, with the main file's modes", () => {
        const { doc, changes } = open()
        const document: CanvasDocument = { ...files()[0]!.document, containers: [card], modes: darkModes }
        const result = doc.replaceFile("app.par", document)

        expect(result.ok).toBe(true)
        expect(doc.file("app.par")?.containers.map((design) => design.id)).toEqual(["card"])
        expect(doc.file("app.par")?.modes).toBeUndefined()
        expect(doc.modes()).toEqual(darkModes)
        expect(changes.at(-1)).toMatchObject({ kind: "replaceFile", written: "files", files: ["app.par"] })
        expect(doc.history().undo).toHaveLength(1)
      })

      it("names the main file to write when the modes change", () => {
        const { doc } = open()

        expect(apply(doc, [{ op: "setModes", modes: darkModes }])?.files).toEqual(["app.par"])
      })

      it("reports a design moved to another file under its new key", () => {
        const { doc } = open()
        const change = apply(doc, [{ op: "moveDesign", design: "app.par#home", file: "more.par" }])

        expect(change?.designs.renamed).toEqual([{ from: "app.par#home", to: "more.par#home" }])
        expect(doc.design("more.par#home")).toEqual(home)
        expect(doc.design("app.par#home")).toBeUndefined()
      })

      it("drops a removed layer's state patches, and undo puts them back", () => {
        const { doc } = open()
        apply(doc, [{ op: "remove", design: "app.par#card", node: "label" }])

        expect(doc.design("app.par#card")?.states?.[1]).toEqual({ id: "hover", name: "Hover" })

        doc.undo()
        expect(doc.design("app.par#card")).toEqual(card)
      })

      it("keeps an existing note's place when it's set again", () => {
        const { doc } = open()
        apply(doc, [{ op: "setNote", file: "app.par", note: note("n1", "Changed") }])

        expect(doc.file("app.par")?.notes).toEqual([note("n1", "Changed"), note("n2")])
      })

      it("applies an agent's call with designs, modes, token values and references as one step", () => {
        const { doc } = open()
        const after = { ...home, name: "Start" }

        const applied = applyAgentChanges(
          doc,
          "Agent edit",
          [{ path: "app.par", id: "home", base: home, after }],
          { base: defaultModeSettings, after: darkModes },
          [primary("red")],
          [{ path: "app.par", reference: reference("r1") }]
        )

        expect(applied.conflicts).toEqual([])
        expect(doc.design("app.par#home")?.name).toBe("Start")
        expect(doc.modes()).toEqual(darkModes)
        expect(doc.tokens().size).toBe(1)
        expect(doc.history().undo).toEqual(["Agent edit"])

        doc.undo()
        expect(doc.design("app.par#home")).toEqual(home)
        expect(doc.modes()).toEqual(defaultModeSettings)
        expect(doc.tokens().size).toBe(0)
        expect(doc.file("app.par")?.references).toBeUndefined()
      })

      it("restores a recovery copy with a deleted file as one step", () => {
        const { doc } = open()

        const result = restoreCopy(doc, {
          version: 1,
          keptAt: 0,
          documents: [
            { path: "more.par", document: null },
            { path: "app.par", document: { ...files()[0]!.document, containers: [card] } }
          ],
          modes: darkModes,
          tokens: [primary("red")]
        })

        expect(result.ok).toBe(true)
        expect(doc.file("more.par")).toBeUndefined()
        expect(doc.history().undo).toHaveLength(1)

        doc.undo()
        expect(doc.file("more.par")).toEqual(files()[1]!.document)
        expect(doc.file("app.par")).toEqual(files()[0]!.document)
      })

      it("returns the same files and history until something changes", () => {
        const { doc } = open()

        expect(doc.files()).toBe(doc.files())
        expect(doc.history()).toBe(doc.history())

        const files = doc.files()
        const history = doc.history()
        apply(doc, [{ op: "set", design: "app.par#home", node: "a", path: ["name"], value: "First" }])

        expect(doc.files()).not.toBe(files)
        expect(doc.history()).not.toBe(history)
      })
    })

    describe("undo and gestures", () => {
      it("goes back and forth through steps, with their labels and meta", () => {
        const { doc } = open()
        doc.transact("Rename", [{ op: "set", design: "app.par#home", node: "a", path: ["name"], value: "First" }], {
          origin: "edit",
          meta: { selection: ["a"] }
        })
        apply(doc, [{ op: "set", design: "app.par#home", node: "b", path: ["name"], value: "Second" }], "Rename again")

        expect(doc.history()).toMatchObject({ undo: ["Rename again", "Rename"], redo: [] })
        expect(doc.undo()?.label).toBe("Rename again")
        const undone = doc.undo()
        expect(undone).toMatchObject({ label: "Rename", meta: { selection: ["a"] }, kind: "undo" })
        expect(doc.design("app.par#home")).toEqual(home)
        expect(doc.history()).toMatchObject({ undo: [], redo: ["Rename", "Rename again"] })

        expect(doc.redo()).toMatchObject({ label: "Rename", meta: { selection: ["a"] }, kind: "redo" })
        expect(layer(doc, "app.par#home", "a")?.name).toBe("First")
      })

      it("leaves what each design shows as it is now", () => {
        const { doc } = open()
        apply(doc, [{ op: "set", design: "app.par#card", node: "label", path: ["name"], value: "Title" }])
        updateView(doc, "app.par#card", "Show Hover", (view) => ({ ...view, state: "hover" }))
        doc.undo()

        expect(doc.design("app.par#card")?.view).toEqual({ state: "hover" })
        expect(layer(doc, "app.par#card", "label")?.name).toBeUndefined()
      })

      it("finds a design moved to another file when undoing", () => {
        const { doc } = open()
        apply(doc, [{ op: "moveDesign", design: "app.par#home", file: "more.par" }])
        apply(doc, [{ op: "set", design: "more.par#home", node: "a", path: ["name"], value: "First" }])
        doc.undo()
        doc.undo()

        expect(doc.design("app.par#home")).toEqual(home)
        expect(doc.file("app.par")?.containers.map((design) => design.id)).toEqual(["card", "home"])
      })

      it("makes a gesture's transactions one step, and two gestures side by side a step each", () => {
        const { doc } = open()
        const drag = doc.beginGesture()
        const resize = doc.beginGesture()

        for (const x of [1, 2, 3]) {
          doc.transact(
            "Move frame",
            [{ op: "setDesign", design: "app.par#home", path: ["position"], value: { x, y: 0 } }],
            {
              origin: "edit",
              gesture: drag
            }
          )
        }

        doc.transact(
          "Resize",
          [{ op: "set", design: "more.par#about", node: "intro", path: ["name"], value: "Wide" }],
          {
            origin: "edit",
            gesture: resize
          }
        )

        expect(doc.inGesture()).toBe(true)
        expect(doc.endGesture(drag)).toMatchObject({ step: true, transactions: 3 })
        expect(doc.endGesture(resize)).toMatchObject({ step: true, transactions: 1 })
        expect(doc.inGesture()).toBe(false)
        expect(doc.history().undo).toEqual(["Resize", "Move frame"])

        doc.undo()
        doc.undo()
        expect(doc.design("app.par#home")?.position).toEqual(home.position)
      })

      it("makes an agent's transaction during a drag a step of its own, and the drag's next one a new step", () => {
        const { doc } = open()
        const drag = doc.beginGesture()

        const move = (x: number) =>
          doc.transact(
            "Move frame",
            [{ op: "setDesign", design: "app.par#home", path: ["position"], value: { x, y: 0 } }],
            {
              origin: "edit",
              gesture: drag
            }
          )

        move(1)
        doc.transact(
          "Agent edit",
          [{ op: "set", design: "more.par#about", node: "intro", path: ["name"], value: "A" }],
          {
            origin: "agent"
          }
        )
        move(2)
        doc.endGesture(drag)

        expect(doc.history().undo).toEqual(["Move frame", "Agent edit", "Move frame"])
      })

      it("leaves no step for a gesture that ends where it began, and Redo as it was", () => {
        const { doc } = open()
        apply(doc, [{ op: "set", design: "app.par#home", node: "a", path: ["name"], value: "First" }], "Rename")
        doc.undo()

        const drag = doc.beginGesture()

        const moveNote = (x: number) =>
          updateNote(doc, "app.par#n1", "Move text", (each) => ({ ...each, position: { x, y: 0 } }), {
            gesture: drag
          })

        moveNote(50)
        moveNote(0)
        expect(doc.endGesture(drag)).toMatchObject({ step: false })
        expect(doc.history()).toMatchObject({ undo: [], redo: ["Rename"] })
      })

      it("drops a gesture's steps when it ends where it began, keeping an agent's step made meanwhile", () => {
        const { doc } = open()
        const drag = doc.beginGesture()
        const checkpoint = doc.checkpoint(drag, "app.par#home")!
        updateContainer(doc, "app.par#home", "Move frame", (design) => ({ ...design, position: { x: 5, y: 5 } }), {
          gesture: drag
        })
        doc.revert(checkpoint)
        apply(doc, [{ op: "set", design: "more.par#about", node: "intro", path: ["name"], value: "A" }], "Agent edit")
        updateContainer(doc, "app.par#home", "Move frame", (design) => ({ ...design, position: { x: 5, y: 5 } }), {
          gesture: drag
        })
        updateContainer(doc, "app.par#home", "Move frame", (design) => ({ ...design, position: home.position }), {
          gesture: drag
        })
        doc.endGesture(drag)

        expect(doc.history().undo).toEqual(["Agent edit"])
      })

      it("stops showing a step as soon as its gesture reverts it to nothing", () => {
        const { doc } = open()
        const drag = doc.beginGesture()
        const checkpoint = doc.checkpoint(drag, "app.par#home")!
        updateContainer(doc, "app.par#home", "Move frame", (design) => ({ ...design, position: { x: 5, y: 5 } }), {
          gesture: drag
        })
        expect(doc.history().canUndo).toBe(true)

        doc.revert(checkpoint)
        expect(doc.history().canUndo).toBe(false)
        doc.endGesture(drag)
      })

      it("reverts a checkpoint's design and keeps an agent's change to another design, in one step", () => {
        const { doc } = open()
        const drag = doc.beginGesture()
        const checkpoint = doc.checkpoint(drag, "app.par#home")!
        updateContainer(doc, "app.par#home", "Resize", (design) => ({ ...design, position: { x: 5, y: 5 } }), {
          gesture: drag
        })
        doc.transact(
          "Agent edit",
          [{ op: "set", design: "more.par#about", node: "intro", path: ["name"], value: "A" }],
          {
            origin: "agent"
          }
        )
        doc.revert(checkpoint)
        doc.endGesture(drag)

        expect(doc.design("app.par#home")).toEqual(home)
        expect(layer(doc, "more.par#about", "intro")?.name).toBe("A")
        expect(doc.history().undo).toEqual(["Agent edit"])
      })

      it("says whether something besides the gesture changed its design, ignoring what isn't a step", () => {
        const { doc } = open()
        const drag = doc.beginGesture()
        const checkpoint = doc.checkpoint(drag, "app.par#home")!
        updateContainer(doc, "app.par#home", "Resize", (design) => ({ ...design, position: { x: 5, y: 5 } }), {
          gesture: drag
        })
        doc.transact("Fit frame", [{ op: "setDesign", design: "app.par#home", path: ["name"], value: "Fitted" }], {
          origin: "edit",
          undoable: false
        })
        expect(doc.changedBesides(checkpoint)).toBe(false)

        doc.transact("Agent edit", [{ op: "set", design: "app.par#home", node: "a", path: ["name"], value: "A" }], {
          origin: "agent"
        })
        expect(doc.changedBesides(checkpoint)).toBe(true)
        doc.endGesture(drag)
      })

      it("cancels a gesture, leaving no step and Redo as it was", () => {
        const { doc } = open()
        apply(doc, [{ op: "set", design: "app.par#home", node: "a", path: ["name"], value: "First" }], "Rename")
        doc.undo()
        const drag = doc.beginGesture()

        for (const x of [1, 2]) {
          doc.transact(
            "Move frame",
            [{ op: "setDesign", design: "app.par#home", path: ["position"], value: { x, y: 0 } }],
            {
              origin: "edit",
              gesture: drag
            }
          )
        }

        doc.cancelGesture(drag)

        expect(doc.design("app.par#home")).toEqual(home)
        expect(doc.history()).toMatchObject({ undo: [], redo: ["Rename"] })
        expect(doc.inGesture()).toBe(false)
      })

      it("never makes steps of view changes or loading, and makes them of token edits", () => {
        const { doc } = open()
        updateView(doc, "app.par#card", "Show Hover", (view) => ({ ...view, state: "hover" }))
        expect(doc.history().canUndo).toBe(false)

        changeTokens(doc, "Change primary", [primary("red")])
        expect(doc.history().undo).toEqual(["Change primary"])

        doc.undo()
        expect(doc.tokens().size).toBe(0)
      })

      it("stops at the undo limit, and gives each step an id that's never used again", () => {
        const doc = createProjectDoc(provider.open({ files: files(), main: "app.par", modes: defaultModeSettings }), {
          undoLimit: 3,
          main: "app.par"
        })

        const ids = new Set<number | undefined>()

        for (const name of ["1", "2", "3", "4", "5"]) {
          apply(doc, [{ op: "set", design: "app.par#home", node: "a", path: ["name"], value: name }], `Rename ${name}`)
          ids.add(doc.history().step)
        }

        expect(doc.history().undo).toEqual(["Rename 5", "Rename 4", "Rename 3"])
        doc.undo()
        apply(doc, [{ op: "set", design: "app.par#home", node: "a", path: ["name"], value: "6" }], "Rename 6")
        ids.add(doc.history().step)
        expect(ids.size).toBe(6)
      })
    })

    describe("changes", () => {
      it("sends one change for each transaction, undo, redo, token edit and replaced file, naming what it touched", () => {
        const { doc, changes } = open()
        apply(doc, [{ op: "set", design: "app.par#home", node: "a", path: ["name"], value: "First" }])
        doc.undo()
        doc.redo()
        changeTokens(doc, "Change primary", [primary("red")])
        doc.replaceFile("more.par", { ...emptyDocument(), containers: [] })

        expect(changes.map((change) => change.kind)).toEqual([
          "transaction",
          "undo",
          "redo",
          "transaction",
          "replaceFile"
        ])
        expect(changes[0]).toMatchObject({
          files: ["app.par"],
          written: "no",
          layers: { changed: [{ address: { design: "app.par#home", node: "a" }, fields: ["name"] }] }
        })
        expect(changes[3]).toMatchObject({ files: [], tokens: true })
        expect(changes[4]).toMatchObject({
          files: ["more.par"],
          written: "files",
          designs: { removed: ["more.par#about"] }
        })
      })
    })

    describe.skipIf(!options.replicas)("concurrent", () => {
      /** Two people with the project open, each with their own document, exchanging what they've done. */
      const together = (modes: ModeSettings = defaultModeSettings) => {
        const pair = options.replicas!.open({ files: files(), main: "app.par", modes })
        const a = createProjectDoc(pair.a, { undoLimit: 200, main: "app.par" })
        const b = createProjectDoc(pair.b, { undoLimit: 200, main: "app.par" })
        const changesOfA: DocChange[] = []
        a.subscribe((change) => changesOfA.push(change))

        const exchange = () => {
          pair.exchange()
          expect(b.files()).toEqual(a.files())
          expect(b.modes()).toEqual(a.modes())
          expect(b.tokens()).toEqual(a.tokens())
        }

        return { a, b, exchange, changesOfA }
      }

      const set = (node: string, path: string[], value: JsonValue) =>
        ({ op: "set", design: "app.par#home", node, path, value }) satisfies DocOp

      const text = (id: string): DesignNode => ({ type: "text", id, text: id })

      /** Shows the home screen in the small mode, as picking a mode on its board does. */
      const showSmall = (doc: ProjectDoc) => {
        const view = {
          op: "setDesign",
          design: "app.par#home",
          path: ["view"],
          value: { mode: "small" }
        } satisfies DocOp

        expect(doc.transact("Show small", [view], { origin: "view" }).ok).toBe(true)
      }

      it("lands both people's changes to different fields of one layer, and the same field the same on both", () => {
        const { a, b, exchange } = together()
        apply(a, [set("title", ["name"], "Heading")])
        apply(b, [set("title", ["hidden"], true)])
        exchange()
        expect(layer(a, "app.par#home", "title")).toMatchObject({ name: "Heading", hidden: true })

        apply(a, [set("title", ["name"], "From A")])
        apply(b, [set("title", ["name"], "From B")])
        exchange()
        expect(["From A", "From B"]).toContain(layer(a, "app.par#home", "title")?.name)
      })

      it("lands both people's changes to different keys of style, the first keys of a layer without one included", () => {
        const { a, b, exchange } = together()
        apply(a, [set("title", ["style", "opacity"], { value: 0.5 })])
        apply(b, [set("title", ["style", "fontWeight"], { value: 700 })])
        apply(a, [set("a", ["style", "opacity"], { value: 0.5 })])
        apply(b, [set("a", ["style", "fontWeight"], { value: 700 })])
        exchange()
        expect(layer(a, "app.par#home", "title")).toMatchObject({
          style: { opacity: { value: 0.5 }, fontWeight: { value: 700 } }
        })
        expect(layer(a, "app.par#home", "a")).toMatchObject({
          style: { opacity: { value: 0.5 }, fontWeight: { value: 700 } }
        })
      })

      it("keeps both people's typing in one text layer", () => {
        const { a, b, exchange } = together()

        const splice = (at: number, insert: string): DocOp => ({
          op: "editText",
          design: "app.par#home",
          node: "title",
          edit: { kind: "splice", at, remove: 0, insert }
        })

        apply(a, [splice(5, " world")])
        apply(b, [splice(0, "Oh, ")])
        exchange()
        expect(layer(a, "app.par#home", "title")).toMatchObject({ text: "Oh, Hello world" })
      })

      it("keeps every letter when both people type in one text at once (PAR-1238)", () => {
        /** Someone typing in the title, a key at a time, as `LiveText` writes it: the change at the caret. */
        const typist = (doc: ProjectDoc) => {
          const read = () => {
            const title = layer(doc, "app.par#home", "title")

            return title?.type === "text" ? title.text : ""
          }

          let text = read()
          let caret = text.length

          // Others' typing moves the caret with the characters around it.
          doc.subscribe(() => {
            const now = read()

            if (now !== text) {
              caret = rebaseText(text, text, now, { start: caret, end: caret }).selection.start
              text = now
            }
          })

          return {
            moveTo: (at: number) => {
              caret = Math.min(at, text.length)
            },
            type: (key: string) => {
              const typed = text.slice(0, caret) + key + text.slice(caret)
              const splice = spliceAt(text, typed, caret + key.length)
              text = typed
              caret += key.length

              typeInContainer(
                doc,
                "app.par#home",
                "Edit text",
                (container) => withEditedText(container, undefined, "title", typed, new Map()),
                { node: "title", splice }
              )
            }
          }
        }

        // Each run types the same keys in an order of its own, with the carets moving and the copies exchanging at
        // times of their own.
        for (let run = 1; run <= 40; run++) {
          const { a, b, exchange } = together()

          const people = [
            { typist: typist(a), keys: ": a b " },
            { typist: typist(b), keys: "x y z " }
          ]

          let seed = run
          const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

          while (people.some(({ keys }) => keys.length > 0)) {
            const roll = next()
            const person = people[roll < 0.5 ? 0 : 1]!

            if (roll % 0.5 < 0.3 && person.keys.length > 0) {
              person.typist.type(person.keys[0]!)
              person.keys = person.keys.slice(1)
            } else if (roll % 0.5 < 0.35) {
              person.typist.moveTo(Math.floor(next() * 10))
            } else if (roll % 0.5 < 0.42) {
              exchange()
            }
          }

          exchange()
          const title = layer(a, "app.par#home", "title")
          const text = title?.type === "text" ? title.text : ""
          expect(text.split("").toSorted().join("")).toBe("Hello: a b x y z ".split("").toSorted().join(""))
        }
      })

      it("undoes only this person's typing, keeping what the other typed in the text since", () => {
        const { a, b, exchange } = together()

        const splice = (at: number, insert: string): DocOp => ({
          op: "editText",
          design: "app.par#home",
          node: "title",
          edit: { kind: "splice", at, remove: 0, insert }
        })

        apply(a, [splice(5, " world")])
        exchange()
        apply(b, [splice(0, "Oh, ")])
        exchange()

        expect(a.undo()).toMatchObject({ kind: "undo", kept: 0 })
        exchange()
        expect(layer(b, "app.par#home", "title")).toMatchObject({ text: "Oh, Hello" })
      })

      it("undoes typing and a deletion apart from what the other wrote on both sides of it", () => {
        const { a, b, exchange } = together()

        const splice = (at: number, remove: number, insert: string): DocOp => ({
          op: "editText",
          design: "app.par#home",
          node: "title",
          edit: { kind: "splice", at, remove, insert }
        })

        apply(a, [splice(2, 0, "X")])
        exchange()
        apply(b, [splice(6, 0, "Y")])
        apply(b, [splice(0, 0, "Z")])
        exchange()

        expect(a.undo()).toMatchObject({ kind: "undo", kept: 0 })
        exchange()
        expect(layer(b, "app.par#home", "title")).toMatchObject({ text: "ZHelloY" })

        apply(a, [splice(3, 2, "")])
        exchange()
        apply(b, [splice(5, 0, "!")])
        apply(b, [splice(0, 0, "Oh ")])
        exchange()

        expect(a.undo()).toMatchObject({ kind: "undo", kept: 0 })
        exchange()
        expect(layer(b, "app.par#home", "title")).toMatchObject({ text: "Oh ZHelloY!" })
      })

      it("undoes typing in a long text the other edited at both ends, without matching all of it", () => {
        const { a, b, exchange } = together()
        const long = "word ".repeat(4000)

        const edit = (doc: ProjectDoc, at: number, insert: string) =>
          apply(doc, [
            { op: "editText", design: "app.par#home", node: "title", edit: { kind: "splice", at, remove: 0, insert } }
          ])

        apply(a, [{ op: "editText", design: "app.par#home", node: "title", edit: { kind: "replace", text: long } }])
        exchange()
        edit(a, 10_000, "X")
        exchange()
        edit(b, long.length + 1, "Y")
        edit(b, 0, "Z")
        exchange()

        const started = performance.now()
        a.undo()
        expect(performance.now() - started).toBeLessThan(1000)
        exchange()
        expect(layer(b, "app.par#home", "title")).toMatchObject({ text: `Z${long}Y` })
      })

      it("lands two layers inserted before the same sibling, in the same order on both", () => {
        const { a, b, exchange } = together()
        apply(a, [{ op: "insert", design: "app.par#home", parent: "row", before: "b", node: text("x") }])
        apply(b, [{ op: "insert", design: "app.par#home", parent: "row", before: "b", node: text("y") }])
        exchange()
        const row = layer(a, "app.par#home", "row")
        const ids = row && "children" in row ? row.children.map((child) => child.id) : []
        expect(ids).toHaveLength(4)
        expect(ids.slice(0, 1)).toEqual(["a"])
        expect(ids.at(-1)).toBe("b")
      })

      it("ends two moves that would make a cycle without one, the same on both", () => {
        const { a, b, exchange } = together()
        const column: DesignNode = { type: "layout", id: "column", children: [] }
        apply(a, [{ op: "insert", design: "app.par#home", parent: "root", node: column }])
        exchange()

        apply(a, [{ op: "move", design: "app.par#home", node: "row", parent: "column" }])
        apply(b, [{ op: "move", design: "app.par#home", node: "column", parent: "row" }])
        exchange()
        const design = a.design("app.par#home")!
        expect(containerSpec.safeParse(design).success).toBe(true)
        expect([...nodeIds(design.root)]).toEqual(expect.arrayContaining(["row", "column", "a", "b"]))
      })

      it("gives the same result on both when one person removes a layer another is editing", () => {
        const { a, b, exchange } = together()
        apply(a, [{ op: "remove", design: "app.par#home", node: "row" }])
        apply(b, [set("a", ["name"], "Edited")])
        exchange()
        expect(layer(a, "app.par#home", "row")).toBeUndefined()
        expect(layer(a, "app.par#home", "a")).toBeUndefined()
      })

      it("drops a state's patch for a layer someone else removed, and the file still opens", () => {
        const { a, b, exchange } = together()
        apply(a, [{ op: "remove", design: "app.par#card", node: "label" }])
        apply(b, [
          {
            op: "setDesign",
            design: "app.par#card",
            path: ["states"],
            value: [
              { id: "base", name: "Base" },
              { id: "hover", name: "Hover", overrides: { label: { style: { fontWeight: { value: 800 } } } } }
            ]
          }
        ])
        exchange()
        const card = a.design("app.par#card")!
        expect(card.states?.some((state) => state.overrides?.label)).toBe(false)
        expect(canvasDocument.safeParse(a.file("app.par")).success).toBe(true)
      })

      it("repairs two layers given one id, and two layers made one slot, the same way on both", () => {
        const { a, b, exchange } = together()
        const slot = (id: string): DesignNode => ({ type: "layout", id, slot: "extra", children: [] })
        apply(a, [{ op: "insert", design: "app.par#home", parent: "row", node: text("same") }])
        apply(b, [{ op: "insert", design: "app.par#home", parent: "row", node: text("same") }])
        apply(a, [{ op: "insert", design: "app.par#card", parent: "root", node: slot("first") }])
        apply(b, [{ op: "insert", design: "app.par#card", parent: "root", node: slot("second") }])
        exchange()

        const row = layer(a, "app.par#home", "row")
        const ids = row && "children" in row ? row.children.map((child) => child.id) : []
        expect(ids).toHaveLength(4)
        expect(new Set(ids).size).toBe(4)
        expect(ids).toContain("same")

        const slots = [layer(a, "app.par#card", "first"), layer(a, "app.par#card", "second")].map((each) =>
          each?.type === "layout" ? each.slot : undefined
        )

        expect(slots).toContain("extra")
        expect(new Set(slots).size).toBe(2)
      })

      it("joins two people filling one empty slot", () => {
        const { a, b, exchange } = together()
        const instance: DesignNode = { type: "instance", id: "more", design: "card" }
        apply(a, [{ op: "insert", design: "app.par#home", parent: "root", node: instance }])
        exchange()

        apply(a, [{ op: "insert", design: "app.par#home", parent: "more", slot: "actions", node: text("one") }])
        apply(b, [{ op: "insert", design: "app.par#home", parent: "more", slot: "actions", node: text("two") }])
        exchange()
        const more = layer(a, "app.par#home", "more")
        const filled = more?.type === "instance" ? (more.slots?.actions ?? []).map((child) => child.id) : []
        expect(filled.toSorted()).toEqual(["one", "two"])
      })

      it("marks the other person's changes as not yet written, for the copy that writes files", () => {
        const { b, exchange, changesOfA } = together()
        apply(b, [set("title", ["name"], "Theirs")])
        exchange()

        expect(changesOfA.at(-1)).toMatchObject({ kind: "remote", origin: "remote", written: "no", files: ["app.par"] })
      })

      it("shares token values, and undo takes back only this person's, keeping the other person's later ones", () => {
        const { a, b, exchange, changesOfA } = together()
        const accent = (value: string): TokenEdit => ({ name: "accent", theme: "default", value, original: "white" })
        changeTokens(a, "Change primary", [primary("red")])
        exchange()
        expect(b.tokens().get("primary default")).toEqual(primary("red"))

        changeTokens(b, "Change accent", [accent("blue")])
        exchange()
        expect(changesOfA.at(-1)).toMatchObject({ kind: "remote", tokens: true, files: [] })
        expect(a.tokens().get("accent default")).toEqual(accent("blue"))

        changeTokens(b, "Change primary", [primary("green")])
        exchange()
        expect(a.undo()).toMatchObject({ kind: "undo", kept: 1 })
        exchange()
        expect(b.tokens().get("primary default")?.value).toBe("green")
        expect(b.tokens().get("accent default")?.value).toBe("blue")
      })

      it("takes back this person's token value on undo, leaving the other person's token edits", () => {
        const { a, b, exchange } = together()
        const accent = (value: string): TokenEdit => ({ name: "accent", theme: "default", value, original: "white" })
        changeTokens(a, "Change primary", [primary("red")])
        exchange()
        changeTokens(b, "Change accent", [accent("blue")])
        exchange()

        expect(a.undo()).toMatchObject({ kind: "undo", kept: 0 })
        exchange()
        expect(b.tokens().has("primary default")).toBe(false)
        expect(b.tokens().get("accent default")?.value).toBe("blue")
      })

      it("shares which state and mode each design shows, alongside the other person's edits to it", () => {
        const { a, b, exchange } = together(darkModes)
        showSmall(a)
        apply(b, [{ op: "setDesign", design: "app.par#home", path: ["name"], value: "Start" }])
        exchange()

        expect(b.design("app.par#home")).toMatchObject({ name: "Start", view: { mode: "small" } })
      })

      it("drops a mode the other person took away from what each design shows", () => {
        const { a, b, exchange } = together(darkModes)
        showSmall(a)
        exchange()
        setModes(b, defaultModeSettings, "Remove small")
        exchange()

        expect(a.modes()).toEqual(defaultModeSettings)
        expect(a.design("app.par#home")?.view).toBeUndefined()
      })

      it("undoes only this person's step, keeping the other person's later change to the same field", () => {
        const { a, b, exchange } = together()
        apply(a, [set("title", ["name"], "Mine")])
        exchange()
        apply(b, [set("title", ["name"], "Theirs")])
        exchange()

        expect(a.undo()).toMatchObject({ kind: "undo", kept: 1 })
        exchange()
        expect(layer(b, "app.par#home", "title")?.name).toBe("Theirs")
      })
    })
  })
}
