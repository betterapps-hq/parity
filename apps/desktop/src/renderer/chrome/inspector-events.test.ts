import type { DesignNode } from "@parity-app/core"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { setWindowTelemetry } from "../report-error.ts"
import { changedFields, recordInspectorChange } from "./inspector-events.ts"

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
})
