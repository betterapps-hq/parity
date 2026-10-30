import type { ComponentSource, DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
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

  it("leaves out optional levels when the parents outside them are already there", () => {
    const menu = {
      "acme/Menu": source(),
      "acme/MenuContent": source({ parents: ["acme/Menu"] }),
      "acme/MenuGroup": source({ parents: ["acme/Menu", "acme/MenuContent"] }),
      "acme/MenuItem": source({
        parents: ["acme/Menu", "acme/MenuContent", "acme/MenuGroup"],
        optionalParents: ["acme/MenuGroup"]
      })
    }
    const item: DesignNode = { type: "component", id: "i", component: "acme/MenuItem" }
    expect(shape(withLibraryContext(item, menu, [], new Set(["i"])))).toEqual({
      Menu: [{ MenuContent: [{ MenuGroup: ["MenuItem"] }] }]
    })
    expect(withLibraryContext(item, menu, ["acme/Menu", "acme/MenuContent"], new Set(["i"]))).toBe(item)
    expect(shape(withLibraryContext(item, menu, ["acme/Menu"], new Set(["i"])))).toEqual({
      MenuContent: [{ MenuGroup: ["MenuItem"] }]
    })
  })

  it("brings the parts a part needs around it, in place of the first like it", () => {
    const table = {
      "acme/Table": source({
        sample: {
          children: [
            { component: "acme/TableHeader", children: [{ component: "acme/Column", children: ["Name"] }] },
            { component: "acme/TableBody" }
          ]
        }
      }),
      "acme/TableBody": source({ parents: ["acme/Table"], sample: { children: ["Rows"] } }),
      "acme/Row": source({ parents: ["acme/Table", "acme/TableBody"], parentParts: true })
    }
    const row: DesignNode = { type: "component", id: "r", component: "acme/Row" }
    expect(shape(withLibraryContext(row, table, [], new Set(["r"])))).toEqual({
      Table: [{ TableHeader: [{ Column: ["Name"] }] }, { TableBody: ["Row"] }]
    })
    // Without the flag, only the part.
    const { parentParts: _, ...plain } = table["acme/Row"]
    expect(shape(withLibraryContext(row, { ...table, "acme/Row": plain }, [], new Set(["r"])))).toEqual({
      Table: [{ TableBody: ["Row"] }]
    })
  })

  it("puts a part that needs what's around it into the outermost parent's whole sample", () => {
    const table = {
      "acme/Table": source({
        sample: {
          children: [
            { component: "acme/TableHeader", children: [{ component: "acme/Column", children: ["A"] }] },
            {
              component: "acme/TableBody",
              children: [
                { component: "acme/Row", children: [{ component: "acme/Cell", children: ["Ada"] }, "Lovelace"] }
              ]
            }
          ]
        }
      }),
      "acme/Cell": source({ parents: ["acme/Table", "acme/TableBody", "acme/Row"], parentParts: true })
    }
    const cell: DesignNode = { type: "component", id: "c", component: "acme/Cell" }
    expect(shape(withLibraryContext(cell, table, [], new Set(["c"])))).toEqual({
      Table: [{ TableHeader: [{ Column: ["A"] }] }, { TableBody: [{ Row: ["Cell", "Lovelace"] }] }]
    })
  })

  it("takes a sample's spelled-out children as written, and gives only bare ones their own sample's props", () => {
    const table = {
      "acme/Row": source({
        sample: { children: [{ component: "acme/Cell", children: ["Ada"] }, { component: "acme/Cell" }] }
      }),
      "acme/Cell": source({ sample: { props: { colSpan: 2 }, children: ["Wide"] } })
    }
    const row: DesignNode = { type: "component", id: "r", component: "acme/Row" }
    const placed = withLibraryContext(row, table, [], new Set(["r"]))
    const cells = placed.type === "component" ? (placed.slots?.children ?? []) : []
    expect(cells.map((cell) => (cell.type === "component" ? cell.props : null))).toEqual([undefined, { colSpan: 2 }])
  })

  it("keeps render functions as $render slots, and gives a part to a parent that calls its children", () => {
    const dates = {
      "acme/DateInput": source({
        sample: { children: [{ $render: [{ component: "acme/DateSegment" }], pass: ["segment"] }] }
      }),
      "acme/DateSegment": source({ parents: ["acme/DateInput"] }),
      "acme/Autocomplete": source({
        sample: { props: { renderInput: { $render: [{ component: "acme/TextField" }], spread: true }, open: true } }
      }),
      "acme/TextField": source()
    }
    const input = withLibraryContext(
      { type: "component", id: "d", component: "acme/DateInput" },
      dates,
      [],
      new Set(["d"])
    )
    expect(input.type === "component" && Object.keys(input.slots ?? {})).toEqual(["$render:children?pass=segment"])
    const segment = withLibraryContext(
      { type: "component", id: "s", component: "acme/DateSegment" },
      dates,
      [],
      new Set(["s"])
    )
    expect(segment.type === "component" && segment.slots?.["$render:children?pass=segment"]?.[0]?.id).toBe("s")
    const autocomplete = withLibraryContext(
      { type: "component", id: "a", component: "acme/Autocomplete" },
      dates,
      [],
      new Set(["a"])
    )
    expect(autocomplete.type === "component" && autocomplete.props).toEqual({ open: true })
    expect(autocomplete.type === "component" && shape(autocomplete.slots!["$renderWith:renderInput"]![0]!)).toBe(
      "TextField"
    )
  })

  it("puts elements given as a prop's value in a slot of that name", () => {
    const form = {
      "acme/FormControlLabel": source({
        sample: { props: { control: { $element: [{ component: "acme/Checkbox" }] }, label: "Remember me" } }
      }),
      "acme/Checkbox": source()
    }
    const placed = withLibraryContext(
      { type: "component", id: "f", component: "acme/FormControlLabel" },
      form,
      [],
      new Set(["f"])
    )
    expect(placed.type === "component" && placed.props).toEqual({ label: "Remember me" })
    expect(placed.type === "component" && shape(placed.slots!.control![0]!)).toBe("Checkbox")
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
