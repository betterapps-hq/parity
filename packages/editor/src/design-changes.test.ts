import { type CanvasDocument, type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  addDesign,
  addNote,
  changeDesign,
  changeDesigns,
  changeNote,
  deleteDesign,
  moveDesign,
  replaceDocuments
} from "./design-changes.ts"
import type { DesignSnapshot } from "./history.ts"
import { noTokenEdits } from "./token-edits.ts"

function design(id: string): ContainerSpec {
  return {
    id,
    name: id,
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] },
    states: [{ id: "default", name: "Default" }]
  }
}

function snapshot(document: CanvasDocument): DesignSnapshot {
  return { documents: new Map([["app.par", document]]), modes: defaultModeSettings, tokens: noTokenEdits }
}

const home = { path: "app.par", id: "home" }
const about = { path: "app.par", id: "about" }
const names = (next: DesignSnapshot) => next.documents.get("app.par")!.containers.map((container) => container.name)

describe("changing designs", () => {
  const start = snapshot({ version: 3, containers: [design("home"), design("about")] })

  it("changes one design, and gives back the same snapshot when nothing changed", () => {
    expect(names(changeDesign(start, home, (container) => ({ ...container, name: "Home" })))).toEqual(["Home", "about"])
    expect(changeDesign(start, home, (container) => container)).toBe(start)
    expect(changeDesign(start, { path: "app.par", id: "missing" }, (container) => container)).toBe(start)
  })

  it("changes several together, in the order asked for, or none when one is missing", () => {
    const next = changeDesigns(start, [about, home], ([first, second]) => [
      { ...first!, name: "About" },
      { ...second!, name: "Home" }
    ])
    expect(names(next)).toEqual(["Home", "About"])
    expect(changeDesigns(start, [home, { path: "other.par", id: "home" }], (containers) => containers)).toBe(start)
  })

  it("moves a design to whole pixels, and leaves one already there as it is", () => {
    const container = design("home")
    expect(moveDesign(container, { x: 10.4, y: -3.6 }).position).toEqual({ x: 10, y: -4 })
    expect(moveDesign(container, { x: 0.2, y: -0.3 })).toBe(container)
  })

  it("adds a design to a file, creating it, and deletes one", () => {
    const added = addDesign(start, "new.par", design("pricing"))
    expect(added.documents.get("new.par")).toEqual({ version: 3, containers: [design("pricing")] })
    expect(names(deleteDesign(start, home))).toEqual(["about"])
    expect(deleteDesign(start, { path: "other.par", id: "home" })).toBe(start)
  })
})

describe("changing notes", () => {
  const note = { id: "hello", text: "Hello", position: { x: 0, y: 0 } }

  it("adds a note, changes it, and leaves no notes once the last is removed", () => {
    const added = addNote(snapshot({ version: 3, containers: [] }), "app.par", note)
    const ref = { path: "app.par", id: "hello" }
    const changed = changeNote(added, ref, (current) => ({ ...current, text: "Hi" }))
    expect(changed.documents.get("app.par")!.notes).toEqual([{ ...note, text: "Hi" }])
    expect(changeNote(added, ref, (current) => current)).toBe(added)
    expect(changeNote(added, ref, () => undefined).documents.get("app.par")).toEqual({ version: 3, containers: [] })
  })
})

describe("replacing documents", () => {
  it("takes the modes out of the documents, and keeps what wasn't given", () => {
    const start = snapshot({ version: 3, containers: [design("home")] })
    const modes = { ...defaultModeSettings, modes: [] }
    const next = replaceDocuments(start, [
      { path: "app.par", document: { version: 3, containers: [design("about")], modes } }
    ])
    expect(next.documents.get("app.par")).toEqual({ version: 3, containers: [design("about")] })
    expect(next.modes).toBe(start.modes)
    expect(next.tokens).toBe(start.tokens)
    expect(replaceDocuments(start, []).documents).toBe(start.documents)
  })
})
