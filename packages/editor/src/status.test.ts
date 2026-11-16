import { type CanvasDocument, type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import type { DesignSnapshot } from "./snapshot.ts"
import { editStatus, type StatusInput } from "./status.ts"
import { noTokenEdits, withTokenEdits } from "./token-edits.ts"

function design(id: string, name = id): ContainerSpec {
  return {
    id,
    name,
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] }
  }
}

function snapshot(containers: ContainerSpec[], rest: Partial<DesignSnapshot> = {}): DesignSnapshot {
  const document: CanvasDocument = { version: 4, containers }

  return { documents: new Map([["app.par", document]]), modes: defaultModeSettings, tokens: noTokenEdits, ...rest }
}

const opened = snapshot([design("home"), design("about")])

function input(rest: Partial<StatusInput> = {}): StatusInput {
  return {
    current: opened,
    saved: opened,
    mainPath: "app.par",
    unsaved: [],
    save: { status: "saved" },
    errors: [],
    undo: [],
    redo: [],
    ...rest
  }
}

describe("editStatus", () => {
  it("starts clean, with nothing to undo", () => {
    expect(editStatus(input())).toEqual({
      dirty: false,
      unsaved: [],
      tokenEdits: 0,
      save: { status: "saved" },
      errors: [],
      undo: { count: 0 },
      redo: { count: 0 }
    })
  })

  it("tells applied, undoable changes from what's on disk, and reports failed writes", () => {
    const renamed = snapshot([design("home", "Start"), design("about")])

    expect(
      editStatus(
        input({
          current: renamed,
          unsaved: ["app.par"],
          save: { status: "failed", error: "The disk is full" },
          errors: [{ path: "app.par", error: "The disk is full" }],
          undo: ["Rename home"]
        })
      )
    ).toEqual({
      dirty: true,
      unsaved: [{ path: "app.par", kind: "document" }],
      tokenEdits: 0,
      save: { status: "failed", error: "The disk is full" },
      errors: [{ path: "app.par", error: "The disk is full" }],
      undo: { count: 1 },
      redo: { count: 0 }
    })
  })

  it("summarises what's unsaved, bounded by limit, with undo's labels newest first", () => {
    const tokens = withTokenEdits(noTokenEdits, [
      { name: "primary", theme: "default", value: "red", original: "blue" },
      { name: "primary", theme: "dark", value: "pink", original: "navy" }
    ])

    const current = snapshot([design("home", "Start"), design("pricing")], { tokens })
    const undo = ["Edit --primary", "Delete about", "Add pricing", "Rename home"]
    const status = input({ current, unsaved: ["app.par", "src/index.css"], save: { status: "unsaved" }, undo })

    expect(editStatus(status, { summary: true })).toEqual({
      dirty: true,
      unsaved: [
        { path: "app.par", kind: "document", designs: { added: ["pricing"], changed: ["home"], removed: ["about"] } },
        { path: "src/index.css", kind: "stylesheet", tokens: ["primary default", "primary dark"] }
      ],
      tokenEdits: 2,
      save: { status: "unsaved" },
      errors: [],
      undo: { count: 4, labels: undo },
      redo: { count: 0, labels: [] }
    })

    const bounded = editStatus(status, { summary: true, limit: 1 })
    expect(bounded.unsaved).toEqual([
      { path: "app.par", kind: "document", designs: { added: ["pricing"], changed: ["home"], removed: ["about"] } },
      { path: "src/index.css", kind: "stylesheet", tokens: ["primary default"], more: 1 }
    ])
    expect(bounded.undo).toEqual({ count: 4, labels: ["Edit --primary"] })
  })

  it("names changed modes in the main file's summary", () => {
    const current = { ...opened, modes: { ...defaultModeSettings, modes: [] } }

    expect(editStatus(input({ current, unsaved: ["app.par"] }), { summary: true }).unsaved).toEqual([
      { path: "app.par", kind: "document", designs: { added: [], changed: [], removed: [] }, modes: true }
    ])
  })
})
