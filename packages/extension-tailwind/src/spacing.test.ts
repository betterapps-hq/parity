import { describe, expect, it } from "vite-plus/test"
import { withSpacingSteps } from "./spacing.ts"

describe("withSpacingSteps", () => {
  it("adds each step of the spacing scale, derived from --spacing, keeping one the theme defines", () => {
    const steps = withSpacingSteps([
      { name: "spacing", value: "0.25rem" },
      { name: "spacing-4", value: "1.125rem" }
    ])

    expect(steps.slice(0, 2)).toEqual([
      { name: "spacing", value: "0.25rem" },
      { name: "spacing-4", value: "1.125rem" }
    ])
    expect(steps.find(({ name }) => name === "spacing-0")).toEqual({
      name: "spacing-0",
      value: "0",
      derived: { from: "spacing", factor: 0 }
    })
    expect(steps.find(({ name }) => name === "spacing-0.5")).toEqual({
      name: "spacing-0.5",
      value: "calc(var(--spacing) * 0.5)",
      derived: { from: "spacing", factor: 0.5 }
    })
    expect(steps.filter(({ name }) => name === "spacing-4")).toHaveLength(1)
  })

  it("adds none to a theme without a spacing scale", () => {
    expect(withSpacingSteps([{ name: "color-red-500", value: "red" }])).toEqual([
      { name: "color-red-500", value: "red" }
    ])
  })
})
