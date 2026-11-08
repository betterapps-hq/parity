import type { DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { layerKind } from "./layer-kind.ts"

const designs: Record<string, string> = { "plan-card": "Plan card" }
const designName = (id: string) => designs[id]
const libraries = [
  { id: "nova", name: "Shadcn Nova", kind: "components" as const },
  { id: "lucide", name: "Lucide", kind: "icons" as const },
  { id: "heroicons", name: "Heroicons", kind: "icons" as const }
]
const kind = (node: DesignNode) => layerKind(node, designName, libraries)

describe("layerKind", () => {
  it("says a text layer is text, whatever its tag", () => {
    expect(kind({ type: "text", id: "t", text: "Plans that grow", tag: "h1" })).toEqual({
      label: "Text",
      description: "Text"
    })
  })

  it("names a layout by its direction, as the insert picker does, and a grid as a grid", () => {
    expect(kind({ type: "layout", id: "a", children: [] }).label).toBe("Vertical layout")
    expect(kind({ type: "layout", id: "b", style: { direction: "row" }, children: [] }).label).toBe("Horizontal layout")
    expect(kind({ type: "layout", id: "c", style: { display: "grid", direction: "row" }, children: [] }).label).toBe(
      "Grid layout"
    )
  })

  it("calls a layout that's a slot a slot, with its name and direction in full", () => {
    expect(kind({ type: "layout", id: "s", slot: "features", children: [] })).toEqual({
      label: "Slot",
      description: "The features slot, a vertical layout"
    })
  })

  it("says which component an instance is of only in full, so the label never repeats the layer's name", () => {
    expect(kind({ type: "instance", id: "i", name: "Pro plan", design: "plan-card" })).toEqual({
      label: "Instance",
      description: "Instance of Plan card"
    })
    expect(kind({ type: "instance", id: "j", design: "deleted-card" }).description).toBe("Instance of deleted-card")
  })

  it("names a library's component and icon without the library's prefix, by the library they come from", () => {
    expect(kind({ type: "component", id: "c", component: "Button" })).toEqual({
      label: "Component",
      description: "Button component"
    })
    expect(kind({ type: "component", id: "n", component: "nova/Card" })).toEqual({
      label: "Component",
      description: "Card component from Shadcn Nova"
    })
    expect(kind({ type: "component", id: "l", component: "lucide/Check" })).toEqual({
      label: "Icon",
      description: "Check icon from Lucide"
    })
    expect(kind({ type: "component", id: "h", component: "heroicons/16/solid/CogIcon" }).description).toBe(
      "Cog icon from Heroicons"
    )
  })
})
