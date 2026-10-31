import {
  type CanvasDocument,
  type ContainerSpec,
  defaultModeSettings,
  type DesignChange,
  describeConflicts,
  type ModeSettings,
  type ModesChange
} from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  addDesign,
  addNote,
  changeDesign,
  changeDesigns,
  changeNote,
  deleteDesign,
  mergeAgentChanges,
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
    expect(replaceDocuments(start, [])).toBe(start)
  })
})

describe("merging an agent's call", () => {
  // What the call read: home and about in app.par.
  const read = snapshot({ version: 3, containers: [design("home"), design("about")] })
  const renamed = (id: string, name: string): ContainerSpec => ({ ...design(id), name })
  const change = (id: string, after: ContainerSpec | null, base: ContainerSpec | null = design(id)): DesignChange => ({
    path: "app.par",
    id,
    base,
    after
  })
  const merge = (current: DesignSnapshot, designs: DesignChange[], modes?: ModesChange) => {
    const merged = mergeAgentChanges(current, designs, modes)
    expect(merged.conflicts).toEqual([])
    return merged.snapshot
  }

  it("keeps both of two agents' changes to different designs in the same file", () => {
    const first = merge(read, [change("home", renamed("home", "Home"))])
    const second = merge(first, [change("about", renamed("about", "About"))])
    expect(names(second)).toEqual(["Home", "About"])
  })

  it("keeps the person's edit to one design while the agent renames another in the same file", () => {
    const edited = changeDesign(read, home, (container) => ({ ...container, name: "Start" }))
    expect(names(merge(edited, [change("about", renamed("about", "About"))]))).toEqual(["Start", "About"])
  })

  it("refuses a design changed by both, naming it, and applies none of the call", () => {
    const edited = changeDesign(read, home, (container) => ({ ...container, name: "Start" }))
    const merged = mergeAgentChanges(
      edited,
      [change("about", renamed("about", "About")), change("home", renamed("home", "Home"))],
      undefined,
      [{ name: "primary", theme: "default", value: "red" }]
    )
    expect(merged.conflicts).toEqual([{ path: "app.par", id: "home", name: "Start", reason: "changed" }])
    expect(merged.snapshot).toBe(edited)
    expect(describeConflicts(merged.conflicts)).toBe(
      'Not applied: since this call read the tab, "Start" (app.par) was changed in the editor, and this call ' +
        "changes it too. Run the call again to work from what's there now."
    )
  })

  it("refuses changing a design the person deleted, and creating one under an id the person added", () => {
    expect(mergeAgentChanges(deleteDesign(read, home), [change("home", renamed("home", "Home"))]).conflicts).toEqual([
      { path: "app.par", id: "home", name: "home", reason: "deleted" }
    ])
    const added = addDesign(read, "app.par", design("pricing"))
    expect(mergeAgentChanges(added, [change("pricing", renamed("pricing", "Pricing"), null)]).conflicts).toEqual([
      { path: "app.par", id: "pricing", name: "pricing", reason: "added" }
    ])
  })

  it("leaves a design the person deleted deleted, and keeps one the person added", () => {
    expect(names(merge(deleteDesign(read, home), [change("about", renamed("about", "About"))]))).toEqual(["About"])
    const added = addDesign(read, "app.par", design("pricing"))
    expect(names(merge(added, [change("about", null)]))).toEqual(["home", "pricing"])
  })

  it("creates and deletes designs, creating the file a new design goes into", () => {
    const next = merge(read, [
      change("home", null),
      { path: "new.par", id: "pricing", base: null, after: design("pricing") }
    ])
    expect(names(next)).toEqual(["about"])
    expect(next.documents.get("new.par")).toEqual({ version: 3, containers: [design("pricing")] })
  })

  it("takes a change already made the same way in the editor as applied", () => {
    const edited = changeDesign(read, home, (container) => ({ ...container, name: "Home" }))
    expect(merge(edited, [change("home", renamed("home", "Home"))]).documents).toBe(edited.documents)
    const deleted = deleteDesign(read, home)
    expect(merge(deleted, [change("home", null)]).documents).toBe(deleted.documents)
  })

  it("sets the modes only while they're as the call read them", () => {
    const after: ModeSettings = { ...defaultModeSettings, modes: [] }
    expect(merge(read, [], { base: defaultModeSettings, after }).modes).toBe(after)
    const changed = { ...read, modes: { ...defaultModeSettings, variables: [] } }
    expect(mergeAgentChanges(changed, [], { base: defaultModeSettings, after }).conflicts).toEqual([
      { name: "Modes", reason: "changed" }
    ])
  })
})
