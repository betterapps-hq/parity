import { type CanvasDocument, type ContainerSpec, defaultModeSettings, type ModeSettings } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  type DesignHistory,
  type DesignStep,
  openDesigns,
  recordChange,
  undoChange,
  unsavedPaths,
  withStylesheet
} from "./history.ts"
import { type RecoveryCopy, readRecoveryCopy, recoveryCopy, restoreLabel, restoreRecovery } from "./recovery.ts"
import { withTokenEdits } from "./token-edits.ts"

function design(id: string, name = id): ContainerSpec {
  return {
    id,
    name,
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] },
    states: [{ id: "default", name: "Default" }]
  }
}

const file = (...containers: ContainerSpec[]): CanvasDocument => ({ version: 3, containers })

/** A project as it opens from its files: `app.par` with a home design, and its stylesheet. */
function open(document = file(design("home")), modes: ModeSettings = defaultModeSettings): DesignHistory {
  return withStylesheet(openDesigns([{ path: "app.par", document }], modes, "app.par"), "src/index.css")
}

function taken(step: DesignStep | undefined): DesignHistory {
  if (!step) {
    throw new Error("Expected a step")
  }

  return step.history
}

/** Renames the home design, unsaved. */
function renamed(history: DesignHistory, name = "Home page"): DesignHistory {
  const documents = new Map(history.current.documents).set("app.par", file(design("home", name)))

  return taken(recordChange(history, "Rename design", { ...history.current, documents }))
}

/** A copy written to its file and read back, as the next run reads it: as JSON, not a clone, since that's how it's kept. */
const throughFile = (copy: RecoveryCopy | undefined) => readRecoveryCopy(JSON.parse(JSON.stringify(copy) ?? "null"))

describe("recoveryCopy", () => {
  it("keeps nothing while everything is saved", () => {
    expect(recoveryCopy(open(), 1)).toBeUndefined()
  })

  it("keeps nothing once an edit is undone back to what the file holds", () => {
    expect(recoveryCopy(taken(undoChange(renamed(open()))), 1)).toBeUndefined()
  })

  it("keeps each unsaved file, the modes and the edited tokens", () => {
    let history = renamed(open())
    const modes: ModeSettings = { ...defaultModeSettings, modes: [] }

    const tokens = withTokenEdits(history.current.tokens, [
      { name: "--primary", theme: "light", value: "#f00", original: "#000" }
    ])

    history = taken(recordChange(history, "Edit", { ...history.current, modes, tokens }))

    expect(recoveryCopy(history, 42)).toEqual({
      version: 1,
      keptAt: 42,
      documents: [{ path: "app.par", document: file(design("home", "Home page")) }],
      modes,
      tokens: [{ name: "--primary", theme: "light", value: "#f00", original: "#000" }]
    })
  })
})

describe("restoreRecovery", () => {
  it("puts the changes back over a file an agent changed since, unsaved", () => {
    const copy = throughFile(recoveryCopy(renamed(open()), 1))!
    const restored = taken(restoreRecovery(open(file(design("home", "Changed by an agent"))), copy))

    expect(restored.current.documents.get("app.par")?.containers[0]?.name).toBe("Home page")
    expect(unsavedPaths(restored)).toEqual(["app.par"])
  })

  it("puts the changes back as one undoable step that leaves them unsaved", () => {
    const copy = throughFile(recoveryCopy(renamed(open()), 1))!
    const restored = taken(restoreRecovery(open(), copy))

    expect(restored.current.documents.get("app.par")?.containers[0]?.name).toBe("Home page")
    expect(unsavedPaths(restored)).toEqual(["app.par"])
    expect(restored.historyState.undoLabel).toBe(restoreLabel)
    expect(unsavedPaths(taken(undoChange(restored)))).toEqual([])
  })

  it("puts edited tokens back with the value the stylesheet holds, so Undo writes nothing", () => {
    const history = open()

    const tokens = withTokenEdits(history.current.tokens, [
      { name: "--primary", theme: "light", value: "#f00", original: "#000" }
    ])

    const copy = throughFile(recoveryCopy(taken(recordChange(history, "Edit", { ...history.current, tokens })), 1))!
    const restored = taken(restoreRecovery(open(), copy))

    expect(unsavedPaths(restored)).toEqual(["src/index.css"])
    expect(restored.current.tokens.get("--primary light")).toEqual({
      name: "--primary",
      theme: "light",
      value: "#f00",
      original: "#000"
    })
  })

  it("brings back a file the copy made, and takes out one it deleted", () => {
    const history = open()

    const documents = new Map(history.current.documents)
      .set("pages.par", file(design("pricing")))
      .set("app.par", file(design("home", "Home page")))

    const edited = taken(recordChange(history, "Add file", { ...history.current, documents }))
    const restored = taken(restoreRecovery(open(), throughFile(recoveryCopy(edited, 1))!))

    expect([...restored.current.documents.keys()].toSorted()).toEqual(["app.par", "pages.par"])
  })
})

describe("readRecoveryCopy", () => {
  it("reads a copy back, and nothing from a file that isn't one", () => {
    const copy = recoveryCopy(renamed(open()), 1)

    expect(throughFile(copy)).toEqual(copy)
    expect(readRecoveryCopy({ version: 2 })).toBeUndefined()
    expect(readRecoveryCopy("not json")).toBeUndefined()
  })
})
