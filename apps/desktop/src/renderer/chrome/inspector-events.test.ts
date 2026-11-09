import {
  addState,
  addVariant,
  type ContainerSpec,
  type DesignNode,
  defaultModeSettings,
  editNode,
  findNode,
  mapNode,
  nodeOnBoard,
  resetOverride,
  setSlot
} from "@parity-app/core"
import type { StyleSelection } from "@parity-app/editor"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { ChangePreview } from "../canvas/change-preview.ts"
import { DesignStore } from "../design-store.ts"
import { setWindowTelemetry } from "../report-error.ts"
import {
  applyToken,
  changedFields,
  fieldValue,
  type LayerChange,
  mixed,
  PreviewedProp,
  paramValue,
  recordInspectorChange,
  recordLayerChange,
  rowChanged,
  statesValue,
  updateAndRecord
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

      if (shown) {
        recordLayerChange(key, ["icon"], "default", shown, value, gesture)
      }
    }

    const prop = new PreviewedProp(new ChangePreview(store, key))
    const size = (to: number) => ({ props: { size: to } })

    const recorded = () =>
      sink.named("inspector.changed").map(({ attributes }) => ({ from: attributes.from, to: attributes.to }))

    return { node, change, prop, size, recorded }
  }

  it("records nothing as it's previewed, and the change once, from the size before the first preview", () => {
    const { node, change, prop, size, recorded } = setup()

    for (const to of [20, 24, 28]) {
      prop.show(node(), change, "Change size", size(to))
    }

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

describe("a change to a design, recorded as the store makes it (PAR-713)", () => {
  const key = "app.par#card"

  /** A component design, Card, with a title, a layout that can be a slot, and a state that hides the title. */
  function setup() {
    setWindowTelemetry(
      createTelemetry({
        events: registeredEvents,
        context: { process: "renderer", installId: "install", sessionId: "session" },
        sinks: [sink],
        check: true
      })
    )

    const card: ContainerSpec = {
      id: "card",
      name: "Card",
      kind: "component",
      position: { x: 0, y: 0 },
      root: {
        type: "layout",
        id: "root",
        children: [
          { type: "text", id: "title", text: "Hello" },
          { type: "layout", id: "body", children: [] }
        ]
      },
      states: [
        { id: "default", name: "Default" },
        { id: "closed", name: "Closed", overrides: { title: { hidden: true } } }
      ]
    }

    const store = new DesignStore(
      [{ path: "app.par", document: { version: 3, containers: [card] } }],
      defaultModeSettings,
      "app.par",
      { saveDocument: async () => undefined, autosave: () => false }
    )

    const recorded = () => sink.named("inspector.changed").map((event) => event.attributes)

    return { store, recorded }
  }

  it("records a rename with the name before and after, and nothing for one that keeps the name", () => {
    const { store, recorded } = setup()

    const rename = (name: string) =>
      updateAndRecord(store, key, "Rename component", (current) => ({ ...current, name }), {
        field: "name",
        read: (current) => current.name
      })

    rename("Profile card")
    rename("Profile card")
    expect(recorded()).toEqual([
      { field: "name", design: key, layers: [], from: '"Card"', to: '"Profile card"', gesture: false }
    ])
  })

  it("records a layer's new name against the layer", () => {
    const { store, recorded } = setup()
    updateAndRecord(
      store,
      key,
      "Rename layer",
      (current) => ({
        ...current,
        root: mapNode(current.root, "title", (node) => ({ ...node, name: "Heading" }))
      }),
      {
        field: "name",
        layers: ["title"],
        read: (current) => findNode(current.root, "title")?.name
      }
    )
    expect(recorded()).toEqual([
      { field: "name", design: key, layers: ["title"], from: "null", to: '"Heading"', gesture: false }
    ])
  })

  it("records nothing for a change the design refuses", () => {
    const { store, recorded } = setup()
    expect(() =>
      updateAndRecord(store, key, "Add size variant", (current) => addVariant(current, "size", []), {
        field: "params.size",
        read: (current) => paramValue(current, "size")
      })
    ).toThrow("A variant needs at least one option")
    expect(recorded()).toEqual([])
  })

  it("records a variant's options by id and name, not what each changes", () => {
    const { store, recorded } = setup()
    updateAndRecord(store, key, "Add size variant", (current) => addVariant(current, "size", ["Small", "Large"]), {
      field: "params.size",
      read: (current) => paramValue(current, "size")
    })
    const [event] = recorded()
    expect(event).toMatchObject({ field: "params.size", design: key, layers: [], from: "null" })
    expect(JSON.parse(event!.to as string)).toMatchObject({
      type: "variant",
      options: [
        { id: expect.any(String), name: "Small" },
        { id: expect.any(String), name: "Large" }
      ]
    })
  })

  it("records the states by id and name when one is added", () => {
    const { store, recorded } = setup()
    updateAndRecord(store, key, "Add state", (current) => addState(current, "New state").container, {
      field: "states",
      read: statesValue
    })
    const [event] = recorded()
    expect(JSON.parse(event!.from as string)).toEqual([
      { id: "default", name: "Default" },
      { id: "closed", name: "Closed" }
    ])
    expect(JSON.parse(event!.to as string)).toHaveLength(3)
  })

  it("records a layout made a slot, with its name", () => {
    const { store, recorded } = setup()
    updateAndRecord(store, key, "Make slot", (current) => setSlot(current, "body", "content"), {
      field: "slot",
      layers: ["body"],
      read: (current) => {
        const node = findNode(current.root, "body")

        return node?.type === "layout" ? node.slot : undefined
      }
    })
    expect(recorded()).toEqual([
      { field: "slot", design: key, layers: ["body"], from: "null", to: '"content"', gesture: false }
    ])
  })

  it("records a state's change reset, from what the state showed to what the design does", () => {
    const { store, recorded } = setup()
    const field = { kind: "hidden" } as const

    const shown = (current: ContainerSpec) =>
      nodeOnBoard(
        current,
        findNode(current.root, "title")!,
        current.states.find((state) => state.id === "closed")!
      )

    updateAndRecord(store, key, "Reset change", (current) => resetOverride(current, "closed", "title", field), {
      field: "hidden",
      layers: ["title"],
      state: "closed",
      read: (current) => fieldValue(shown(current), field)
    })
    expect(recorded()).toEqual([
      { field: "hidden", design: key, layers: ["title"], state: "closed", from: "true", to: "false", gesture: false }
    ])
  })
})

describe("fieldValue", () => {
  it("reads an instance's prop from its arguments, and a layer's visibility as shown when it has none", () => {
    const instance = { type: "instance", id: "card", design: "card", args: { title: "Hello" } } as DesignNode
    expect(fieldValue(instance, { kind: "props", key: "title" })).toBe("Hello")
    expect(fieldValue(instance, { kind: "hidden" })).toBe(false)
  })
})

describe("applyToken", () => {
  it("records the themes it sets, with the token's values before and after, and nothing for setting them again", () => {
    setWindowTelemetry(
      createTelemetry({
        events: registeredEvents,
        context: { process: "renderer", installId: "install", sessionId: "session" },
        sinks: [sink],
        check: true
      })
    )
    let values: Record<string, string> = { default: "#000", dark: "#fff" }

    const store = {
      get: () => [{ name: "primary", category: "color", source: "semantic", values }] as never,
      set: (changes: { theme: string; value: string }[]) => {
        values = { ...values, ...Object.fromEntries(changes.map(({ theme, value }) => [theme, value])) }
      }
    }

    applyToken(store, "primary", { default: "#111", dark: "#fff" })
    applyToken(store, "primary", { default: "#111" })
    expect(sink.named("inspector.changed").map((event) => event.attributes)).toEqual([
      {
        field: "token.primary",
        layers: [],
        from: '{"default":"#000","dark":"#fff"}',
        to: '{"default":"#111","dark":"#fff"}',
        gesture: false
      }
    ])
  })
})
