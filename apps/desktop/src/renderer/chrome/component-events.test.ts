import { type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { DesignStore } from "../design-store.ts"
import { setWindowTelemetry } from "../report-error.ts"
import type { ProjectSession } from "../workspace.ts"
import { detachAndRecord, pushAndRecord } from "./component-events.ts"
import { extractIntoComponent } from "./components.ts"

// Extracting measures the designs on the canvas, which there isn't one of here.
vi.mock("../canvas/CanvasEditor.tsx", () => ({ canvasIdFor: (key: string) => key }))

const sink = createTestSink()
const recorded = () => sink.named("component.changed").map((event) => event.attributes)

beforeEach(() => {
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
})

const card: ContainerSpec = {
  id: "card",
  name: "Card",
  kind: "component",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", children: [{ type: "text", id: "title", text: "Hello" }] },
  states: [{ id: "default", name: "Default" }]
}

/** A screen, Home, placing Card twice: `first` with its title overridden, `second` as the component has it. */
function setup() {
  const home: ContainerSpec = {
    id: "home",
    name: "Home",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "page",
      children: [
        { type: "instance", id: "first", design: "card", overrides: { title: { text: "Welcome" } } },
        { type: "instance", id: "second", design: "card" },
        { type: "text", id: "note", text: "Fine print" }
      ]
    },
    states: [{ id: "default", name: "Default" }]
  }

  return new DesignStore(
    [{ path: "app.par", document: { version: 4, containers: [card, home] } }],
    defaultModeSettings,
    "app.par",
    { saveDocument: async () => undefined, autosave: () => false }
  )
}

describe("component.changed (PAR-728)", () => {
  it("records an instance detached, with its design, the instance and the component it followed", () => {
    const store = setup()
    detachAndRecord(store, "app.par#home", "first")
    expect(store.getEntry("app.par#home")?.container.root).toMatchObject({
      children: [{ type: "layout", id: "first" }, { type: "instance" }, {}]
    })
    expect(recorded()).toEqual([{ action: "detach", design: "app.par#home", layers: ["first"], component: "card" }])
  })

  it("records nothing for a layer that isn't an instance", () => {
    const store = setup()
    detachAndRecord(store, "app.par#home", "page")
    expect(recorded()).toEqual([])
  })

  it("records a copy's overrides pushed to its component", () => {
    const store = setup()
    pushAndRecord(store, "app.par#home", "app.par#card", "first")
    expect(store.getEntry("app.par#card")?.container.root).toMatchObject({ children: [{ text: "Welcome" }] })
    expect(recorded()).toEqual([{ action: "push", design: "app.par#home", layers: ["first"], component: "card" }])
  })

  it("records a layer's overrides pushed from inside a copy against the layer's path", () => {
    const store = setup()
    pushAndRecord(store, "app.par#home", "app.par#card", "first", { key: "title", path: "first/title" })
    expect(recorded()).toEqual([{ action: "push", design: "app.par#home", layers: ["first/title"], component: "card" }])
  })

  it("records layers made a component, with the component made", () => {
    const store = setup()
    // SAFETY: making a component reads only the session's store, and its editor, which a test leaves out.
    const key = extractIntoComponent({ store } as ProjectSession, store.getEntry("app.par#home")!, ["note"], "Note")
    const made = store.getEntry(key)!.container
    expect(made).toMatchObject({ name: "Note", kind: "component" })
    expect(recorded()).toEqual([{ action: "extract", design: "app.par#home", layers: ["note"], component: made.id }])
  })

  it("records nothing for a push that throws", () => {
    const store = setup()
    expect(() => pushAndRecord(store, "app.par#home", "app.par#card", "page")).toThrow("isn't an instance")
    expect(recorded()).toEqual([])
  })
})
