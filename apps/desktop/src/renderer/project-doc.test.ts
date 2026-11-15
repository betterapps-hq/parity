import { type CanvasDocument, type ContainerSpec } from "@parity-app/core"
import { addContainer, applyOperations, changeTokens, containerEntries, updateContainer } from "@parity-app/multiplayer"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { openTestSession } from "./doc-fixtures.ts"
import {
  closeDocSession,
  editStatusOf,
  libraryOf,
  problemMessage,
  projectLibrary,
  redo,
  reloadFile,
  revisionOf,
  undo
} from "./project-doc.ts"
import { setWindowTelemetry } from "./report-error.ts"

function design(id: string): ContainerSpec {
  return {
    id,
    name: id,
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] }
  }
}

function setup({ autosave = false } = {}) {
  const writes: { path: string; document: CanvasDocument }[] = []

  const session = openTestSession([{ path: "app.par", document: { version: 4, containers: [design("home")] } }], {
    saveDocument: async (path, document) => void writes.push({ path, document }),
    autosave: () => autosave
  })

  return { session, writes }
}

const ids = (session: ReturnType<typeof setup>["session"]) =>
  containerEntries(session.doc).map((entry) => entry.container.id)

/** Records what the window sends while `run` runs. */
function recorded(run: () => void) {
  const sink = createTestSink()

  setWindowTelemetry(
    createTelemetry({
      events: registeredEvents,
      context: { process: "renderer", installId: "install", sessionId: "session" },
      sinks: [sink],
      check: true
    })
  )

  try {
    run()
  } finally {
    setWindowTelemetry(undefined)
  }

  return sink.events.map(({ name, attributes }) => ({ name, attributes }))
}

afterEach(() => {
  vi.useRealTimers()
})

describe("library designs", () => {
  it("reach the designs that place them, and are never written to the project's files", async () => {
    const row = { ...design("nova/settings-row"), kind: "component" as const }
    const home = { ...design("home"), root: { type: "instance" as const, id: "row", design: "nova/settings-row" } }
    const writes: string[][] = []

    const session = openTestSession([{ path: "app.par", document: { version: 4, containers: [home] } }], {
      libraryDesigns: [row],
      saveDocument: async (_path, document) => void writes.push(document.containers.map((container) => container.id))
    })

    expect(projectLibrary(session).get("nova/settings-row")).toBe(row)
    expect([...libraryOf(session, "app.par#home").keys()]).toEqual(["nova/settings-row"])
    expect(ids(session)).toEqual(["home"])
    updateContainer(session.doc, "app.par#home", "Rename", (container) => ({ ...container, name: "Home" }))
    await session.saver.flush()
    expect(writes).toEqual([["home"]])
  })
})

describe("files changed outside the canvas", () => {
  it("are taken in, and don't overwrite unsaved work unless forced", () => {
    const { session } = setup()
    const fromDisk: CanvasDocument = { version: 4, containers: [design("home"), design("pricing")] }
    expect(reloadFile(session, "app.par", fromDisk)).toBe(true)
    expect(ids(session)).toEqual(["home", "pricing"])

    addContainer(session.doc, "app.par", design("about"))
    expect(reloadFile(session, "app.par", fromDisk)).toBe(false)
    expect(ids(session)).toEqual(["home", "pricing", "about"])
    expect(reloadFile(session, "app.par", fromDisk, true)).toBe(true)
    expect(ids(session)).toEqual(["home", "pricing"])
    expect(session.saver.state()).toEqual({ status: "saved" })
  })

  it("stop a change waiting to be saved automatically from being written over them", async () => {
    vi.useFakeTimers()
    const { session, writes } = setup({ autosave: true })
    addContainer(session.doc, "app.par", design("about"))
    reloadFile(session, "app.par", { version: 4, containers: [design("home")] }, true)
    await vi.runAllTimersAsync()
    expect(writes).toEqual([])
    expect(session.saver.state()).toEqual({ status: "saved" })
  })
})

describe("the status agents read", () => {
  it("says what's unsaved and undoable, with a revision that changes with the designs", async () => {
    const { session } = setup()
    const opened = revisionOf(session)
    addContainer(session.doc, "app.par", design("about"))

    expect(editStatusOf(session, { summary: true })).toMatchObject({
      dirty: true,
      unsaved: [{ path: "app.par", kind: "document", designs: { added: ["about"], changed: [], removed: [] } }],
      save: { status: "unsaved" },
      undo: { count: 1, labels: ["Add screen"] },
      autosave: false
    })
    expect(revisionOf(session)).not.toBe(opened)

    const changed = revisionOf(session)
    await session.saver.flush()
    expect(editStatusOf(session)).toMatchObject({ dirty: false, unsaved: [], save: { status: "saved" } })
    expect(revisionOf(session)).toBe(changed)
  })

  it("gives a new revision for a change to token values alone, and for its undo", () => {
    const { session } = setup()
    const opened = revisionOf(session)
    changeTokens(session.doc, "Edit --primary", [{ name: "primary", theme: "default", value: "red", original: "blue" }])
    const edited = revisionOf(session)
    undo(session)

    expect(edited).not.toBe(opened)
    expect(revisionOf(session)).not.toBe(edited)
  })

  it("names token values waiting for the stylesheet", () => {
    const { session } = setup()
    session.saver.writeTokensWith({ path: "src/index.css", write: async () => undefined })
    changeTokens(session.doc, "Edit --primary", [{ name: "primary", theme: "default", value: "red", original: "blue" }])

    expect(editStatusOf(session, { summary: true }).unsaved).toEqual([
      { path: "src/index.css", kind: "stylesheet", tokens: ["primary default"] }
    ])
  })
})

describe("an extension's operations", () => {
  const titled = {
    ...design("home"),
    root: {
      type: "layout" as const,
      id: "root",
      children: [{ type: "text" as const, id: "title", name: "Title", text: "Welcome" }]
    }
  }

  const opened = () => openTestSession([{ path: "app.par", document: { version: 4, containers: [titled] } }])

  const layerName = (session: ReturnType<typeof opened>) => {
    const root = session.doc.design("app.par#home")?.root

    return root?.type === "layout" ? root.children[0]?.name : undefined
  }

  it("rename a layer as one undo step named after the extension, which Undo takes back", () => {
    const session = opened()

    applyOperations(session.doc, "Tidy: Rename layer", [
      { op: "set", design: "app.par#home", node: "title", path: ["name"], value: "Heading" }
    ])

    expect(layerName(session)).toBe("Heading")
    expect(session.doc.history()).toMatchObject({ canUndo: true, undo: ["Tidy: Rename layer"] })
    expect(session.saver.unsaved()).toEqual(["app.par"])

    undo(session)

    expect(layerName(session)).toBe("Title")
    expect(session.doc.history()).toMatchObject({ canUndo: false, redo: ["Tidy: Rename layer"] })
  })

  it("are refused whole, changing nothing, when one names a layer that's gone, saying which", () => {
    const session = opened()

    const result = applyOperations(session.doc, "Tidy: Rename layers", [
      { op: "set", design: "app.par#home", node: "title", path: ["name"], value: "Heading" },
      { op: "set", design: "app.par#home", node: "deleted", path: ["name"], value: "Lost" }
    ])

    expect(result.ok ? undefined : problemMessage(result.problem)).toBe(
      'Operation 2: No layer "deleted" in this design'
    )
    expect(layerName(session)).toBe("Title")
    expect(session.doc.history()).toMatchObject({ canUndo: false })
  })
})

describe("telemetry", () => {
  it("records each step undone and redone, with its label and what it changed", () => {
    const { session } = setup()

    const events = recorded(() => {
      updateContainer(session.doc, "app.par#home", "Rename screen", (container) => ({ ...container, name: "Start" }))
      undo(session)
      redo(session)
      // Nothing left to redo, so nothing is recorded.
      redo(session)
    })

    const step = { step: "Rename screen", designs: ["app.par#home"], files: ["app.par"], modes: false, tokens: false }
    expect(events).toEqual([
      { name: "edit.undone", attributes: step },
      { name: "edit.redone", attributes: step }
    ])
  })

  it("records opening and closing a document, with what it did", () => {
    const events = recorded(() => {
      const { session } = setup()
      updateContainer(session.doc, "app.par#home", "Rename", (container) => ({ ...container, name: "Start" }))
      undo(session)
      closeDocSession(session)
    })

    expect(events.map((event) => event.name)).toEqual(["projectDoc.opened", "edit.undone", "projectDoc.closed"])
    expect(events[0]?.attributes).toMatchObject({ provider: "local", files: ["app.par"], designs: 1, layers: 1 })
    expect(events[2]?.attributes).toMatchObject({
      provider: "local",
      transactions: 1,
      operations: 1,
      undos: 1,
      redos: 0,
      refused: 0,
      layers: 1
    })
  })

  it("records a refused transaction once, and a gesture's refusals once as it ends", () => {
    const { session } = setup()
    const { doc } = session
    const remove = { op: "remove" as const, design: "app.par#home", node: "gone" }

    const events = recorded(() => {
      doc.transact("Delete layer", [remove], { origin: "edit" })
      const gesture = doc.beginGesture()
      doc.transact("Move layer", [remove], { origin: "edit", gesture })
      doc.transact("Move layer", [remove], { origin: "edit", gesture })
      doc.endGesture(gesture)
    })

    const refused = { provider: "local", origin: "edit", problem: "unknownNode", op: "remove" }
    expect(events).toEqual([
      { name: "projectDoc.refused", attributes: { ...refused, label: "Delete layer", count: 1 } },
      { name: "projectDoc.refused", attributes: { ...refused, label: "Move layer", count: 2 } }
    ])
  })
})
