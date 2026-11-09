import { describe, expect, it } from "vite-plus/test"
import type { DesignNode } from "./document.ts"
import { componentNode, librarySource, withLibraryContext } from "./library-insert.ts"
import type { ComponentSource } from "./project.ts"
import type { ComponentInfo } from "./props.ts"

const takesChildren: Pick<ComponentInfo, "props"> = { props: [{ name: "children", kind: "node", group: "own" }] }

describe("inserting a library part", () => {
  it("gives a part with children its name as text, unless its sample says it has none", () => {
    const sources = {
      "acme/Button": { path: "@acme/ui", export: "Button", library: "acme", declaration: "" },
      "acme/Cascader": {
        path: "@acme/ui",
        export: "Cascader",
        library: "acme",
        declaration: "",
        sample: { props: { placeholder: "Pick one" }, children: [] }
      }
    }

    const taken = new Set<string>()
    const button = withLibraryContext(componentNode("acme/Button", takesChildren, taken), sources, [], taken)
    expect(button.type === "component" && button.props).toEqual({ children: "Button" })
    const cascader = withLibraryContext(componentNode("acme/Cascader", takesChildren, taken), sources, [], taken)
    expect(cascader.type === "component" && cascader.props).toEqual({ placeholder: "Pick one" })
    expect(cascader.type === "component" && cascader.slots).toBeUndefined()
  })

  it("gives no name to a component that sets its own size, where it would be cut off (PAR-518)", () => {
    const avatar = componentNode("Avatar", { ...takesChildren, fixedSize: true }, new Set())
    expect(avatar.type === "component" && avatar.props).toBeFalsy()
    // Text given on purpose still goes in.
    const given = componentNode("Avatar", { ...takesChildren, fixedSize: true }, new Set(), { children: "AB" })
    expect(given.type === "component" && given.props).toEqual({ children: "AB" })
  })

  it("leaves the name out of a part whose sample gives it no children, as a Separator's (PAR-518)", () => {
    const sources = { "acme/Separator": source({ sample: { props: { orientation: "vertical" } } }) }
    const taken = new Set<string>()
    const placed = withLibraryContext(componentNode("acme/Separator", takesChildren, taken), sources, [], taken)
    expect(placed.type === "component" && placed.props).toEqual({ orientation: "vertical" })
  })

  it("gives a part without a sample the children its library's other samples give it, else its name (PAR-518)", () => {
    const sources = {
      "acme/Marker": source({
        sample: {
          children: [
            { component: "acme/MarkerIcon", children: [] },
            { component: "acme/MarkerContent", children: ["Running tests"] }
          ]
        }
      }),
      "acme/MarkerIcon": source({ parents: ["acme/Marker"] }),
      "acme/MarkerContent": source({ parents: ["acme/Marker"] }),
      "acme/Group": source({ sample: { props: { trigger: { $element: [{ component: "acme/GroupCount" }] } } } }),
      "acme/GroupCount": source(),
      "acme/Badge": source(),
      // Another library's sample says nothing about acme's parts.
      "other/Panel": source({ library: "other", sample: { children: [{ component: "acme/Badge", children: [] }] } })
    }

    const taken = new Set<string>()
    const insert = (name: string) => withLibraryContext(componentNode(name, takesChildren, taken), sources, [], taken)
    const inside = (node: DesignNode) => (node.type === "component" ? node.slots?.children?.[0] : undefined)
    // An icon's box, given elements the sample can't show, holds nothing.
    const icon = inside(insert("acme/MarkerIcon"))
    expect(icon?.type === "component" && [icon.component, icon.props, icon.slots]).toEqual([
      "acme/MarkerIcon",
      undefined,
      undefined
    ])
    const content = inside(insert("acme/MarkerContent"))
    expect(content?.type === "component" && content.slots?.children?.map(outline)).toEqual(["Running tests"])
    // Used without children, in a prop's elements.
    const count = insert("acme/GroupCount")
    expect(count.type === "component" && [count.props, count.slots]).toEqual([undefined, undefined])
    // Used nowhere in its library: its name.
    const badge = insert("acme/Badge")
    expect(badge.type === "component" && badge.props).toEqual({ children: "Badge" })
  })

  it("takes the text a sample gives as a prop over the name, but not over text set on purpose", () => {
    const sources = {
      "acme/Highlight": {
        path: "@acme/ui",
        export: "Highlight",
        library: "acme",
        declaration: "",
        sample: { props: { children: "Spotlight bulb" } }
      }
    }

    const taken = new Set<string>()
    const named = withLibraryContext(componentNode("acme/Highlight", takesChildren, taken), sources, [], taken)
    expect(named.type === "component" && named.props).toEqual({ children: "Spotlight bulb" })
    const node = { type: "component" as const, id: "mine", component: "acme/Highlight", props: { children: "Mine" } }
    const written = withLibraryContext(node, sources, [], taken)
    expect(written.type === "component" && written.props).toEqual({ children: "Mine" })

    const same = {
      type: "component" as const,
      id: "same",
      component: "acme/Highlight",
      props: { children: "Highlight" }
    }

    const kept = withLibraryContext(same, sources, [], taken)
    expect(kept.type === "component" && kept.props).toEqual({ children: "Highlight" })
    // Text given to componentNode is kept, not labelled over, even when it's the part's name.
    const given = componentNode("acme/Highlight", takesChildren, taken, { children: "Highlight" })
    const placed = withLibraryContext(given, sources, [], taken)
    expect(placed.type === "component" && placed.props).toEqual({ children: "Highlight" })
  })
})

const source = (fields: Partial<ComponentSource> = {}): ComponentSource => ({
  path: "@acme/ui",
  export: "x",
  library: "acme",
  ...fields
})

const accordion = {
  "acme/Accordion": source({
    sample: { children: [{ component: "acme/AccordionItem", children: [{ component: "acme/AccordionTrigger" }] }] }
  }),
  "acme/AccordionItem": source({ parents: ["acme/Accordion"], sample: { props: { value: "one" } } }),
  "acme/AccordionTrigger": source({ parents: ["acme/Accordion", "acme/AccordionItem"] })
} satisfies Record<string, ComponentSource>

/** A tree in outline: text as itself, and each component by name, with its children's outlines when it has any. */
type Outline = string | { [component: string]: Outline[] }

/** The tree in outline: each component's name and its children's. */
function outline(node: DesignNode): Outline {
  if (node.type === "text") {
    return node.text
  }

  if (node.type !== "component") {
    return node.type
  }

  const children = node.slots?.children ?? []
  const name = node.component.split("/")[1]!

  return children.length > 0 ? { [name]: children.map(outline) } : name
}

const trigger: DesignNode = {
  type: "component",
  id: "t",
  component: "acme/AccordionTrigger",
  props: { children: "Trigger" }
}

describe("a library part's parents and samples", () => {
  it("places it inside the parents it needs, with their sample props", () => {
    const placed = withLibraryContext(trigger, accordion, [], new Set(["t"]))
    expect(outline(placed)).toEqual({ Accordion: [{ AccordionItem: ["AccordionTrigger"] }] })
    const item = placed.type === "component" ? placed.slots?.children?.[0] : undefined
    expect(item?.type === "component" && item.props).toEqual({ value: "one" })
  })

  it("adds only the parents that aren't around the drop target already", () => {
    const placed = withLibraryContext(trigger, accordion, ["acme/Accordion", "acme/AccordionItem"], new Set(["t"]))
    expect(placed).toBe(trigger)
    expect(outline(withLibraryContext(trigger, accordion, ["acme/Accordion"], new Set(["t"])))).toEqual({
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
    expect(outline(withLibraryContext(item, menu, [], new Set(["i"])))).toEqual({
      Menu: [{ MenuContent: [{ MenuGroup: ["MenuItem"] }] }]
    })
    expect(withLibraryContext(item, menu, ["acme/Menu", "acme/MenuContent"], new Set(["i"]))).toBe(item)
    expect(outline(withLibraryContext(item, menu, ["acme/Menu"], new Set(["i"])))).toEqual({
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
    expect(outline(withLibraryContext(row, table, [], new Set(["r"])))).toEqual({
      Table: [{ TableHeader: [{ Column: ["Name"] }] }, { TableBody: ["Row"] }]
    })
    // Without the flag, only the part.
    const { parentParts: _, ...plain } = table["acme/Row"]
    expect(outline(withLibraryContext(row, { ...table, "acme/Row": plain }, [], new Set(["r"])))).toEqual({
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
    expect(outline(withLibraryContext(cell, table, [], new Set(["c"])))).toEqual({
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

  it("gives a part to a parent's render prop, keeping the parent's other slots", () => {
    const tree = {
      "acme/Node": source({
        sample: {
          props: {
            render: { $render: [{ component: "acme/Branch" }] },
            indentGuide: { $element: [{ component: "acme/Guide" }] }
          }
        }
      }),
      "acme/Item": source({ parents: ["acme/Node"] })
    }

    const item: DesignNode = { type: "component", id: "i", component: "acme/Item" }
    const placed = withLibraryContext(item, tree, [], new Set(["i"]))
    const slots = placed.type === "component" ? placed.slots : undefined
    expect(Object.keys(slots ?? {}).sort()).toEqual(["$render:render", "indentGuide"])
    expect(slots?.["$render:render"]?.map(outline)).toEqual(["Item"])
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
    expect(autocomplete.type === "component" && outline(autocomplete.slots!["$renderWith:renderInput"]![0]!)).toBe(
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
    expect(placed.type === "component" && outline(placed.slots!.control![0]!)).toBe("Checkbox")
  })

  it("gives a family's root its sample children instead of a text label", () => {
    const root: DesignNode = {
      type: "component",
      id: "a",
      component: "acme/Accordion",
      props: { children: "Accordion" }
    }

    const placed = withLibraryContext(root, accordion, [], new Set(["a"]))
    expect(outline(placed)).toEqual({ Accordion: [{ AccordionItem: ["AccordionTrigger"] }] })
    expect(placed.type === "component" && placed.props).toBeFalsy()
  })
})

describe("librarySource", () => {
  it("names the props it declares that say what's open or chosen, for its preview", () => {
    const declares = (props: Record<string, string>) =>
      librarySource("acme", "Part", { as: "function", props }, "@acme/ui").openProps

    expect(declares({ "defaultOpen?": "1", "open?": "1", "className?": "2" })).toEqual(["defaultOpen"])
    expect(declares({ "defaultValue?": "3", "value?": "3" })).toEqual(["defaultValue", "value"])
    expect(declares({ value: "3" })).toEqual(["value"])
    expect(declares({ "className?": "2" })).toBeUndefined()
  })
})
