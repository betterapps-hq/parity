import { type CanvasDocument, type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import { historyLimit, type TokenChange, type TokenEdit } from "@parity-app/editor"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { DesignStore } from "./design-store.ts"

function design(id: string): ContainerSpec {
  return {
    id,
    name: id,
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] },
    states: [{ id: "default", name: "Default" }]
  }
}

function setup({ autosave = false, failing = false, home = design("home") } = {}) {
  const writes: { path: string; document: CanvasDocument }[] = []
  const tokenWrites: TokenChange[][] = []
  let fail = failing
  let stylesheetFailure: string | undefined
  const store = new DesignStore(
    [{ path: "app.par", document: { version: 3, containers: [home] } }],
    defaultModeSettings,
    "app.par",
    {
      saveDocument: async (path, document) => {
        if (fail) throw new Error("The disk is full")
        writes.push({ path, document })
      },
      autosave: () => autosave
    }
  )
  store.writeTokensWith({
    path: "src/index.css",
    write: async (changes) => {
      if (stylesheetFailure) throw new Error(stylesheetFailure)
      tokenWrites.push(changes)
    }
  })
  return {
    store,
    writes,
    tokenWrites,
    recover: () => {
      fail = false
      stylesheetFailure = undefined
    },
    failStylesheet: (reason: string) => (stylesheetFailure = reason)
  }
}

/** A token edit as the token store makes it, with the value the stylesheet had when the project opened. */
const primary = (value: string): TokenEdit => ({
  name: "primary",
  theme: "default",
  value,
  original: "oklch(0.205 0 0)"
})

afterEach(() => {
  vi.useRealTimers()
})

describe("library designs", () => {
  it("reach the designs that place them, and are never written to the project's files", async () => {
    const row = { ...design("nova/settings-row"), kind: "component" as const }
    const home = {
      ...design("home"),
      root: { type: "instance" as const, id: "row", design: "nova/settings-row" }
    }
    const writes: string[][] = []
    const persistence = {
      saveDocument: async (_path: string, document: CanvasDocument) =>
        void writes.push(document.containers.map((container) => container.id)),
      autosave: () => false
    }
    const store = new DesignStore(
      [{ path: "app.par", document: { version: 3, containers: [home] } }],
      defaultModeSettings,
      "app.par",
      persistence,
      [row]
    )
    expect(store.getComponentLibrary().get("nova/settings-row")).toBe(row)
    expect([...store.getLibrary("app.par#home").keys()]).toEqual(["nova/settings-row"])
    expect(store.getEntries().map((entry) => entry.container.id)).toEqual(["home"])
    store.updateContainer("app.par#home", "Rename", (container) => ({ ...container, name: "Home" }))
    await store.flush()
    expect(writes).toEqual([["home"]])
  })
})

describe("saving", () => {
  it("keeps changes unsaved until Save writes them", async () => {
    const { store, writes } = setup()
    store.addContainer("app.par", design("about"))
    expect(store.getSaveState()).toEqual({ status: "unsaved" })
    expect(store.unsavedPaths()).toEqual(["app.par"])
    expect(writes).toEqual([])

    await store.flush()
    expect(writes.map((write) => write.document.containers.map((container) => container.id))).toEqual([
      ["home", "about"]
    ])
    expect(store.getSaveState()).toEqual({ status: "saved" })
  })

  it("takes changes from the files, and won't overwrite unsaved work with them unless forced", () => {
    const { store } = setup()
    const fromDisk: CanvasDocument = { version: 3, containers: [design("home"), design("pricing")] }
    expect(store.reloadDocument("app.par", fromDisk)).toBe(true)
    expect(store.getEntries().map((entry) => entry.container.id)).toEqual(["home", "pricing"])

    store.addContainer("app.par", design("about"))
    expect(store.reloadDocument("app.par", fromDisk)).toBe(false)
    expect(store.getEntries().map((entry) => entry.container.id)).toEqual(["home", "pricing", "about"])
    expect(store.reloadDocument("app.par", fromDisk, true)).toBe(true)
    expect(store.getEntries().map((entry) => entry.container.id)).toEqual(["home", "pricing"])
    expect(store.getSaveState()).toEqual({ status: "saved" })
  })

  it("doesn't save a change automatically once the file it was in is taken from disk", async () => {
    vi.useFakeTimers()
    const { store, writes } = setup({ autosave: true })
    store.addContainer("app.par", design("about"))
    store.reloadDocument("app.par", { version: 3, containers: [design("home")] }, true)
    await vi.runAllTimersAsync()
    expect(writes).toEqual([])
    expect(store.getSaveState()).toEqual({ status: "saved" })
  })

  it("saves each change a moment later when saving automatically", async () => {
    vi.useFakeTimers()
    const { store, writes } = setup({ autosave: true })
    store.addContainer("app.par", design("about"))
    expect(writes).toEqual([])
    await vi.runAllTimersAsync()
    expect(writes).toHaveLength(1)
    expect(store.getSaveState()).toEqual({ status: "saved" })
  })

  it("says when a save fails, and clears it once one succeeds", async () => {
    const { store, recover } = setup({ failing: true })
    store.addContainer("app.par", design("about"))
    await expect(store.flush()).rejects.toThrow("The disk is full")
    expect(store.getSaveState()).toEqual({ status: "failed", error: "The disk is full" })

    recover()
    await store.flush()
    expect(store.getSaveState()).toEqual({ status: "saved" })
  })

  it("clears a failed save once a later automatic save of that file succeeds", async () => {
    vi.useFakeTimers()
    const { store, recover } = setup({ autosave: true, failing: true })
    store.addContainer("app.par", design("about"))
    await vi.runAllTimersAsync()
    expect(store.getSaveState()).toEqual({ status: "failed", error: "The disk is full" })

    recover()
    store.addContainer("app.par", design("pricing"))
    await vi.runAllTimersAsync()
    expect(store.getSaveState()).toEqual({ status: "saved" })
  })
})

describe("reverting to a checkpoint", () => {
  const rename = (store: DesignStore, name: string, group?: string) =>
    store.updateContainer("app.par#home", "Rename", (container) => ({ ...container, name }), { group })
  const name = (store: DesignStore) => store.getEntry("app.par#home")?.container.name
  /** A checkpoint for a gesture renaming home in the "resize" group. */
  const start = (store: DesignStore) => {
    const checkpoint = store.checkpoint("app.par#home", "resize")
    if (!checkpoint) throw new Error("No design home")
    return checkpoint
  }

  it("keeps every step before the gesture when its first change pushed the oldest out at the undo limit", () => {
    const { store } = setup()
    for (let step = 1; step <= historyLimit; step++) rename(store, String(step))
    const checkpoint = start(store)
    rename(store, "During", "resize")
    store.revert(checkpoint)
    expect(name(store)).toBe(String(historyLimit))
    for (let step = 0; step < historyLimit; step++) store.undo()
    expect(name(store)).toBe("home")
    expect(store.getHistory().canUndo).toBe(false)
  })

  it("takes back a cancelled gesture's changes, leaving no step to undo for them", () => {
    vi.useFakeTimers()
    const { store } = setup()
    rename(store, "Before")
    const checkpoint = start(store)
    // Written as a pointer moves, some more than a second apart, so they'd be several undo steps.
    for (const step of ["One", "Two", "Three"]) {
      rename(store, step, "resize")
      vi.advanceTimersByTime(1500)
    }
    store.revert(checkpoint)
    expect(name(store)).toBe("Before")
    expect(store.getHistory()).toMatchObject({ canUndo: true, undoLabel: "Rename", canRedo: false })
    store.undo()
    expect(name(store)).toBe("home")
    expect(store.getSaveState()).toEqual({ status: "saved" })
  })

  it("keeps what could be redone before the gesture", () => {
    const { store } = setup()
    rename(store, "Before")
    store.undo()
    const checkpoint = start(store)
    rename(store, "During", "resize")
    expect(store.getHistory().canRedo).toBe(false)
    store.revert(checkpoint)
    expect(store.getHistory()).toMatchObject({ canUndo: false, canRedo: true, redoLabel: "Rename" })
    store.redo()
    expect(name(store)).toBe("Before")
  })

  it("leaves the step before the gesture as it was, though the gesture's first change merged into it", () => {
    vi.useFakeTimers()
    const { store } = setup()
    rename(store, "First drag", "resize")
    const checkpoint = start(store)
    // Within a second of the step before, in the same group: it merges into that step rather than making its own.
    vi.advanceTimersByTime(500)
    rename(store, "Second drag", "resize")
    store.revert(checkpoint)
    expect(name(store)).toBe("First drag")
    store.undo()
    expect(name(store)).toBe("home")
    expect(store.getHistory().canUndo).toBe(false)
  })

  it("keeps another file changed meanwhile, with its undo step, which undoes to the design as it was", () => {
    const { store } = setup()
    const checkpoint = start(store)
    rename(store, "During", "resize")
    // An agent changes another file mid-gesture.
    store.reloadDocument("other.par", { version: 3, containers: [design("pricing")] })
    rename(store, "Still during", "resize")
    store.revert(checkpoint)
    expect(name(store)).toBe("home")
    expect(store.getEntry("other.par#pricing")).toBeDefined()
    expect(store.getHistory()).toMatchObject({ canUndo: true, undoLabel: "Reload other.par" })
    store.undo()
    expect(store.getEntry("other.par#pricing")).toBeUndefined()
    expect(name(store)).toBe("home")
    expect(store.getHistory().canUndo).toBe(false)
  })

  it("keeps another design in the same file changed meanwhile, with its undo step", () => {
    const { store } = setup()
    const checkpoint = start(store)
    rename(store, "During", "resize")
    // An agent adds a design to the same file mid-gesture.
    store.addContainer("app.par", design("about"))
    rename(store, "Still during", "resize")
    store.revert(checkpoint)
    expect(name(store)).toBe("home")
    expect(store.getEntry("app.par#about")).toBeDefined()
    expect(store.getHistory()).toMatchObject({ canUndo: true, undoLabel: "Add design" })
    store.undo()
    expect(store.getEntry("app.par#about")).toBeUndefined()
    expect(name(store)).toBe("home")
    expect(store.getHistory().canUndo).toBe(false)
  })

  it("changes nothing when nothing changed since it", () => {
    const { store } = setup()
    rename(store, "Before")
    const checkpoint = start(store)
    store.revert(checkpoint)
    expect(name(store)).toBe("Before")
    expect(store.getHistory()).toMatchObject({ canUndo: true, undoLabel: "Rename" })
  })
})

describe("token edits", () => {
  it("are saved with the project's other changes", async () => {
    const { store, writes, tokenWrites } = setup()
    store.changeTokens("Edit --primary", [primary("oklch(0.55 0.2 260)")])
    store.addContainer("app.par", design("about"))
    expect(store.unsavedPaths()).toEqual(["app.par", "src/index.css"])
    expect(tokenWrites).toEqual([])

    await store.flush()
    expect(writes).toHaveLength(1)
    expect(tokenWrites).toEqual([[{ name: "primary", theme: "default", value: "oklch(0.55 0.2 260)" }]])
    expect(store.getSaveState()).toEqual({ status: "saved" })
  })

  it("say a failed write names the stylesheet and the tokens, and clear once one succeeds", async () => {
    const { store, recover, failStylesheet } = setup()
    store.changeTokens("Edit --primary", [primary("red")])
    failStylesheet("EPERM: operation not permitted, open 'src/index.css'")
    await expect(store.flush()).rejects.toThrow("Couldn't write --primary to src/index.css: EPERM")
    expect(store.getSaveState()).toMatchObject({ status: "failed" })
    expect(store.getTokenFailure()).toEqual({
      error: "EPERM: operation not permitted, open 'src/index.css'",
      tokens: [{ name: "primary", theme: "default", value: "red" }]
    })
    expect(store.hasUnsaved()).toBe(true)

    recover()
    await store.flush()
    expect(store.getTokenFailure()).toBeUndefined()
    expect(store.getSaveState()).toEqual({ status: "saved" })
  })

  it("fail to save when nothing can write to the stylesheet", async () => {
    const store = new DesignStore([], defaultModeSettings, "app.par", {
      saveDocument: async () => undefined,
      autosave: () => false
    })
    store.changeTokens("Edit --primary", [primary("red")])
    await expect(store.flush()).rejects.toThrow(
      "Couldn't write --primary to the stylesheet: Nothing here can write to the stylesheet"
    )
  })

  it("save a moment later when saving automatically", async () => {
    vi.useFakeTimers()
    const { store, tokenWrites } = setup({ autosave: true })
    store.changeTokens("Edit --primary", [primary("red")])
    expect(tokenWrites).toEqual([])
    await vi.runAllTimersAsync()
    expect(tokenWrites).toHaveLength(1)
    expect(store.getSaveState()).toEqual({ status: "saved" })
  })
})
