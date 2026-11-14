import {
  type CanvasDocument,
  type ContainerSpec,
  defaultModeSettings,
  emptyDocument,
  type ModeSettings,
  type NoteSpec,
  type ReferenceSpec
} from "@parity-app/core"
import type { TokenEdit } from "@parity-app/editor"
import { describe, expect, it } from "vite-plus/test"
import { applyAgentChanges, changeTokens, restoreCopy, updateContainer, updateNote, updateView } from "../callers.ts"
import { createProjectDoc } from "../project-doc.ts"
import type { DocChange, DocOp, DocProvider, ProjectDoc } from "../types.ts"
import type { ReplicaPair } from "./replicas.ts"

/*
 * The tests every provider passes, through `createProjectDoc` (docs/proposals/multiplayer.md: The shared tests). The
 * concurrent ones, which need a `ReplicaPair`, are written with the first provider that syncs.
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
export function describeProjectDoc(provider: DocProvider, _options: { replicas?: ReplicaPair } = {}): void {
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
        expect(changes.at(-1)).toMatchObject({ kind: "replaceFile", persist: false, files: ["app.par"] })
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
          persist: true,
          layers: { changed: [{ address: { design: "app.par#home", node: "a" }, fields: ["name"] }] }
        })
        expect(changes[3]).toMatchObject({ files: [], tokens: true })
        expect(changes[4]).toMatchObject({
          files: ["more.par"],
          persist: false,
          designs: { removed: ["more.par#about"] }
        })
      })
    })
  })
}
