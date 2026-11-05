import { type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { activeState, editFrame, editingState, modeViewport } from "./edit-frame.ts"
import { designsSelection, layersSelection, type Selection } from "./selection.ts"

/** A sign-in screen showing its Error state, with a Loading state too, and a pricing screen with only its default. */
function signIn(): ContainerSpec {
  return {
    id: "sign-in",
    name: "Sign in",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [{ type: "text", id: "title", text: "Sign in" }] },
    states: [
      { id: "default", name: "Default" },
      { id: "error", name: "Error" },
      { id: "loading", name: "Loading" }
    ],
    view: { state: "error" }
  }
}

function pricing(): ContainerSpec {
  return {
    id: "pricing",
    name: "Pricing",
    position: { x: 2000, y: 0 },
    root: { type: "layout", id: "root", children: [] },
    states: [{ id: "default", name: "Default" }]
  }
}

const designs = new Map([
  ["main/sign-in", signIn()],
  ["main/pricing", pricing()]
])
const target = (picked: Selection) => editFrame(picked, (key) => designs.get(key), defaultModeSettings)

describe("editFrame", () => {
  it("edits layers in the state and viewport of the frame they were picked in", () => {
    const frame = target(layersSelection("main/sign-in", ["title"], { mode: "mobile-light", state: "loading" }))
    expect(frame?.design).toBe("main/sign-in")
    expect(frame?.state.id).toBe("loading")
    expect(frame?.viewport).toBe("mobile")
  })

  it("edits a layer picked in a state that's since gone in the state the board shows", () => {
    const frame = target(layersSelection("main/sign-in", ["title"], { mode: "desktop-light", state: "deleted" }))
    expect(frame?.state.id).toBe("error")
    expect(frame?.viewport).toBe("desktop")
  })

  it("edits a design picked whole in the state its board shows, in the base styles", () => {
    const frame = target({ design: "main/sign-in" })
    expect(frame?.state.id).toBe("error")
    expect(frame).not.toHaveProperty("viewport")
  })

  it("edits a mode column picked on its own in that mode's viewport", () => {
    const frame = target({ design: "main/sign-in", mode: "tablet-light" })
    expect(frame?.state.id).toBe("error")
    expect(frame?.viewport).toBe("tablet")
  })

  it("edits the design picked last of several", () => {
    const frame = target(designsSelection(["main/sign-in", "main/pricing"]))
    expect(frame?.design).toBe("main/pricing")
    expect(frame?.state.id).toBe("default")
  })

  it("has nothing to edit for a note, nothing selected, or a design that's gone", () => {
    expect(target({ note: "main/note-1" })).toBeUndefined()
    expect(target({})).toBeUndefined()
    expect(target({ design: "main/gone", node: "title" })).toBeUndefined()
  })
})

describe("the state edits go to", () => {
  it("is the state the layer was picked in", () => {
    expect(editingState(signIn(), "loading").id).toBe("loading")
  })

  it("is the state the board shows when none was picked, or the one picked is gone", () => {
    expect(editingState(signIn(), undefined).id).toBe("error")
    expect(editingState(signIn(), "deleted").id).toBe("error")
  })

  it("is the base state when the board shows none, or one that's gone", () => {
    expect(editingState({ ...signIn(), view: {} }, undefined).id).toBe("default")
    expect(activeState({ ...signIn(), view: { state: "deleted" } }).id).toBe("default")
  })
})

describe("modeViewport", () => {
  it("has no viewport for no mode, or a mode the project no longer has", () => {
    expect(modeViewport(defaultModeSettings, "desktop-dark")).toBe("desktop")
    expect(modeViewport(defaultModeSettings, undefined)).toBeUndefined()
    expect(modeViewport(defaultModeSettings, "watch-light")).toBeUndefined()
  })
})
