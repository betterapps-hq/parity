import { type CanvasDocument, type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type { TokenChange } from "../shared/protocol.ts"
import { DesignStore } from "./design-store.ts"
import type { TokenEdit } from "./token-edits.ts"

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

  it("is clean again after undoing back to what was saved, without writing", () => {
    const { store, writes } = setup()
    store.addContainer("app.par", design("about"))
    store.undo()
    expect(store.getSaveState()).toEqual({ status: "saved" })
    store.redo()
    expect(store.getSaveState()).toEqual({ status: "unsaved" })
    expect(writes).toEqual([])
  })

  it("takes changes from the files as saved, and won't overwrite unsaved work with them unless forced", () => {
    const { store } = setup()
    const fromDisk: CanvasDocument = { version: 3, containers: [design("home"), design("pricing")] }
    expect(store.reloadDocument("app.par", fromDisk)).toBe(true)
    expect(store.getSaveState()).toEqual({ status: "saved" })

    store.addContainer("app.par", design("about"))
    expect(store.reloadDocument("app.par", fromDisk)).toBe(false)
    expect(store.getEntries().map((entry) => entry.container.id)).toEqual(["home", "pricing", "about"])
    expect(store.reloadDocument("app.par", fromDisk, true)).toBe(true)
    expect(store.getEntries().map((entry) => entry.container.id)).toEqual(["home", "pricing"])
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

describe("token edits", () => {
  it("are undoable, unsaved until Save, and saved with the project's other changes", async () => {
    const { store, writes, tokenWrites } = setup()
    store.changeTokens("Edit --primary", [primary("oklch(0.55 0.2 260)")])
    store.addContainer("app.par", design("about"))
    expect(store.getSaveState()).toEqual({ status: "unsaved" })
    expect(store.unsavedPaths()).toEqual(["app.par", "src/index.css"])
    expect(tokenWrites).toEqual([])

    store.undo()
    store.undo()
    expect(store.getTokenEdits().size).toBe(0)
    expect(store.getSaveState()).toEqual({ status: "saved" })
    store.redo()
    expect(store.getHistory().undoLabel).toBe("Edit --primary")
    store.redo()

    await store.flush()
    expect(writes).toHaveLength(1)
    expect(tokenWrites).toEqual([[{ name: "primary", theme: "default", value: "oklch(0.55 0.2 260)" }]])
    expect(store.getSaveState()).toEqual({ status: "saved" })
  })

  it("writes nothing when they're closed without saving, and nothing once undone back to the stylesheet", async () => {
    const { store, tokenWrites } = setup()
    store.changeTokens("Edit --primary", [primary("red")])
    store.changeTokens("Edit --primary", [primary("oklch(0.205 0 0)")])
    // Back at the stylesheet's own value, so Don't save, or Save, has nothing to write.
    expect(store.hasUnsaved()).toBe(false)
    await store.flush()
    expect(tokenWrites).toEqual([])
  })

  it("writes the stylesheet's value back when an edit is undone after a save", async () => {
    const { store, tokenWrites } = setup()
    store.changeTokens("Edit --primary", [primary("red")])
    await store.flush()
    store.undo()
    expect(store.unsavedPaths()).toEqual(["src/index.css"])
    await store.flush()
    expect(tokenWrites.at(-1)).toEqual([{ name: "primary", theme: "default", value: "oklch(0.205 0 0)" }])
    expect(store.hasUnsaved()).toBe(false)
  })

  it("says a failed write names the stylesheet and the tokens, keeps them unsaved, and clears once one succeeds", async () => {
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

  it("fails the save, writing nothing, when the stylesheet changed since its values were read", async () => {
    const { store, tokenWrites, failStylesheet } = setup()
    store.changeTokens("Edit 2 tokens", [primary("red"), { name: "radius", theme: "default", value: "1rem" }])
    failStylesheet("src/index.css changed since this was made, so nothing was written")
    await expect(store.flush()).rejects.toThrow(
      "Couldn't write 2 token values to src/index.css: src/index.css changed since this was made, so nothing was written"
    )
    expect(tokenWrites).toEqual([])
    expect(store.getTokenFailure()?.tokens.map((change) => change.name)).toEqual(["primary", "radius"])
    expect(store.unsavedPaths()).toEqual(["src/index.css"])
  })

  it("saves a moment later when saving automatically", async () => {
    vi.useFakeTimers()
    const { store, tokenWrites } = setup({ autosave: true })
    store.changeTokens("Edit --primary", [primary("red")])
    expect(tokenWrites).toEqual([])
    await vi.runAllTimersAsync()
    expect(tokenWrites).toHaveLength(1)
    expect(store.getSaveState()).toEqual({ status: "saved" })
  })

  it("comes from an agent's call in the same undo step as its designs", () => {
    const { store } = setup()
    const document: CanvasDocument = { version: 3, containers: [design("home"), design("pricing")] }
    store.applyDocuments("Build pricing", [{ path: "app.par", document }], undefined, [primary("red")])
    expect(store.getTokenEdits().get("primary default")?.value).toBe("red")
    store.undo()
    expect(store.getTokenEdits().size).toBe(0)
    expect(store.getEntries().map((entry) => entry.container.id)).toEqual(["home"])
    expect(store.getHistory().canUndo).toBe(false)
  })
})

describe("what a design shows", () => {
  it("leaves the file clean once Show every state is turned off again", () => {
    const { store } = setup()
    store.updateView("app.par#home", (view) => ({ ...view, allStates: true }))
    expect(store.hasUnsaved()).toBe(true)
    store.updateView("app.par#home", (view) => ({ ...view, allStates: false }))
    expect(store.hasUnsaved()).toBe(false)
    expect(store.getEntry("app.par#home")?.container.view).toBeUndefined()
  })

  it("is clean again after showing another state and going back, from a file that wrote its view out in full", () => {
    const home: ContainerSpec = {
      ...design("home"),
      states: [
        { id: "default", name: "Default" },
        { id: "loading", name: "Loading" }
      ],
      view: { state: "default", modes: [], allStates: false }
    }
    const { store } = setup({ home })
    store.updateView("app.par#home", (view) => ({ ...view, state: "loading", allStates: false }))
    expect(store.hasUnsaved()).toBe(true)
    store.updateView("app.par#home", (view) => ({ ...view, state: "default" }))
    expect(store.hasUnsaved()).toBe(false)
  })

  it("stays unsaved while a design shows something its file doesn't", () => {
    const { store } = setup()
    store.updateView("app.par#home", (view) => ({ ...view, allStates: true }))
    store.addContainer("app.par", design("about"))
    store.updateView("app.par#home", (view) => ({ ...view, allStates: false }))
    expect(store.unsavedPaths()).toEqual(["app.par"])
    store.undo()
    expect(store.hasUnsaved()).toBe(false)
  })
})
