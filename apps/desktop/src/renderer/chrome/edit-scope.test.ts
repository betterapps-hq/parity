import type { ContainerSpec } from "@parity/core"
import { describe, expect, it } from "vite-plus/test"
import { baseDesignNote } from "./edit-scope.ts"

const pricing: ContainerSpec = {
  id: "plan",
  name: "Plan card",
  kind: "component",
  position: { x: 0, y: 0 },
  params: {
    size: {
      type: "variant",
      options: [
        { id: "regular", name: "Regular" },
        { id: "large", name: "Large" }
      ]
    }
  },
  root: { type: "image", id: "photo", src: "/images/plan.png" },
  states: [
    { id: "default", name: "Default" },
    { id: "monthly", name: "Monthly" }
  ]
}

describe("the note above edits that change the design", () => {
  it("says nothing while edits change the design anyway", () => {
    expect(baseDesignNote(pricing, pricing.states[0]!, "File, alt text and fit")).toBeUndefined()
  })

  it("names the state being edited", () => {
    expect(baseDesignNote(pricing, pricing.states[1]!, "File, alt text and fit")).toBe(
      "File, alt text and fit change the design in every state, not only Monthly."
    )
  })

  it("names the variant the board shows", () => {
    const large = { ...pricing, view: { variants: { size: "large" } } }
    expect(baseDesignNote(large, large.states[0]!, "Its state, Reset all, Swap and Detach")).toBe(
      "Its state, Reset all, Swap and Detach change the design in every variant, not only Large."
    )
  })
})
