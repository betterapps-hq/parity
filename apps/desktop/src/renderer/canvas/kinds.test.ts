import type { DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { chipFor, kindColors, nodeColor, textFor } from "./kinds.tsx"

// Text layers have a color of their own (PAR-792), so they stand out among a design's layers.
describe("a text layer's color", () => {
  const text = { type: "text", id: "title", text: "Pricing" } satisfies DesignNode
  const layout = { type: "layout", id: "card", children: [text] } satisfies DesignNode

  it("is green, apart from the layout around it", () => {
    expect(nodeColor(text)).toBe(kindColors.text)
    expect(nodeColor(layout)).toBe(kindColors.layer)
  })

  it("has its own chip and its own step for text on a panel", () => {
    expect(chipFor(kindColors.text)).toEqual({ background: "var(--canvas-text-chip)", color: "white" })
    expect(textFor(kindColors.text)).toBe("var(--canvas-text-text)")
  })
})
