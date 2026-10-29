import { type CanvasDocument, type ContainerSpec, defaultModeSettings } from "@parity/core"
import { afterEach, describe, expect, it, vi } from "vitest"
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

function setup({ autosave = false, failing = false } = {}) {
  const writes: { path: string; document: CanvasDocument }[] = []
  let fail = failing
  const store = new DesignStore(
    [{ path: "app.par", document: { version: 3, containers: [design("home")] } }],
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
  return { store, writes, recover: () => (fail = false) }
}

afterEach(() => {
  vi.useRealTimers()
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
