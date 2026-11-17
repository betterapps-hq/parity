import type { Gesture } from "@parity-app/extension/internal"
import { describe, expect, it } from "vite-plus/test"
import type { Drag } from "./gesture.ts"
import { dropIn, type GestureProject, onGestures, telling } from "./presence-gestures.ts"

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
