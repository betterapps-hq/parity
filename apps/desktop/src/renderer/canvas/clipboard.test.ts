import { type ContainerSpec, type DesignNode, defaultModeSettings, findNode } from "@parity-app/core"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { toast } from "sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { ComponentStore } from "../components-store.ts"
import { DesignStore } from "../design-store.ts"
import { setWindowTelemetry } from "../report-error.ts"
import { SelectionStore } from "../selection.ts"
import { pasteOverSelection, pasteToReplace } from "./clipboard.ts"

// Which layers Paste over and Paste to replace act on once an image is saved is `@parity-app/editor`'s rule
// (`selectionToPasteOn`, tested in paste-over.test.ts). These change the selection while the image saves, on the real
// stores, and see where the paste lands (PAR-981).

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

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn<() => string>(() => "progress"),
    dismiss: vi.fn<() => void>(),
    info: vi.fn<() => void>(),
    error: vi.fn<() => void>()
  }
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
  const store = new DesignStore(
    [{ path: "app.par", document: { version: 4, containers: [card()] } }],
    defaultModeSettings,
    "app.par",
    { saveDocument: async () => undefined, autosave: () => false }
  )

  return { id: "project", store, selection: new SelectionStore(), components: new ComponentStore() }
}

/** The card's layers, in order, with the pasted image, which gets an id of its own, as "image". */
function layers(store: DesignStore): string[] {
  return children(store).map((child) => (child.type === "image" ? "image" : child.id))
}

function children(store: DesignStore): DesignNode[] {
  // SAFETY: the card's root is a layout.
  return (findNode(store.getEntry("app.par#card")!.container.root, "root") as Extract<DesignNode, { type: "layout" }>)
    .children
}

/** Waits for the paste to read the clipboard and start saving the image. */
const saveStarted = () => vi.waitFor(() => expect(toast.loading).toHaveBeenCalled())

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
    const { store, selection, ...rest } = session()
    selection.set({ design: "app.par#card", node: "title" })
    const pasting = pasteOverSelection({ store, selection, ...rest })
    await saveStarted()
    selection.set({ design: "app.par#card", node: "body" })
    saving.finish(image)
    await pasting

    expect(layers(store)).toEqual(["title", "body", "image", "footer"])
    expect(selection.get().node).toBe(children(store)[2]?.id)
  })

  it("pastes nothing when no layers are selected once the image is saved", async () => {
    const { store, selection, ...rest } = session()
    selection.set({ design: "app.par#card", node: "title" })
    const pasting = pasteOverSelection({ store, selection, ...rest })
    await saveStarted()
    selection.set({})
    saving.finish(image)
    await pasting

    expect(layers(store)).toEqual(["title", "body", "footer"])
    expect(toast.info).toHaveBeenCalledWith("No layers are selected, so nothing was pasted")
    expect(sink.named("clipboard.failed").map((event) => event.attributes)).toEqual([
      { how: "over", content: "image", reason: "noTarget" }
    ])
  })
})

describe("replacing the selection with an image", () => {
  it("replaces the layer still selected once the image is saved", async () => {
    const { store, selection, ...rest } = session()
    selection.set({ design: "app.par#card", node: "title" })
    const pasting = pasteToReplace({ store, selection, ...rest })
    await saveStarted()
    saving.finish(image)
    await pasting

    expect(layers(store)).toEqual(["image", "body", "footer"])
  })

  it("replaces nothing when another layer was selected while the image saved", async () => {
    const { store, selection, ...rest } = session()
    selection.set({ design: "app.par#card", node: "title" })
    const pasting = pasteToReplace({ store, selection, ...rest })
    await saveStarted()
    selection.set({ design: "app.par#card", node: "body" })
    saving.finish(image)
    await pasting

    expect(layers(store)).toEqual(["title", "body", "footer"])
    expect(selection.get()).toEqual({ design: "app.par#card", node: "body" })
    expect(store.getHistory().canUndo).toBe(false)
    expect(toast.info).toHaveBeenCalledWith("The selection changed, so nothing was replaced")
    expect(sink.named("clipboard.failed").map((event) => event.attributes)).toEqual([
      { how: "replace", content: "image", reason: "noTarget" }
    ])
  })
})
