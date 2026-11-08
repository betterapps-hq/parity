import { type ContainerSpec, type DesignNode, defaultModeSettings, editNode, findNode } from "@parity-app/core"
import type { StyleSelection } from "@parity-app/editor"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { ChangePreview } from "../canvas/change-preview.ts"
import { DesignStore } from "../design-store.ts"
import { setWindowTelemetry } from "../report-error.ts"
import {
  changedFields,
  type LayerChange,
  mixed,
  PreviewedProp,
  recordInspectorChange,
  recordLayerChange,
  rowChanged
} from "./inspector-events.ts"

const sink = createTestSink()

afterEach(() => {
  setWindowTelemetry(undefined)
  sink.clear()
})

describe("changedFields", () => {
  it("lists each field a change sets, with what the layer showed there before", () => {
    const node = {
      type: "element",
      id: "badge",
      component: "Badge",
      props: { variant: "outline" },
      style: { padding: [2, 2] }
    } as unknown as DesignNode
    expect(
      changedFields(node, { props: { variant: "solid", size: "sm" }, style: { padding: [3, 3] }, hidden: true })
    ).toEqual([
      { field: "hidden", from: false, to: true },
      { field: "props.variant", from: "outline", to: "solid" },
      { field: "props.size", from: undefined, to: "sm" },
      { field: "style.padding", from: [2, 2], to: [3, 3] }
    ])
  })
})

describe("changedFields of an instance", () => {
  it("reads a prop from the instance's arguments, where a change to it goes", () => {
    const node = { type: "instance", id: "card", design: "card", args: { title: "Hello" } } as unknown as DesignNode
    expect(changedFields(node, { props: { title: "Bye" } })).toEqual([
      { field: "props.title", from: "Hello", to: "Bye" }
    ])
  })
})

describe("rowChanged", () => {
  const layer = (id: string, gap?: number) => ({
    id,
    node: {
      type: "layout",
      id,
      children: [],
      ...(gap === undefined ? {} : { style: { gap } })
    } as unknown as DesignNode,
    parent: undefined,
    base: true
  })
  const selection = (...layers: ReturnType<typeof layer>[]) => ({ layers }) as unknown as StyleSelection

  it("counts a change to layers whose values differ, and not setting the value a field already had", () => {
    expect(rowChanged(selection(layer("a", 1), layer("b", 2)), selection(layer("a", 2), layer("b", 3)), "gap")).toBe(
      true
    )
    expect(rowChanged(selection(layer("a", 2)), selection(layer("a", 2)), "gap")).toBe(false)
  })
})

describe("recordInspectorChange", () => {
  it("records the field, the layers and the values as JSON, and nothing for a change that changed nothing", () => {
    setWindowTelemetry(
      createTelemetry({
        events: registeredEvents,
        context: { process: "renderer", installId: "install", sessionId: "session" },
        sinks: [sink],
        check: true
      })
    )
    const change = { field: "style.gap", design: "app.par#home", layers: ["row"], state: "default" }
    recordInspectorChange({ ...change, from: { gap: 2 }, to: { gap: 3 }, gesture: "g1" })
    recordInspectorChange({ ...change, from: { gap: 3 }, to: { gap: 3 } })
    expect(sink.named("inspector.changed").map((event) => event.attributes)).toEqual([
      { ...change, from: '{"gap":2}', to: '{"gap":3}', gesture: true }
    ])
  })

  it("records an edit to layers whose values differ, which read as mixed before and after", () => {
    setWindowTelemetry(
      createTelemetry({
        events: registeredEvents,
        context: { process: "renderer", installId: "install", sessionId: "session" },
        sinks: [sink],
        check: true
      })
    )
    const change = { field: "style.padding", design: "app.par#home", layers: ["a", "b"], from: mixed, to: mixed }
    recordInspectorChange({ ...change, changed: true })
    recordInspectorChange({ ...change, changed: false })
    expect(sink.named("inspector.changed").map((event) => event.attributes)).toEqual([
      { field: "style.padding", design: "app.par#home", layers: ["a", "b"], from: "mixed", to: "mixed", gesture: false }
    ])
  })
})

describe("a component prop previewed by being made", () => {
  const key = "app.par#home"

  /** A design holding an icon whose size is 16, changed as the Layers panel changes it, with each render's layer. */
  function setup() {
    setWindowTelemetry(
      createTelemetry({
        events: registeredEvents,
        context: { process: "renderer", installId: "install", sessionId: "session" },
        sinks: [sink],
        check: true
      })
    )
    const home: ContainerSpec = {
      id: "home",
      name: "home",
      position: { x: 0, y: 0 },
      root: {
        type: "layout",
        id: "root",
        children: [{ type: "component", id: "icon", component: "lucide/Hexagon", props: { size: 16 } }]
      },
      states: [{ id: "default", name: "Default" }]
    }
    const store = new DesignStore(
      [{ path: "app.par", document: { version: 3, containers: [home] } }],
      defaultModeSettings,
      "app.par",
      { saveDocument: async () => undefined, autosave: () => false }
    )
    // The layer as the panel shows it now: a preview shows by being made, so it shows the previewed size.
    const node = () => findNode(store.getEntry(key)!.container.root, "icon")!
    const change: LayerChange = (label, value, gesture, shown = node()) => {
      store.updateContainer(key, label, (current) => editNode(current, "default", "icon", value), { gesture })
      if (shown) recordLayerChange(key, ["icon"], "default", shown, value, gesture)
    }
    const prop = new PreviewedProp(new ChangePreview(store, key))
    const size = (to: number) => ({ props: { size: to } })
    const recorded = () =>
      sink.named("inspector.changed").map(({ attributes }) => ({ from: attributes.from, to: attributes.to }))
    return { node, change, prop, size, recorded }
  }

  it("records nothing as it's previewed, and the change once, from the size before the first preview", () => {
    const { node, change, prop, size, recorded } = setup()
    for (const to of [20, 24, 28]) prop.show(node(), change, "Change size", size(to))
    expect(recorded()).toEqual([])
    prop.commit(node(), change, "Change size", size(28))
    expect(recorded()).toEqual([{ from: "16", to: "28" }])
  })

  it("records nothing when the preview is taken back, as Escape does", () => {
    const { node, change, prop, size, recorded } = setup()
    prop.show(node(), change, "Change size", size(20))
    prop.cancel()
    expect(recorded()).toEqual([])
    // The next change starts from the size the layer has again.
    prop.commit(node(), change, "Change size", size(18))
    expect(recorded()).toEqual([{ from: "16", to: "18" }])
  })
})
