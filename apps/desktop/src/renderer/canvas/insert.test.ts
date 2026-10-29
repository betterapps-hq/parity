import type { ComponentSource, DesignNode } from "@parity/core"
import { describe, expect, it } from "vitest"
import { withLibraryContext } from "./insert.ts"

const source = (fields: Partial<ComponentSource> = {}): ComponentSource => ({
  path: "@acme/ui",
  export: "x",
  library: "acme",
  ...fields
})

const sources: Record<string, ComponentSource> = {
  "acme/Accordion": source({
    sample: { children: [{ component: "acme/AccordionItem", children: [{ component: "acme/AccordionTrigger" }] }] }
  }),
  "acme/AccordionItem": source({ parents: ["acme/Accordion"], sample: { props: { value: "one" } } }),
  "acme/AccordionTrigger": source({ parents: ["acme/Accordion", "acme/AccordionItem"] })
}

/** The tree's shape: each component's name and its children's. */
function shape(node: DesignNode): unknown {
  if (node.type === "text") return node.text
  if (node.type !== "component") return node.type
  const children = node.slots?.children ?? []
  const name = node.component.split("/")[1]!
  return children.length > 0 ? { [name]: children.map(shape) } : name
}

const trigger: DesignNode = {
  type: "component",
  id: "t",
  component: "acme/AccordionTrigger",
  props: { children: "Trigger" }
}

describe("inserting a library part", () => {
  it("places it inside the parents it needs, with their sample props", () => {
    const placed = withLibraryContext(trigger, sources, [], new Set(["t"]))
    expect(shape(placed)).toEqual({ Accordion: [{ AccordionItem: ["AccordionTrigger"] }] })
    const item = placed.type === "component" ? placed.slots?.children?.[0] : undefined
    expect(item?.type === "component" && item.props).toEqual({ value: "one" })
  })

  it("adds only the parents that aren't around the drop target already", () => {
    const placed = withLibraryContext(trigger, sources, ["acme/Accordion", "acme/AccordionItem"], new Set(["t"]))
    expect(placed).toBe(trigger)
    expect(shape(withLibraryContext(trigger, sources, ["acme/Accordion"], new Set(["t"])))).toEqual({
      AccordionItem: ["AccordionTrigger"]
    })
  })

  it("gives a family's root its sample children instead of a text label", () => {
    const root: DesignNode = {
      type: "component",
      id: "a",
      component: "acme/Accordion",
      props: { children: "Accordion" }
    }
    const placed = withLibraryContext(root, sources, [], new Set(["a"]))
    expect(shape(placed)).toEqual({ Accordion: [{ AccordionItem: ["AccordionTrigger"] }] })
    expect(placed.type === "component" && placed.props).toBeFalsy()
  })
})
