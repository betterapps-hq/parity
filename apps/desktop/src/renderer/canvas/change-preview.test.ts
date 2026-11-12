import { type ContainerSpec, defaultModeSettings, editNode, findNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { DesignStore } from "../design-store.ts"
import { ChangePreview } from "./change-preview.ts"

const key = "app.par#home"

/** A design holding an icon whose size is 16, and a preview of its size as the Props section makes one. */
function setup() {
  const home: ContainerSpec = {
    id: "home",
    name: "home",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "root",
      children: [{ type: "component", id: "icon", component: "lucide/Hexagon", props: { size: 16 } }]
    }
  }

  const store = new DesignStore(
    [{ path: "app.par", document: { version: 3, containers: [home] } }],
    defaultModeSettings,
    "app.par",
    { saveDocument: async () => undefined, autosave: () => false }
  )

  const preview = new ChangePreview(store, key)

  const set = (size: number) => (gesture?: string) =>
    store.updateContainer(key, "Change size", (current) => editNode(current, "default", "icon", { props: { size } }), {
      gesture
    })

  const size = () => {
    const node = findNode(store.getEntry(key)!.container.root, "icon")

    return node?.type === "component" ? node.props?.size : undefined
  }

  return { store, preview, set, size }
}

describe("previewing a change by making it", () => {
  it("shows each change in place of the last, and taking it back leaves nothing to undo", () => {
    const { store, preview, set, size } = setup()
    set(20)()
    preview.show(set(3))
    preview.show(set(32))
    expect(size()).toBe(32)
    expect(store.getHistory()).toMatchObject({ undoLabel: "Change size", canRedo: false })
    preview.cancel()
    expect(size()).toBe(20)
    store.undo()
    expect(size()).toBe(16)
    expect(store.getHistory().canUndo).toBe(false)
    expect(store.getSaveState()).toEqual({ status: "saved" })
  })

  it("makes the edit as one undo step, whatever it previewed on the way", () => {
    const { store, preview, set, size } = setup()
    preview.show(set(3))
    preview.show(set(32))
    preview.commit(set(32))
    expect(size()).toBe(32)
    store.undo()
    expect(size()).toBe(16)
    expect(store.getHistory().canUndo).toBe(false)
  })

  it("makes the edit in the gesture it's given, so a run of steps after a preview is one undo step", () => {
    const { store, preview, set, size } = setup()
    preview.show(set(30))
    const run = store.beginGesture()
    preview.commit(set(31), run)
    preview.commit(set(32), run)
    store.endGesture(run)
    expect(size()).toBe(32)
    store.undo()
    expect(size()).toBe(16)
    expect(store.getHistory().canUndo).toBe(false)
  })

  it("keeps what could be redone when a preview is taken back", () => {
    const { store, preview, set, size } = setup()
    set(20)()
    store.undo()
    preview.show(set(32))
    expect(store.getHistory().canRedo).toBe(false)
    preview.cancel()
    expect(size()).toBe(16)
    expect(store.getHistory()).toMatchObject({ canUndo: false, canRedo: true })
  })
})
