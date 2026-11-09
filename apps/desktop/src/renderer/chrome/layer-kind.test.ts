import type { DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { iconName, isIconLayer, layerKind, unnamedIconLabel } from "./layer-kind.ts"

const designs = new Map([["plan-card", "Plan card"]])
const designName = (id: string) => designs.get(id)

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

describe("isIconLayer", () => {
  it("tells a component from an icon set apart from a library's other components and the project's own", () => {
    expect(isIconLayer({ type: "component", id: "l", component: "lucide/Check" }, libraries)).toBe(true)
    expect(isIconLayer({ type: "component", id: "h", component: "heroicons/16/solid/CogIcon" }, libraries)).toBe(true)
    expect(isIconLayer({ type: "component", id: "n", component: "nova/Card" }, libraries)).toBe(false)
    expect(isIconLayer({ type: "component", id: "c", component: "Button" }, libraries)).toBe(false)
  })

  it("matches a library by its whole id, so a set named like another isn't taken for it", () => {
    expect(isIconLayer({ type: "component", id: "x", component: "lucide-lab/Burger" }, libraries)).toBe(false)
  })
})

describe("an unnamed icon's label", () => {
  it("is the icon, without its set's path or a trailing Icon", () => {
    expect(iconName("lucide/Plus")).toBe("Plus")
    expect(iconName("heroicons/16/solid/CogIcon")).toBe("Cog")
    expect(iconName("lucide/Icon")).toBe("Icon")
  })

  it("is given only to an unnamed icon layer, so a named one and a library's other components keep theirs", () => {
    expect(unnamedIconLabel({ type: "component", id: "p", component: "lucide/Plus" }, libraries)).toBe("Plus")
    expect(
      unnamedIconLabel({ type: "component", id: "q", name: "Add", component: "lucide/Plus" }, libraries)
    ).toBeUndefined()
    expect(unnamedIconLabel({ type: "component", id: "n", component: "nova/Card" }, libraries)).toBeUndefined()
  })
})
