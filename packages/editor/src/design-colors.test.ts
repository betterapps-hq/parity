import type { DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { designColors } from "./design-colors.ts"

const page: DesignNode = {
  type: "layout",
  id: "page",
  style: { fills: [{ type: "solid", color: { value: "#ffffff" } }], color: { token: "foreground" } },
  children: [
    {
      type: "text",
      id: "title",
      text: "Plans",
      style: { color: { value: "#2563eb", alpha: { step: 50 } } }
    },
    {
      type: "layout",
      id: "card",
      style: {
        fills: [{ type: "solid", color: { value: "#2563EB" } }],
        borderColor: { value: "oklch(0.7 0.1 200)" },
        width: { value: "320px" }
      },
      children: [{ type: "text", id: "price", text: "$9", style: { color: { value: "#2563eb" } } }]
    }
  ]
}

describe("designColors", () => {
  it("lists the colors the layers write out, most used first, each once however it's written", () => {
    expect(designColors(page)).toEqual(["#2563eb", "#ffffff", "oklch(0.7 0.1 200)"])
  })

  it("leaves out color tokens and values that aren't colors", () => {
    expect(designColors(page)).not.toContain("foreground")
    expect(designColors(page)).not.toContain("320px")
  })

  it("lists no more than it's asked for", () => {
    expect(designColors(page, 1)).toEqual(["#2563eb"])
  })

  it("lists nothing for a design that writes no color out", () => {
    expect(designColors({ type: "text", id: "plain", text: "Plain" })).toEqual([])
  })
})
