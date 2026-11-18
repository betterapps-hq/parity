import type { Gesture } from "@parity-app/extension/internal"
import { describe, expect, it } from "vite-plus/test"
import type { Drag } from "./gesture.ts"
import {
  type BrushingEditor,
  dropIn,
  type GestureProject,
  onGestures,
  telling,
  tellBrushing
} from "./presence-gestures.ts"

const doc = { design: () => undefined }

describe("dropIn", () => {
  it("names the frame the layers would land in, not the one they were dragged from", () => {
    const landing = { dataset: { design: "card", state: "hover", mode: "dark" } }

    expect(dropIn(doc, landing, { design: "card", parent: "row", index: 1 })).toEqual({
      state: "hover",
      mode: "dark",
      parent: { owner: "design", type: "layer", key: "card/row" },
      index: 1
    })
  })
})

describe("telling", () => {
  it("tells a move's drop again when only the frame it would land in changes", () => {
    // SAFETY: gestures are told by the project, which `telling` only passes on.
    const project = { doc: {} } as GestureProject
    const heard: string[] = []

    const stop = onGestures(project, (gesture: Gesture) => {
      heard.push(gesture.kind === "move" && gesture.drop ? `${gesture.phase} ${gesture.drop.state}` : gesture.phase)
    })

    let state = "default"
    const parent = { owner: "design", type: "layer", key: "card/row" } as const

    const press = telling(
      project,
      { move: () => undefined },
      () => ({ kind: "move", targets: [] }),
      () => ({ state, parent, index: 0 })
    )

    // SAFETY: neither is read by a press that only moves.
    const event = {} as PointerEvent
    // SAFETY: as above.
    const drag = {} as Drag

    press.start?.(drag, event)
    press.move(event, drag)
    press.move(event, drag)
    state = "hover"
    press.move(event, drag)
    stop()

    expect(heard).toEqual(["start", "drop default", "drop hover"])
  })
})

describe("tellBrushing", () => {
  /** tldraw's editor as far as brushing goes: `press` and `handle` stand in for the select tool's states. */
  function brushingEditor() {
    const listeners = new Set<(info: { name: string }) => void>()
    let brushing = false

    const editor: BrushingEditor = {
      isIn: () => brushing,
      on: (_event, listener) => listeners.add(listener),
      off: (_event, listener) => listeners.delete(listener),
      inputs: { getOriginPagePoint: () => ({ x: 10, y: 20 }) }
    }

    return {
      editor,
      listening: () => listeners.size,
      /** An event tldraw has handled, leaving it brushing or not. */
      handle(name: string, now: boolean) {
        brushing = now
        listeners.forEach((listener) => listener({ name }))
      }
    }
  }

  function heardOn(project: GestureProject) {
    const heard: string[] = []

    const stop = onGestures(project, (gesture) => {
      heard.push(gesture.kind === "marquee" ? `${gesture.phase} ${gesture.from.x},${gesture.from.y}` : gesture.kind)
    })

    return { heard, stop }
  }

  it("tells a box on the empty canvas from where the press started, ended when let go", () => {
    // SAFETY: gestures are told by the project, which `tellBrushing` only passes on.
    const project = { doc: {} } as GestureProject
    const { heard, stop } = heardOn(project)
    const tldraw = brushingEditor()
    const stopBrushing = tellBrushing(tldraw.editor, project)

    tldraw.handle("pointer_down", false)
    tldraw.handle("pointer_move", true)
    tldraw.handle("pointer_move", true)
    tldraw.handle("pointer_up", false)
    stopBrushing()
    stop()

    expect(heard).toEqual(["start 10,20", "end 10,20"])
    expect(tldraw.listening()).toBe(0)
  })

  it("calls the box off on Escape, and as the canvas goes while it's drawn", () => {
    // SAFETY: as above.
    const project = { doc: {} } as GestureProject
    const { heard, stop } = heardOn(project)
    const tldraw = brushingEditor()
    const stopBrushing = tellBrushing(tldraw.editor, project)

    tldraw.handle("pointer_move", true)
    tldraw.handle("cancel", false)
    tldraw.handle("pointer_move", true)
    stopBrushing()
    stop()

    expect(heard).toEqual(["start 10,20", "cancel 10,20", "start 10,20", "cancel 10,20"])
  })
})
