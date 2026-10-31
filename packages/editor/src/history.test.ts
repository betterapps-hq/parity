import { type CanvasDocument, type ContainerSpec, defaultModeSettings, type ModeSettings } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { addDesign, changeDesign, mergeAgentChanges } from "./design-changes.ts"
import { withTidyView } from "./document-equality.ts"
import {
  type ChangeOptions,
  type DesignHistory,
  type DesignStep,
  type FileWrite,
  fileWrite,
  historyLimit,
  mergedDocument,
  openDesigns,
  recordChange,
  redoChange,
  reloadFile,
  saveFailure,
  startSave,
  undoChange,
  unsavedPaths,
  withStylesheet,
  writeFailed,
  writeStarted,
  writeSucceeded
} from "./history.ts"
import { type TokenEdit, withTokenEdits } from "./token-edits.ts"

/** Modes other than the defaults, which the main file carries. */
const custom: ModeSettings = { ...defaultModeSettings, modes: [] }

function design(id: string): ContainerSpec {
  return {
    id,
    name: id,
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] },
    states: [{ id: "default", name: "Default" }]
  }
}

function open(home = design("home")): DesignHistory {
  return withStylesheet(
    openDesigns([{ path: "app.par", document: { version: 3, containers: [home] } }], defaultModeSettings, "app.par"),
    "src/index.css"
  )
}

/** A step that must have been taken. */
function taken(step: DesignStep | undefined): DesignHistory {
  if (!step) throw new Error("Expected a step")
  return step.history
}

function add(history: DesignHistory, id: string, now = 0): DesignHistory {
  return taken(recordChange(history, "Add design", addDesign(history.current, "app.par", design(id)), {}, now))
}

function rename(history: DesignHistory, name: string, options: ChangeOptions = {}, now = 0): DesignHistory {
  const next = changeDesign(history.current, { path: "app.par", id: "home" }, (container) => ({ ...container, name }))
  return taken(recordChange(history, `Rename to ${name}`, next, options, now))
}

function showAllStates(history: DesignHistory, allStates: boolean): DesignHistory {
  const next = changeDesign(history.current, { path: "app.par", id: "home" }, (container) =>
    withTidyView(container, { ...container.view, allStates })
  )
  return taken(recordChange(history, "Change view", next, { history: false }))
}

function tokens(history: DesignHistory, edits: readonly TokenEdit[], label = "Edit --primary"): DesignHistory {
  const next = { ...history.current, tokens: withTokenEdits(history.current.tokens, edits) }
  return taken(recordChange(history, label, next))
}

function ids(history: DesignHistory): string[] {
  return history.current.documents.get("app.par")!.containers.map((container) => container.id)
}

function names(history: DesignHistory): string[] {
  return history.current.documents.get("app.par")!.containers.map((container) => container.name)
}

/** Saves a file as the app does: the write starts, then succeeds or fails. */
function save(history: DesignHistory, path: string, error?: string): { history: DesignHistory; write: FileWrite } {
  const write = fileWrite(history, path)
  if (!write) throw new Error(`Nothing to write to ${path}`)
  const started = writeStarted(history)
  expect(started.saveState).toEqual({ status: "saving" })
  return {
    history: error === undefined ? writeSucceeded(started, write) : writeFailed(started, write, new Error(error)),
    write
  }
}

/** A token edit as the token store makes it, with the value the stylesheet had when the project opened. */
const primary = (value: string): TokenEdit => ({
  name: "primary",
  theme: "default",
  value,
  original: "oklch(0.205 0 0)"
})

describe("undo", () => {
  it("goes back and forth a step at a time, with each step's label", () => {
    let history = add(open(), "about")
    history = add(history, "pricing")
    expect(history.historyState).toEqual({ canUndo: true, canRedo: false, undoLabel: "Add design" })

    history = taken(undoChange(history))
    expect(ids(history)).toEqual(["home", "about"])
    expect(history.historyState).toEqual({
      canUndo: true,
      canRedo: true,
      undoLabel: "Add design",
      redoLabel: "Add design"
    })
    history = taken(redoChange(history))
    expect(ids(history)).toEqual(["home", "about", "pricing"])
    expect(undoChange(open())).toBeUndefined()
    expect(redoChange(history)).toBeUndefined()
  })

  it("records nothing for a change that changes nothing", () => {
    const history = open()
    expect(recordChange(history, "Nothing", history.current)).toBeUndefined()
    expect(recordChange(history, "Nothing", { ...history.current })).toBeUndefined()
  })

  it("merges changes in one group less than a second apart into one step, keeping the first one's label", () => {
    let history = rename(open(), "H", { group: "typing" }, 0)
    history = rename(history, "Ho", { group: "typing" }, 900)
    history = rename(history, "Hom", { group: "typing" }, 1800)
    expect(history.past).toHaveLength(1)
    expect(history.historyState.undoLabel).toBe("Rename to H")

    history = rename(history, "Home", { group: "typing" }, 2900)
    expect(history.past).toHaveLength(2)
    history = taken(undoChange(history))
    expect(history.current.documents.get("app.par")!.containers[0]!.name).toBe("Hom")
    history = taken(undoChange(history))
    expect(history.current.documents.get("app.par")!.containers[0]!.name).toBe("home")
  })

  it("starts a new step for a change in another group, or none", () => {
    let history = rename(open(), "A", { group: "one" }, 0)
    history = rename(history, "B", { group: "two" }, 10)
    history = rename(history, "C", {}, 20)
    history = rename(history, "D", {}, 30)
    expect(history.past).toHaveLength(4)
  })

  it("forgets what was undone once something else changes", () => {
    let history = taken(undoChange(add(open(), "about")))
    expect(history.historyState.canRedo).toBe(true)
    history = add(history, "pricing")
    expect(history.historyState).toMatchObject({ canRedo: false, redoLabel: undefined })
  })

  it(`keeps the latest ${historyLimit} steps`, () => {
    let history = open()
    for (let index = 0; index < historyLimit + 5; index++) history = rename(history, `Home ${index}`)
    expect(history.past).toHaveLength(historyLimit)
    expect(history.past[0]!.label).toBe("Rename to Home 5")
  })

  it("leaves what a design shows as it is, and doesn't record changing it", () => {
    let history = add(open(), "about")
    history = showAllStates(history, true)
    expect(history.past).toHaveLength(1)
    history = taken(undoChange(history))
    expect(ids(history)).toEqual(["home"])
    expect(history.current.documents.get("app.par")!.containers[0]!.view).toEqual({ allStates: true })
    history = showAllStates(history, false)
    history = taken(redoChange(history))
    expect(ids(history)).toEqual(["home", "about"])
    expect(history.current.documents.get("app.par")!.containers[0]!.view).toBeUndefined()
  })

  it("leaves the history it was given as it was", () => {
    const before = add(open(), "about")
    const current = before.current
    taken(undoChange(before))
    expect(before.current).toBe(current)
    expect(before.past).toHaveLength(1)
  })
})

describe("unsaved files", () => {
  it("are the files changed since they were saved, and clean again once undone back to it", () => {
    let history = add(open(), "about")
    expect(unsavedPaths(history)).toEqual(["app.par"])
    expect(history.saveState).toEqual({ status: "unsaved" })
    history = taken(undoChange(history))
    expect(unsavedPaths(history)).toEqual([])
    expect(history.saveState).toEqual({ status: "saved" })
    history = taken(redoChange(history))
    expect(history.saveState).toEqual({ status: "unsaved" })
  })

  it("name the main file when the modes change, and the stylesheet when token values do", () => {
    const opened = open()
    let history = taken(recordChange(opened, "Edit modes", { ...opened.current, modes: custom }))
    expect(unsavedPaths(history)).toEqual(["app.par"])
    history = tokens(history, [primary("red")])
    expect(unsavedPaths(history)).toEqual(["app.par", "src/index.css"])
  })

  it("leave out token values back at the stylesheet's own", () => {
    let history = tokens(open(), [primary("red")])
    history = tokens(history, [primary("oklch(0.205 0 0)")])
    expect(unsavedPaths(history)).toEqual([])
    expect(fileWrite(history, "src/index.css")).toBeUndefined()
  })

  it("take a file changed back to what it holds as clean, Show every state on and off again", () => {
    let history = showAllStates(open(), true)
    expect(unsavedPaths(history)).toEqual(["app.par"])
    history = showAllStates(history, false)
    expect(unsavedPaths(history)).toEqual([])
    expect(history.current.documents.get("app.par")).toBe(history.saved.documents.get("app.par"))
  })

  it("take another state and back as clean, from a file that wrote its view out in full", () => {
    const home: ContainerSpec = {
      ...design("home"),
      states: [
        { id: "default", name: "Default" },
        { id: "loading", name: "Loading" }
      ],
      view: { state: "default", modes: [], allStates: false }
    }
    const show = (history: DesignHistory, state: string) => {
      const next = changeDesign(history.current, { path: "app.par", id: "home" }, (container) =>
        withTidyView(container, { ...container.view, state })
      )
      return taken(recordChange(history, "Change view", next, { history: false }))
    }
    let history = show(open(home), "loading")
    expect(unsavedPaths(history)).toEqual(["app.par"])
    history = show(history, "default")
    expect(unsavedPaths(history)).toEqual([])
  })

  it("keep a file that differs in more than its view unsaved until it's undone", () => {
    let history = showAllStates(open(), true)
    history = add(history, "about")
    history = showAllStates(history, false)
    expect(unsavedPaths(history)).toEqual(["app.par"])
    history = taken(undoChange(history))
    expect(unsavedPaths(history)).toEqual([])
  })
})

describe("files changed outside the canvas", () => {
  const fromDisk: CanvasDocument = { version: 3, containers: [design("home"), design("pricing")] }

  it("are taken as saved, as one step, and not written back", () => {
    const step = reloadFile(open(), "app.par", fromDisk)
    expect(step?.writes).toEqual([])
    const history = taken(step)
    expect(ids(history)).toEqual(["home", "pricing"])
    expect(history.saveState).toEqual({ status: "saved" })
    expect(history.historyState.undoLabel).toBe("Reload app.par")
  })

  it("leave a file with unsaved changes alone unless forced", () => {
    const history = add(open(), "about")
    expect(reloadFile(history, "app.par", fromDisk)).toBeUndefined()
    const forced = taken(reloadFile(history, "app.par", fromDisk, true))
    expect(ids(forced)).toEqual(["home", "pricing"])
    expect(forced.saveState).toEqual({ status: "saved" })
  })

  it("take the main file's modes as the project's, apart from its documents", () => {
    const history = taken(reloadFile(open(), "app.par", { ...fromDisk, modes: custom }))
    expect(history.current.modes).toEqual(custom)
    expect(history.current.documents.get("app.par")!.modes).toBeUndefined()
    expect(unsavedPaths(history)).toEqual([])
  })
})

describe("saving", () => {
  it("says which files a step changed, to save them automatically", () => {
    const history = add(open(), "about")
    const step = recordChange(history, "Edit --primary", {
      ...history.current,
      tokens: withTokenEdits(history.current.tokens, [primary("red")])
    })
    expect(step?.writes).toEqual(["src/index.css"])
    expect(undoChange(history)?.writes).toEqual(["app.par"])
  })

  it("takes what was written as what the file holds", () => {
    const history = add(open(), "about")
    const { history: saved, write } = save(history, "app.par")
    expect(write).toMatchObject({ kind: "document", path: "app.par" })
    expect(saved.saveState).toEqual({ status: "saved" })
    expect(unsavedPaths(saved)).toEqual([])
  })

  it("writes the modes into the main file when they aren't the defaults", () => {
    const opened = open()
    const history = taken(recordChange(opened, "Edit modes", { ...opened.current, modes: custom }))
    const write = fileWrite(history, "app.par")
    expect(write?.kind === "document" && write.content?.modes).toEqual(custom)
    expect(unsavedPaths(save(history, "app.par").history)).toEqual([])
  })

  it("says when a write fails, keeps the file unsaved, and clears it once one succeeds", () => {
    const history = add(open(), "about")
    const failed = save(history, "app.par", "The disk is full").history
    expect(failed.saveState).toEqual({ status: "failed", error: "The disk is full" })
    expect(saveFailure(failed)).toBe("The disk is full")
    expect(unsavedPaths(failed)).toEqual(["app.par"])

    const saved = save(startSave(failed), "app.par").history
    expect(saved.saveState).toEqual({ status: "saved" })
    expect(saveFailure(saved)).toBeUndefined()
  })

  it("is saved again once Save starts after undoing a failed write back to what the file holds", () => {
    const failed = save(add(open(), "about"), "app.par", "The disk is full").history
    const undone = taken(undoChange(failed))
    expect(unsavedPaths(undone)).toEqual([])
    expect(undone.saveState).toEqual({ status: "failed", error: "The disk is full" })

    const started = startSave(undone)
    expect(started.saveState).toEqual({ status: "saved" })
    expect(saveFailure(started)).toBeUndefined()
  })

  it("clears a failed write once a later write of that file succeeds", () => {
    const failed = save(add(open(), "about"), "app.par", "The disk is full").history
    const saved = save(add(failed, "pricing"), "app.par").history
    expect(saved.saveState).toEqual({ status: "saved" })
  })

  it("is saving while any write is unfinished", () => {
    const history = add(open(), "about")
    const write = fileWrite(history, "app.par")!
    const twice = writeStarted(writeStarted(history))
    const once = writeSucceeded(twice, write)
    expect(once.saveState).toEqual({ status: "saving" })
    expect(writeSucceeded(once, write).saveState).toEqual({ status: "saved" })
  })

  it("keeps the same save state object while it says the same", () => {
    const history = add(open(), "about")
    const changed = add(history, "pricing")
    expect(changed.saveState).toBe(history.saveState)
  })

  it("takes a file written while it changed again as holding what was written", () => {
    const history = add(open(), "about")
    const write = fileWrite(history, "app.par")!
    const later = add(writeStarted(history), "pricing")
    const saved = writeSucceeded(later, write)
    expect(unsavedPaths(saved)).toEqual(["app.par"])
    expect(saved.saveState).toEqual({ status: "unsaved" })
  })
})

describe("token values", () => {
  it("are undone with the designs an agent's call changed in the same step", () => {
    const history = open()
    const call = [{ path: "app.par", id: "pricing", base: null, after: design("pricing") }]
    const { snapshot } = mergeAgentChanges(history.current, call, undefined, [primary("red")])
    let after = taken(recordChange(history, "Build pricing", snapshot))
    expect(after.current.tokens.get("primary default")?.value).toBe("red")
    after = taken(undoChange(after))
    expect(after.current.tokens.size).toBe(0)
    expect(ids(after)).toEqual(["home"])
    expect(after.historyState.canUndo).toBe(false)
  })

  it("undo an agent's merged call back to just before it, keeping the person's edits from during the call", () => {
    // The person renames Home while the call, which read the tab before that, adds Pricing.
    const edited = rename(open(), "Start")
    const call = [{ path: "app.par", id: "pricing", base: null, after: design("pricing") }]
    const merged = mergeAgentChanges(edited.current, call)
    expect(merged.conflicts).toEqual([])
    let after = taken(recordChange(edited, "Build pricing", merged.snapshot))
    expect(names(after)).toEqual(["Start", "pricing"])
    after = taken(undoChange(after))
    expect(names(after)).toEqual(["Start"])
    expect(after.historyState.undoLabel).toBe("Rename to Start")
  })

  it("undo the modes an agent's call set with its designs", () => {
    const history = open()
    const call = [{ path: "app.par", id: "pricing", base: null, after: design("pricing") }]
    const { snapshot } = mergeAgentChanges(history.current, call, { base: defaultModeSettings, after: custom })
    let after = taken(recordChange(history, "Build pricing", snapshot))
    expect(after.current.modes).toBe(custom)
    after = taken(undoChange(after))
    expect(after.current.modes).toBe(defaultModeSettings)
    expect(ids(after)).toEqual(["home"])
    expect(after.historyState.canUndo).toBe(false)
  })

  it("write what differs from what the stylesheet was last given", () => {
    const history = tokens(open(), [primary("red"), { name: "radius", theme: "default", value: "1rem" }])
    expect(fileWrite(history, "src/index.css")).toMatchObject({
      kind: "tokens",
      changes: [
        { name: "primary", theme: "default", value: "red" },
        { name: "radius", theme: "default", value: "1rem" }
      ]
    })
    expect(unsavedPaths(save(history, "src/index.css").history)).toEqual([])
  })

  it("write the stylesheet's value back when an edit is undone after a save", () => {
    const saved = save(tokens(open(), [primary("red")]), "src/index.css").history
    const undone = taken(undoChange(saved))
    expect(unsavedPaths(undone)).toEqual(["src/index.css"])
    expect(fileWrite(undone, "src/index.css")).toMatchObject({
      changes: [{ name: "primary", theme: "default", value: "oklch(0.205 0 0)" }]
    })
  })

  it("name the token and the stylesheet when a write fails, and stay unsaved until one succeeds", () => {
    const history = tokens(open(), [primary("red")])
    const failed = save(history, "src/index.css", "EPERM: operation not permitted, open 'src/index.css'").history
    expect(saveFailure(failed)).toBe(
      "Couldn't write --primary to src/index.css: EPERM: operation not permitted, open 'src/index.css'"
    )
    expect(failed.tokenFailure).toEqual({
      error: "EPERM: operation not permitted, open 'src/index.css'",
      tokens: [{ name: "primary", theme: "default", value: "red" }]
    })
    expect(unsavedPaths(failed)).toEqual(["src/index.css"])

    const saved = save(startSave(failed), "src/index.css").history
    expect(saved.tokenFailure).toBeUndefined()
    expect(saved.saveState).toEqual({ status: "saved" })
  })

  it("say how many failed to write when there are several", () => {
    const history = tokens(open(), [primary("red"), { name: "radius", theme: "default", value: "1rem" }], "Edit 2")
    const failed = save(history, "src/index.css", "src/index.css changed since this was made").history
    expect(saveFailure(failed)).toBe(
      "Couldn't write 2 token values to src/index.css: src/index.css changed since this was made"
    )
    expect(failed.tokenFailure?.tokens.map((change) => change.name)).toEqual(["primary", "radius"])
  })

  it("forget a failed write once undone back to what the stylesheet holds", () => {
    const failed = save(tokens(open(), [primary("red")]), "src/index.css", "EPERM").history
    const undone = taken(undoChange(failed))
    expect(undone.tokenFailure).toBeUndefined()
    expect(saveFailure(undone)).toBeUndefined()
    expect(undone.saveState).toEqual({ status: "saved" })
  })
})

describe("the merged project file", () => {
  it("holds every file's designs and notes, and the modes when they aren't the defaults", () => {
    let history = openDesigns(
      [
        { path: "app.par", document: { version: 3, containers: [design("home")] } },
        {
          path: "more.par",
          document: {
            version: 3,
            containers: [design("about")],
            notes: [{ id: "n", text: "Hi", position: { x: 0, y: 0 } }]
          }
        }
      ],
      defaultModeSettings,
      "app.par"
    )
    expect(mergedDocument(history)).toEqual({
      version: 3,
      containers: [design("home"), design("about")],
      notes: [{ id: "n", text: "Hi", position: { x: 0, y: 0 } }]
    })
    history = taken(recordChange(history, "Edit modes", { ...history.current, modes: custom }))
    expect(mergedDocument(history).modes).toEqual(custom)
  })
})
