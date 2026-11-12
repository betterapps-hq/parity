import { type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { addDesign, changeDesign, deleteDesign } from "./design-changes.ts"
import {
  type DesignHistory,
  type DesignStep,
  fileWrite,
  openDesigns,
  recordChange,
  redoChange,
  undoChange,
  withStylesheet,
  writeFailed,
  writeStarted,
  writeSucceeded
} from "./history.ts"
import { editStatus } from "./status.ts"
import { withTokenEdits } from "./token-edits.ts"

function design(id: string): ContainerSpec {
  return {
    id,
    name: id,
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] }
  }
}

function open(): DesignHistory {
  const containers = [design("home"), design("about")]

  return withStylesheet(
    openDesigns([{ path: "app.par", document: { version: 4, containers } }], defaultModeSettings, "app.par"),
    "src/index.css"
  )
}

function taken(step: DesignStep | undefined): DesignHistory {
  if (!step) {
    throw new Error("Expected a step")
  }

  return step.history
}

function rename(history: DesignHistory, id: string, name: string): DesignHistory {
  const next = changeDesign(history.current, { path: "app.par", id }, (container) => ({ ...container, name }))

  return taken(recordChange(history, `Rename ${id}`, next))
}

describe("editStatus", () => {
  it("starts clean at revision 0, with nothing to undo", () => {
    expect(editStatus(open())).toEqual({
      revision: 0,
      dirty: false,
      unsaved: [],
      tokenEdits: 0,
      save: { status: "saved" },
      errors: [],
      undo: { count: 0 },
      redo: { count: 0 }
    })
  })

  it("tells applied, undoable changes from what's on disk, and counts every change, undo and redo", () => {
    const renamed = rename(open(), "home", "Start")
    expect(editStatus(renamed)).toMatchObject({
      revision: 1,
      dirty: true,
      unsaved: [{ path: "app.par", kind: "document" }],
      save: { status: "unsaved" },
      undo: { count: 1 }
    })
    const undone = taken(undoChange(renamed))
    expect(editStatus(undone)).toMatchObject({ revision: 2, dirty: false, undo: { count: 0 }, redo: { count: 1 } })
    const redone = taken(redoChange(undone))
    expect(editStatus(redone)).toMatchObject({ revision: 3, dirty: true, undo: { count: 1 }, redo: { count: 0 } })
  })

  it("keeps the revision while saving, and reports a failed write until one succeeds", () => {
    const renamed = rename(open(), "home", "Start")
    const write = fileWrite(renamed, "app.par")!
    const saving = writeStarted(renamed)
    expect(editStatus(saving)).toMatchObject({ revision: 1, save: { status: "saving" } })
    const failed = writeFailed(saving, write, new Error("The disk is full"))
    expect(editStatus(failed)).toMatchObject({
      revision: 1,
      dirty: true,
      save: { status: "failed", error: "The disk is full" },
      errors: [{ path: "app.par", error: "The disk is full" }]
    })
    const saved = writeSucceeded(writeStarted(failed), write)
    expect(editStatus(saved)).toMatchObject({ revision: 1, dirty: false, save: { status: "saved" }, errors: [] })
  })

  it("summarises what's unsaved, bounded by limit, with the history's labels newest first", () => {
    let history = rename(open(), "home", "Start")
    history = taken(recordChange(history, "Add pricing", addDesign(history.current, "app.par", design("pricing"))))
    history = taken(
      recordChange(history, "Delete about", deleteDesign(history.current, { path: "app.par", id: "about" }))
    )

    const edits = withTokenEdits(history.current.tokens, [
      { name: "primary", theme: "default", value: "red", original: "blue" },
      { name: "primary", theme: "dark", value: "pink", original: "navy" }
    ])

    history = taken(recordChange(history, "Edit --primary", { ...history.current, tokens: edits }))
    expect(editStatus(history, { summary: true })).toEqual({
      revision: 4,
      dirty: true,
      unsaved: [
        { path: "app.par", kind: "document", designs: { added: ["pricing"], changed: ["home"], removed: ["about"] } },
        { path: "src/index.css", kind: "stylesheet", tokens: ["primary default", "primary dark"] }
      ],
      tokenEdits: 2,
      save: { status: "unsaved" },
      errors: [],
      undo: { count: 4, labels: ["Edit --primary", "Delete about", "Add pricing", "Rename home"] },
      redo: { count: 0, labels: [] }
    })
    const bounded = editStatus(history, { summary: true, limit: 1 })
    expect(bounded.unsaved).toEqual([
      { path: "app.par", kind: "document", designs: { added: ["pricing"], changed: ["home"], removed: ["about"] } },
      { path: "src/index.css", kind: "stylesheet", tokens: ["primary default"], more: 1 }
    ])
    expect(bounded.undo).toEqual({ count: 4, labels: ["Edit --primary"] })
  })

  it("names changed modes in the main file's summary", () => {
    const history = taken(
      recordChange(open(), "Rename a mode", { ...open().current, modes: { ...defaultModeSettings, modes: [] } })
    )

    expect(editStatus(history, { summary: true }).unsaved).toEqual([
      { path: "app.par", kind: "document", designs: { added: [], changed: [], removed: [] }, modes: true }
    ])
  })
})
