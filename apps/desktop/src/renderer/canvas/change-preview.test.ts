import { type ContainerSpec, defaultModeSettings, editNode, findNode } from "@parity-app/core"
import { updateContainer } from "@parity-app/multiplayer"
import { describe, expect, it } from "vite-plus/test"
import { openTestSession } from "../doc-fixtures.ts"
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

  const { doc, saver } = openTestSession([{ path: "app.par", document: { version: 4, containers: [home] } }], {
    modes: defaultModeSettings
  })

  const preview = new ChangePreview(doc, key)

  const set = (size: number) => (gesture?: string) =>
    updateContainer(doc, key, "Change size", (current) => editNode(current, "default", "icon", { props: { size } }), {
      gesture
    })

  const size = () => {
    const node = findNode(doc.design(key)!.root, "icon")

    return node?.type === "component" ? node.props?.size : undefined
  }

  return { doc, saver, preview, set, size }
}

describe("previewing a change by making it", () => {
  it("shows each change in place of the last, and taking it back leaves nothing to undo", () => {
    const { doc, saver, preview, set, size } = setup()
    set(20)()
    preview.show(set(3))
    preview.show(set(32))
    expect(size()).toBe(32)
    expect({ undoLabel: doc.history().undo[0], canRedo: doc.history().canRedo }).toEqual({
      undoLabel: "Change size",
      canRedo: false
    })
    preview.cancel()
    expect(size()).toBe(20)
    doc.undo()
    expect(size()).toBe(16)
    expect(doc.history().canUndo).toBe(false)
    expect(saver.state()).toEqual({ status: "saved" })
  })

  it("makes the edit as one undo step, whatever it previewed on the way", () => {
    const { doc, preview, set, size } = setup()
    preview.show(set(3))
    preview.show(set(32))
    preview.commit(set(32))
    expect(size()).toBe(32)
    doc.undo()
    expect(size()).toBe(16)
    expect(doc.history().canUndo).toBe(false)
  })

  it("makes the edit in the gesture it's given, so a run of steps after a preview is one undo step", () => {
    const { doc, preview, set, size } = setup()
    preview.show(set(30))
    const run = doc.beginGesture()
    preview.commit(set(31), run)
    preview.commit(set(32), run)
    doc.endGesture(run)
    expect(size()).toBe(32)
    doc.undo()
    expect(size()).toBe(16)
    expect(doc.history().canUndo).toBe(false)
  })

  it("keeps what could be redone when a preview is taken back", () => {
    const { doc, preview, set, size } = setup()
    set(20)()
    doc.undo()
    preview.show(set(32))
    expect(doc.history().canRedo).toBe(false)
    preview.cancel()
    expect(size()).toBe(16)
    expect(doc.history()).toMatchObject({ canUndo: false, canRedo: true })
  })
})
