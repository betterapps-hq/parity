import { type ContainerSpec, type DesignNode, defaultModeSettings, findNode } from "@parity-app/core"
import type { ProjectDoc } from "@parity-app/multiplayer"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { ComponentStore } from "../components-store.ts"
import { openTestSession } from "../doc-fixtures.ts"
import { setWindowTelemetry } from "../report-error.ts"
import { SelectionStore } from "../selection.ts"
import { notify } from "../toasts.tsx"
import type { ProjectSession } from "../workspace.ts"
import { pasteClipboard, pasteOverSelection, pasteToReplace } from "./clipboard.ts"

// Which layers Paste over and Paste to replace act on once an image is saved is `@parity-app/editor`'s rule
// (`selectionToPasteOn`, tested in paste-over.test.ts). These change the selection while the image saves, on a real
// document, and see where the paste lands (PAR-981).

/** Saving the pasted image, which finishes when a test says. */
const saving = vi.hoisted(() => ({
  finish: (_node: DesignNode): void => {
    throw new Error("No image is being saved")
  }
}))

vi.mock("./import-media.ts", () => ({
  importMedia: () =>
    new Promise<DesignNode>((resolve) => {
      saving.finish = resolve
    })
}))

vi.mock("../toasts.tsx", () => ({
  notify: {
    progress: vi.fn<() => string>(() => "progress"),
    close: vi.fn<() => void>(),
    done: vi.fn<() => string>(() => "done"),
    info: vi.fn<() => string>(() => "info"),
    warning: vi.fn<() => string>(() => "warning"),
    failed: vi.fn<() => string>(() => "failed")
  },
  list: (names: readonly string[]) => names.join(", ")
}))

// Pasting names designs as the canvas does, which there isn't one of here.
vi.mock("./CanvasEditor.tsx", () => ({ canvasIdFor: (key: string) => key }))

const image: DesignNode = { type: "image", id: "pasted", src: "images/pasted-image.png" }

const text = (id: string): DesignNode => ({ type: "text", id, text: id })

function card(): ContainerSpec {
  return {
    id: "card",
    name: "Card",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [text("title"), text("body"), text("footer")] }
  }
}

const sink = createTestSink()

function session() {
  const designs = openTestSession([{ path: "app.par", document: { version: 4, containers: [card()] } }], {
    modes: defaultModeSettings
  })

  return { id: "project", ...designs, selection: new SelectionStore(), components: new ComponentStore() }
}

/** The card's layers, in order, with the pasted image, which gets an id of its own, as "image". */
function layers(doc: ProjectDoc): string[] {
  return children(doc).map((child) => (child.type === "image" ? "image" : child.id))
}

function children(doc: ProjectDoc): DesignNode[] {
  // SAFETY: the card's root is a layout.
  return (findNode(doc.design("app.par#card")!.root, "root") as Extract<DesignNode, { type: "layout" }>).children
}

/** Waits for the paste to read the clipboard and start saving the image. */
const saveStarted = () => vi.waitFor(() => expect(notify.progress).toHaveBeenCalled())

beforeEach(() => {
  // An image on the clipboard, as after copying a screenshot, and no Parity copy or text.
  vi.stubGlobal("navigator", {
    clipboard: {
      readText: () => Promise.resolve(""),
      read: () =>
        Promise.resolve([{ types: ["image/png"], getType: () => Promise.resolve(new Blob([], { type: "image/png" })) }])
    }
  })
  vi.stubGlobal("window", { canvasHost: { copiedFiles: () => Promise.resolve([]) } })
  setWindowTelemetry(
    createTelemetry({
      events: registeredEvents,
      context: { process: "renderer", installId: "install", sessionId: "session" },
      sinks: [sink],
      check: true
    })
  )
})

afterEach(() => {
  setWindowTelemetry(undefined)
  sink.clear()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("pasting an image over the selection", () => {
  it("goes over the layer selected while the image saved, not the one selected before", async () => {
    const { doc, selection, ...rest } = session()
    selection.set({ design: "app.par#card", node: "title" })
    const pasting = pasteOverSelection({ doc, selection, ...rest })
    await saveStarted()
    selection.set({ design: "app.par#card", node: "body" })
    saving.finish(image)
    await pasting

    expect(layers(doc)).toEqual(["title", "body", "image", "footer"])
    expect(selection.get().node).toBe(children(doc)[2]?.id)
  })

  it("pastes nothing when no layers are selected once the image is saved", async () => {
    const { doc, selection, ...rest } = session()
    selection.set({ design: "app.par#card", node: "title" })
    const pasting = pasteOverSelection({ doc, selection, ...rest })
    await saveStarted()
    selection.set({})
    saving.finish(image)
    await pasting

    expect(layers(doc)).toEqual(["title", "body", "footer"])
    expect(notify.info).toHaveBeenCalledWith("Nothing pasted", { description: "No layers are selected." })
    expect(sink.named("clipboard.failed").map((event) => event.attributes)).toEqual([
      { how: "over", content: "image", reason: "noTarget" }
    ])
  })
})

describe("replacing the selection with an image", () => {
  it("replaces the layer still selected once the image is saved", async () => {
    const { doc, selection, ...rest } = session()
    selection.set({ design: "app.par#card", node: "title" })
    const pasting = pasteToReplace({ doc, selection, ...rest })
    await saveStarted()
    saving.finish(image)
    await pasting

    expect(layers(doc)).toEqual(["image", "body", "footer"])
  })

  it("replaces nothing when another layer was selected while the image saved", async () => {
    const { doc, selection, ...rest } = session()
    selection.set({ design: "app.par#card", node: "title" })
    const pasting = pasteToReplace({ doc, selection, ...rest })
    await saveStarted()
    selection.set({ design: "app.par#card", node: "body" })
    saving.finish(image)
    await pasting

    expect(layers(doc)).toEqual(["title", "body", "footer"])
    expect(selection.get()).toEqual({ design: "app.par#card", node: "body" })
    expect(doc.history().canUndo).toBe(false)
    expect(notify.info).toHaveBeenCalledWith("Nothing replaced", {
      description: "The selection changed before the paste finished."
    })
    expect(sink.named("clipboard.failed").map((event) => event.attributes)).toEqual([
      { how: "replace", content: "image", reason: "noTarget" }
    ])
  })
})

// What each paste does with what's on the clipboard is `decidePaste`'s, tested as a table in paste-decision.test.ts.
// This checks the pastes carry out its answer the same way (PAR-985).
describe("pasting from an empty clipboard", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { clipboard: { readText: () => Promise.resolve(""), read: () => Promise.resolve([]) } })
  })

  it("Paste pastes nothing and says nothing, but records it", async () => {
    const { doc, selection, ...rest } = session()
    // SAFETY: an empty clipboard pastes nothing, so the project's root is all Paste reads of its info.
    const info = { root: "project" } as ProjectSession["info"]
    await pasteClipboard({ doc, selection, ...rest, editor: undefined, info })

    expect(layers(doc)).toEqual(["title", "body", "footer"])
    expect(doc.history().canUndo).toBe(false)
    expect(notify.info).not.toHaveBeenCalled()
    expect(sink.named("clipboard.failed").map((event) => event.attributes)).toEqual([
      { how: "paste", content: "empty", reason: "empty" }
    ])
  })

  it.each([
    {
      name: "Paste over layers",
      how: "over",
      paste: pasteOverSelection,
      selected: { design: "app.par#card", node: "title" }
    },
    { name: "Paste over designs", how: "over", paste: pasteOverSelection, selected: { designs: ["app.par#card"] } },
    {
      name: "Paste to replace",
      how: "replace",
      paste: pasteToReplace,
      selected: { design: "app.par#card", node: "title" }
    }
  ])("$name says there's nothing to paste and pastes nothing", async ({ how, paste, selected }) => {
    const { doc, selection, ...rest } = session()
    selection.set(selected)
    await paste({ doc, selection, ...rest })

    expect(layers(doc)).toEqual(["title", "body", "footer"])
    expect(doc.history().canUndo).toBe(false)
    expect(notify.info).toHaveBeenCalledWith("Nothing to paste", {})
    expect(sink.named("clipboard.failed").map((event) => event.attributes)).toEqual([
      { how, content: "empty", reason: "empty" }
    ])
  })
})
