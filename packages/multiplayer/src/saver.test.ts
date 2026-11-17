import {
  type CanvasDocument,
  type ContainerSpec,
  defaultModeSettings,
  emptyDocument,
  type ModeSettings
} from "@parity-app/core"
import { restoreLabel, type TokenEdit, type TokenWrite } from "@parity-app/editor"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { changeTokens, restoreCopy, setModes, updateContainer } from "./callers.ts"
import { createProjectDoc } from "./project-doc.ts"
import { createProjectSaver, type SavedBaseline } from "./saver.ts"
import { plainProvider } from "./testing/plain-provider.ts"
import type { BackendChange, DocBackend, DocOp } from "./types.ts"

const home: ContainerSpec = {
  id: "home",
  name: "Home",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", children: [] }
}

const primary = (value: string): TokenEdit => ({ name: "primary", theme: "default", value, original: "black" })

const smallModes: ModeSettings = {
  ...defaultModeSettings,
  modes: [...defaultModeSettings.modes, { id: "small", name: "Small", values: { viewport: "mobile" } }]
}

/** A backend that also takes in changes made by another copy in a live room, as a provider that syncs does. */
function inRoom(backend: DocBackend) {
  const listeners = new Set<(change: BackendChange) => void>()

  return {
    backend: {
      ...backend,
      subscribe: (listener: (change: BackendChange) => void) => {
        listeners.add(listener)

        return () => listeners.delete(listener)
      }
    },
    others: (ops: DocOp[]) => {
      const change = backend.apply(ops, "remote")

      for (const listener of listeners) {
        listener(change)
      }
    }
  }
}

const starting = (): { path: string; document: CanvasDocument }[] => [
  { path: "app.par", document: { ...emptyDocument(), containers: [home] } },
  { path: "more.par", document: emptyDocument() }
]

function setup({
  autosave = true,
  writesFiles,
  saved
}: { autosave?: boolean; writesFiles?: boolean; saved?: SavedBaseline } = {}) {
  const room = inRoom(plainProvider.open({ files: starting(), main: "app.par", modes: defaultModeSettings }))
  const doc = createProjectDoc(room.backend, { undoLimit: 200, main: "app.par" })

  const writes: { path: string; document: CanvasDocument; fromOthers: number }[] = []
  const deletes: string[] = []
  let held: (() => void) | undefined
  const tokenWrites: TokenWrite[][] = []
  let failing: string | undefined
  let stylesheetFailing: string | undefined

  const saver = createProjectSaver(
    doc,
    {
      saveDocument: async (path, document, { fromOthers }) => {
        if (failing) {
          throw new Error(failing)
        }

        if (held) {
          await new Promise<void>((resolve) => (held = resolve))
        }

        writes.push({ path, document, fromOthers })
      },
      deleteDocument: async (path) => {
        deletes.push(path)
      },
      autosave: () => autosave
    },
    { writesFiles, saved }
  )

  saver.writeTokensWith({
    path: "src/index.css",
    write: async (changes) => {
      if (stylesheetFailing) {
        throw new Error(stylesheetFailing)
      }

      tokenWrites.push(changes)
    }
  })

  return {
    doc,
    saver,
    others: room.others,
    writes,
    deletes,
    tokenWrites,
    hold: () => (held = () => undefined),
    release: () => {
      const resolve = held
      held = undefined
      resolve?.()
    },
    fail: (reason: string | undefined) => (failing = reason),
    failStylesheet: (reason: string | undefined) => (stylesheetFailing = reason)
  }
}

const rename = (doc: Parameters<typeof updateContainer>[0], name: string) =>
  updateContainer(doc, "app.par#home", "Rename", (design) => ({ ...design, name }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const renamedBy = (name: string): DocOp[] => [{ op: "setDesign", design: "app.par#home", path: ["name"], value: name }]

describe("ProjectSaver in a live room", () => {
  it("writes another copy's change a moment after it, counting it in the write", async () => {
    const { saver, others, writes } = setup()
    others(renamedBy("Theirs"))
    others(renamedBy("Theirs again"))

    expect(saver.unsaved()).toEqual(["app.par"])
    await vi.advanceTimersByTimeAsync(300)

    expect(writes).toEqual([expect.objectContaining({ path: "app.par", fromOthers: 2 })])
    expect(writes[0]?.document.containers[0]?.name).toBe("Theirs again")
    expect(saver.state()).toEqual({ status: "saved" })
  })

  it("writes another copy's token values to the stylesheet", async () => {
    const { saver, others, tokenWrites } = setup()
    others([{ op: "setTokens", tokens: new Map([["primary default", primary("red")]]) }])
    await vi.advanceTimersByTimeAsync(300)

    expect(tokenWrites).toEqual([[{ name: "primary", theme: "default", value: "red" }]])
    expect(saver.hasUnsaved()).toBe(false)
  })

  it("writes nothing in a copy that doesn't write files, and has nothing of its own to save", async () => {
    const { doc, saver, others, writes, tokenWrites } = setup({ writesFiles: false })
    rename(doc, "Mine")
    others(renamedBy("Theirs"))
    changeTokens(doc, "Change primary", [primary("red")])
    await vi.advanceTimersByTimeAsync(300)
    await saver.flush()

    expect(saver.writesFiles()).toBe(false)
    expect(writes).toEqual([])
    expect(tokenWrites).toEqual([])
    expect(saver.unsaved()).toEqual([])
    expect(saver.state()).toEqual({ status: "saved" })
  })

  it("writes every file that differs from what its files held when it takes over, and the stylesheet", async () => {
    const { saver, others, writes, tokenWrites } = setup({
      writesFiles: false,
      saved: {
        files: new Map(starting().map(({ path, document }) => [path, document])),
        modes: defaultModeSettings,
        tokens: new Map()
      }
    })

    others(renamedBy("Theirs"))
    others([{ op: "setTokens", tokens: new Map([["primary default", primary("red")]]) }])

    await expect(saver.setWritesFiles(true)).resolves.toEqual({ filesWritten: 1, stylesheetWritten: true })
    expect(writes).toEqual([expect.objectContaining({ path: "app.par", fromOthers: 1 })])
    expect(tokenWrites).toHaveLength(1)
    expect(saver.state()).toEqual({ status: "saved" })

    others(renamedBy("Later"))
    await vi.advanceTimersByTimeAsync(300)
    expect(writes.at(-1)?.document.containers[0]?.name).toBe("Later")
  })

  it("writes what a copy that opened on another's document holds, though the document opened with it", async () => {
    const opened = { files: new Map([["app.par", emptyDocument()]]), modes: defaultModeSettings, tokens: new Map() }
    const { saver, writes } = setup({ writesFiles: false, saved: opened })

    await saver.setWritesFiles(true)
    expect(writes.map((write) => write.path).toSorted()).toEqual(["app.par", "more.par"])
  })

  it("lets go after the write in flight, and writes nothing after", async () => {
    const { doc, saver, writes, hold, release } = setup()
    hold()
    rename(doc, "Mine")
    await vi.advanceTimersByTimeAsync(300)

    const letting = saver.setWritesFiles(false)
    rename(doc, "Mine again")
    release()
    await letting
    await vi.advanceTimersByTimeAsync(300)

    expect(writes.map((write) => write.document.containers[0]?.name)).toEqual(["Mine"])
    expect(saver.writesFiles()).toBe(false)
  })
})

describe("ProjectSaver", () => {
  it("writes a changed file a moment after the change, and is saved again once it's written", async () => {
    const { doc, saver, writes } = setup()
    rename(doc, "Start")

    expect(saver.state()).toEqual({ status: "unsaved" })
    expect(saver.unsaved()).toEqual(["app.par"])

    await vi.advanceTimersByTimeAsync(299)
    expect(writes).toEqual([])

    await vi.advanceTimersByTimeAsync(1)
    expect(writes.map((write) => write.path)).toEqual(["app.par"])
    expect(saver.state()).toEqual({ status: "saved" })
    expect(saver.saved("app.par")).toBe(doc.file("app.par"))
  })

  it("deletes a file taken out of the project, and is saved only once it's gone", async () => {
    const { doc, saver, deletes } = setup({ autosave: false })
    doc.transact("Remove", [{ op: "removeFile", file: "more.par" }], { origin: "edit" })

    expect(saver.unsaved()).toEqual(["more.par"])

    await saver.flush()
    expect(deletes).toEqual(["more.par"])
    expect(saver.hasUnsaved()).toBe(false)
  })

  it("writes a path again after the write in flight, so the newest content lands last", async () => {
    const { doc, saver, writes, hold, release } = setup({ autosave: false })
    rename(doc, "First")
    hold()
    const first = saver.flush()

    rename(doc, "Second")
    const second = saver.flush()
    release()
    await Promise.all([first, second])

    expect(writes.map((write) => write.document.containers?.[0]?.name)).toEqual(["First", "Second"])
    expect(saver.hasUnsaved()).toBe(false)
  })

  it("waits for Save with autosave off", async () => {
    const { doc, saver, writes } = setup({ autosave: false })
    rename(doc, "Start")
    await vi.advanceTimersByTimeAsync(1000)
    expect(writes).toEqual([])

    await saver.flush()
    expect(writes.map((write) => write.path)).toEqual(["app.par"])
    expect(saver.hasUnsaved()).toBe(false)
  })

  it("says why a write failed, keeps the file unsaved, and recovers when the next succeeds", async () => {
    const { doc, saver, fail } = setup({ autosave: false })
    rename(doc, "Start")
    fail("The disk is full")

    await expect(saver.flush()).rejects.toThrow("The disk is full")
    expect(saver.state()).toEqual({ status: "failed", error: "The disk is full" })
    expect(saver.unsaved()).toEqual(["app.par"])

    fail(undefined)
    await saver.flush()
    expect(saver.state()).toEqual({ status: "saved" })
  })

  it("writes token values to the stylesheet, and names them when it fails", async () => {
    const { doc, saver, tokenWrites, failStylesheet } = setup({ autosave: false })
    changeTokens(doc, "Change primary", [primary("red")])
    expect(saver.unsaved()).toEqual(["src/index.css"])

    failStylesheet("Read only")
    await expect(saver.flush()).rejects.toThrow("Couldn't write --primary to src/index.css: Read only")
    expect(saver.tokenFailure()).toMatchObject({ error: "Read only" })

    failStylesheet(undefined)
    await saver.flush()
    expect(tokenWrites).toEqual([[{ name: "primary", theme: "default", value: "red" }]])
    expect(saver.tokenFailure()).toBeUndefined()
  })

  it("takes a file reloaded from disk as saved, cancelling a save that waited", async () => {
    const { doc, saver, writes } = setup()
    rename(doc, "Start")
    doc.replaceFile("app.par", { ...emptyDocument(), containers: [{ ...home, name: "From disk" }] })

    expect(saver.unsaved()).toEqual([])
    await vi.advanceTimersByTimeAsync(1000)
    expect(writes).toEqual([])
  })

  it("takes a change back to what the file holds as saved", () => {
    const { doc, saver } = setup({ autosave: false })
    rename(doc, "Start")
    rename(doc, "Home")

    expect(saver.unsaved()).toEqual([])
  })

  it("writes the modes into the main file when they aren't the defaults", async () => {
    const { doc, saver, writes } = setup({ autosave: false })
    setModes(doc, smallModes)
    expect(saver.unsaved()).toEqual(["app.par"])

    await saver.flush()
    expect(writes[0]?.document.modes).toEqual(smallModes)
    expect(saver.savedModes()).toEqual(smallModes)
  })

  it("keeps a recovery copy of what's unsaved, and nothing once it's saved", async () => {
    const { doc, saver } = setup({ autosave: false })
    rename(doc, "Start")
    changeTokens(doc, "Change primary", [primary("red")])
    setModes(doc, smallModes)

    expect(saver.recoveryCopy(5)).toEqual({
      version: 1,
      keptAt: 5,
      documents: [{ path: "app.par", document: doc.file("app.par") }],
      modes: smallModes,
      tokens: [primary("red")]
    })

    await saver.flush()
    expect(saver.recoveryCopy()).toBeUndefined()
  })

  it("tells its listeners when the save state changes", async () => {
    const { doc, saver } = setup()
    const states: string[] = []
    saver.subscribe(() => states.push(saver.state().status))
    rename(doc, "Start")
    await vi.advanceTimersByTimeAsync(300)

    expect(states).toContain("unsaved")
    expect(states).toContain("saving")
    expect(states.at(-1)).toBe("saved")
  })

  it("restores a recovery copy over a file changed since, as one undoable step that leaves it unsaved", () => {
    const { doc, saver } = setup({ autosave: false })
    rename(doc, "Home page")
    const copy = saver.recoveryCopy(1)!
    const fresh = setup({ autosave: false })
    rename(fresh.doc, "Changed by an agent")
    fresh.doc.replaceFile("app.par", fresh.doc.file("app.par")!)

    restoreCopy(fresh.doc, structuredClone(copy))

    expect(fresh.doc.design("app.par#home")?.name).toBe("Home page")
    expect(fresh.doc.history().undo[0]).toBe(restoreLabel)
    expect(fresh.saver.unsaved()).toEqual(["app.par"])
  })

  it("restores token values with what the stylesheet holds, and files the copy made or deleted", () => {
    const { doc, saver } = setup({ autosave: false })
    changeTokens(doc, "Change primary", [primary("red")])
    const copy = { ...saver.recoveryCopy(1)!, documents: [{ path: "more.par", document: null }] }
    const fresh = setup({ autosave: false })

    restoreCopy(fresh.doc, copy)

    expect(fresh.doc.tokens().get("primary default")).toEqual(primary("red"))
    expect([...fresh.doc.files().keys()]).toEqual(["app.par"])
    fresh.doc.undo()
    expect(fresh.saver.unsaved()).toEqual([])
  })
})
