import { type ContainerSpec, defaultModeSettings, emptyDocument } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { changedBoards } from "./boards.ts"
import { createProjectDoc } from "./project-doc.ts"
import { plainProvider } from "./testing/plain-provider.ts"
import type { DocChange, DocOp } from "./types.ts"

const design = (id: string): ContainerSpec => ({
  id,
  name: id,
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", children: [{ type: "text", id: "label", text: "Label" }] }
})

const note = (id: string) => ({ id, text: id, position: { x: 0, y: 0 } })

const open = () => {
  const doc = createProjectDoc(
    plainProvider.open({
      files: [
        {
          path: "app.par",
          document: { ...emptyDocument(), containers: [design("a"), design("b")], notes: [note("n")] }
        },
        { path: "more.par", document: emptyDocument() }
      ],
      main: "app.par",
      modes: defaultModeSettings
    }),
    { undoLimit: 10, main: "app.par" }
  )

  const changes: DocChange[] = []
  doc.subscribe((change) => changes.push(change))

  const boards = (ops: DocOp[]) => {
    const result = doc.transact("Change", ops, { origin: "edit" })
    expect(result.ok).toBe(true)
    const board = changedBoards(changes.at(-1)!)

    return board && { designs: [...board.designs], notes: [...board.notes], references: [...board.references] }
  }

  return { doc, boards }
}

describe("changedBoards", () => {
  it("names the designs, notes and references a change added, removed, moved or changed", () => {
    const { boards } = open()
    const none = { designs: [], notes: [], references: [] }

    expect(boards([{ op: "setDesign", design: "app.par#a", path: ["position"], value: { x: 4, y: 0 } }])).toEqual({
      ...none,
      designs: ["app.par#a"]
    })
    expect(boards([{ op: "addDesign", file: "app.par", design: design("c") }])).toEqual({
      ...none,
      designs: ["app.par#c"]
    })
    expect(boards([{ op: "moveDesign", design: "app.par#c", file: "more.par" }])).toEqual({
      ...none,
      designs: ["app.par#c", "more.par#c"]
    })
    expect(boards([{ op: "removeDesign", design: "app.par#b" }])).toEqual({ ...none, designs: ["app.par#b"] })
    expect(boards([{ op: "setNote", file: "app.par", note: { ...note("n"), position: { x: 9, y: 9 } } }])).toEqual({
      ...none,
      notes: ["app.par#n"]
    })
  })

  it("names a design removed and added again under its key in one change", () => {
    const { boards } = open()

    expect(
      boards([
        { op: "removeDesign", design: "app.par#a" },
        { op: "addDesign", file: "app.par", design: { ...design("a"), position: { x: 50, y: 60 }, locked: true } }
      ])
    ).toEqual({ designs: ["app.par#a"], notes: [], references: [] })
  })

  it("names the notes of a file removed and added again in one change", () => {
    const { boards } = open()
    boards([{ op: "setNote", file: "more.par", note: note("m") }])

    expect(
      boards([
        { op: "removeFile", file: "more.par" },
        { op: "addFile", file: "more.par" }
      ])
    ).toEqual({
      designs: [],
      notes: ["more.par#m"],
      references: []
    })
  })

  it("names no board for a change inside a design's layers", () => {
    const { boards } = open()

    expect(boards([{ op: "set", design: "app.par#a", node: "label", path: ["name"], value: "Title" }])).toEqual({
      designs: [],
      notes: [],
      references: []
    })
  })

  it("can't say for a file added, removed or replaced whole", () => {
    const { doc, boards } = open()
    expect(boards([{ op: "addFile", file: "new.par" }])).toBeUndefined()
    expect(boards([{ op: "removeFile", file: "new.par" }])).toBeUndefined()

    let replaced: DocChange | undefined
    doc.subscribe((change) => {
      replaced = change
    })
    doc.replaceFile("more.par", { ...emptyDocument(), containers: [design("d")] })
    expect(changedBoards(replaced!)).toBeUndefined()
  })
})
