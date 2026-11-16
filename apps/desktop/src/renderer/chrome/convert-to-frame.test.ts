import { type ContainerSpec, defaultModeSettings, resolveModes } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { droppedStatesLine, dropLines, frameDrops } from "./convert-to-frame.ts"

const modes = resolveModes(defaultModeSettings)

/** A component with a param and a variant, a second state, and a mode shown beside its main one. */
const planCard: ContainerSpec = {
  id: "plan-card",
  name: "Plan card",
  kind: "component",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "card", children: [{ type: "text", id: "price", text: "$12" }] },
  states: [
    { id: "default", name: "Monthly" },
    { id: "yearly", name: "Yearly", overrides: { price: { text: "$120" } } }
  ],
  params: {
    plan: { type: "text", default: "Pro" },
    seats: { type: "number", default: 3 },
    billing: { type: "text", default: "monthly" },
    tone: { type: "variant", options: [{ id: "plain", name: "Plain" }] }
  },
  view: { modes: [modes[1]!.id] }
}

const pricing: ContainerSpec = {
  id: "pricing",
  name: "Pricing",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "page",
    children: [
      { type: "instance", id: "a", design: "plan-card" },
      { type: "instance", id: "b", design: "plan-card" }
    ]
  }
}

describe("converting a screen or component to a frame", () => {
  it("lists what goes: states, previews, params and the instances that become plain layers", () => {
    const drops = frameDrops(planCard, [planCard, pricing], defaultModeSettings)
    expect(drops).toMatchObject({ kept: "Monthly", primary: modes[0]!.name, states: ["Yearly"] })
    expect(dropLines(drops)).toEqual([
      "1 state: Yearly",
      `1 preview beside it: ${modes[1]!.name}`,
      "4 params: plan, seats, billing and 1 more",
      "2 instances in Pricing, which become plain layers"
    ])
  })

  it("says nothing goes for a screen with no previews, so it converts without asking", () => {
    expect(dropLines(frameDrops(pricing, [planCard, pricing], defaultModeSettings))).toEqual([])
  })

  it("names a screen's instances of nothing, since only a component is placed", () => {
    expect(frameDrops(pricing, [pricing], defaultModeSettings).instances).toEqual([])
  })
})

describe("converting a component to a screen (PAR-1002)", () => {
  it("names the states it drops, since only a component has states", () => {
    expect(droppedStatesLine(["Yearly"])).toBe("Removed 1 state: Yearly")
    expect(droppedStatesLine(["Hover", "Pressed", "Disabled"])).toBe("Removed 3 states: Hover, Pressed and Disabled")
  })
})
