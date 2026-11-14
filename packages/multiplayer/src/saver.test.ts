import {
  type CanvasDocument,
  type ContainerSpec,
  defaultModeSettings,
  emptyDocument,
  type ModeSettings
} from "@parity-app/core"
import type { TokenEdit, TokenWrite } from "@parity-app/editor"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { changeTokens, setModes, updateContainer } from "./callers.ts"
import { createProjectDoc } from "./project-doc.ts"
import { createProjectSaver } from "./saver.ts"
import { plainProvider } from "./testing/plain-provider.ts"

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

function setup({ autosave = true } = {}) {
  const doc = createProjectDoc(
    plainProvider.open({
      files: [
        { path: "app.par", document: { ...emptyDocument(), containers: [home] } },
        { path: "more.par", document: emptyDocument() }
      ],
      main: "app.par",
      modes: defaultModeSettings
    }),
    { undoLimit: 200, main: "app.par" }
  )

  const writes: { path: string; document: CanvasDocument }[] = []
  const tokenWrites: TokenWrite[][] = []
  let failing: string | undefined
  let stylesheetFailing: string | undefined

  const saver = createProjectSaver(doc, {
    saveDocument: async (path, document) => {
      if (failing) {
        throw new Error(failing)
      }

      writes.push({ path, document })
    },
    autosave: () => autosave
  })

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
    writes,
    tokenWrites,
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
})
