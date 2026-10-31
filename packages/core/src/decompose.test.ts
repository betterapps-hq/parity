import { describe, expect, it } from "vite-plus/test"
import { extractComponent, findRepeats } from "./decompose.ts"
import type { ContainerSpec, DesignNode, NodePatch } from "./document.ts"
import { findNode, mapNode } from "./edit.ts"
import { componentLibrary, resolveDesign } from "./render.ts"

const row = (key: string, name: string, role: string, variant: string, away = false): DesignNode => ({
  type: "component",
  id: `row-${key}`,
  component: "TableRow",
  slots: {
    children: [
      { type: "text", id: `${key}-name`, text: name, style: { weight: 500 } },
      { type: "component", id: `${key}-badge`, name: "Role", component: "Badge", props: { variant, children: role } },
      { type: "text", id: `${key}-away`, text: "Away", hidden: !away, responsive: { mobile: { hidden: true } } }
    ]
  }
})

const design: ContainerSpec = {
  id: "team",
  name: "Team",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "page",
    children: [
      { type: "text", id: "title", text: "Team" },
      {
        type: "component",
        id: "table",
        component: "TableBody",
        slots: {
          children: [
            row("a", "Avery", "Owner", "default"),
            row("j", "Jordan", "Admin", "secondary", true),
            row("s", "Sam", "Member", "outline")
          ]
        }
      }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "hidden-sam", name: "Without Sam", overrides: { "row-s": { hidden: true } } }
  ]
}

describe("findRepeats", () => {
  it("finds the rows and what differs between them", () => {
    const [candidate, ...rest] = findRepeats(design.root)
    expect(rest).toEqual([])
    expect(candidate).toMatchObject({ nodes: ["row-a", "row-j", "row-s"], size: 4, name: "TableRow item" })
    expect(candidate!.params).toEqual([
      { name: "text", type: "text", values: ["Avery", "Jordan", "Sam"] },
      { name: "roleVariant", type: "text", values: ["default", "secondary", "outline"] },
      { name: "role", type: "text", values: ["Owner", "Admin", "Member"] },
      { name: "showText", type: "boolean", values: [false, true, false] }
    ])
  })
})

describe("extractComponent", () => {
  const options = {
    id: "member-row",
    name: "Member row",
    position: { x: 0, y: -400 },
    viewports: ["desktop", "mobile"],
    library: componentLibrary([]),
    paramNames: { text: "name", showText: "away" }
  }

  it("replaces each occurrence with an instance and renders exactly the same", () => {
    const { component, design: extracted } = extractComponent(design, ["row-a", "row-j", "row-s"], options)
    expect(component).toMatchObject({
      kind: "component",
      params: { name: { type: "text", default: "Avery" }, away: { type: "boolean", default: false } }
    })
    expect(findNode(extracted.root, "row-j")).toEqual({
      type: "instance",
      id: "row-j",
      design: "member-row",
      args: { name: "Jordan", roleVariant: "secondary", role: "Admin", away: true }
    })
    // The Without Sam state still hides Sam's row, now an instance.
    const library = componentLibrary([component])
    const rendered = JSON.stringify(resolveDesign(extracted.root, extracted.states[1], "desktop", library))
    expect(rendered).not.toContain("Sam")
    expect(rendered).toContain('"nodeId":"row-j/')
  })

  it("refuses when a state changes something inside the part", () => {
    const changed: ContainerSpec = {
      ...design,
      states: [...design.states, { id: "renamed", name: "Renamed", overrides: { "a-name": { text: "Ava" } } }]
    }
    expect(() => extractComponent(changed, ["row-a", "row-j", "row-s"], options)).toThrow("Renamed state changes")
  })

  it("checks against the variant option the board shows", () => {
    const density = (overrides: Record<string, NodePatch>): ContainerSpec => ({
      ...design,
      params: {
        density: {
          type: "variant",
          options: [
            { id: "comfortable", name: "Comfortable" },
            { id: "compact", name: "Compact", overrides }
          ]
        }
      },
      view: { variants: { density: "compact" } }
    })
    // Compact changes Avery's badge, which the instance wouldn't carry, so the board would change.
    const badge = density({ "a-badge": { props: { variant: "outline" } } })
    expect(() => extractComponent(badge, ["row-a", "row-j", "row-s"], options)).toThrow(
      "Extracting would change how Team looks (Default, desktop)"
    )
    const comfortable = { ...badge, view: { variants: { density: "comfortable" } } }
    expect(() => extractComponent(comfortable, ["row-a", "row-j", "row-s"], options)).not.toThrow()
    // A change outside the part shows the same either way.
    const title = density({ title: { text: "People" } })
    expect(() => extractComponent(title, ["row-a", "row-j", "row-s"], options)).not.toThrow()
  })

  it("checks against the defaults of the params the design binds", () => {
    const bound: ContainerSpec = {
      ...design,
      params: { lead: { type: "text", default: "Ava" } },
      root: mapNode(design.root, "a-name", (node) => ({ ...node, bind: { text: "lead" } }))
    }
    // The board shows Ava from the param's default; the component would show the layer's own Avery.
    expect(() => extractComponent(bound, ["row-a"], { ...options, paramNames: {} })).toThrow(
      "Extracting would change how Team looks"
    )
  })

  it("extracts a single part with its texts as params", () => {
    const { component, design: extracted } = extractComponent(design, ["row-a"], { ...options, paramNames: {} })
    expect(Object.keys(component.params ?? {})).toEqual(["text", "role", "text2"])
    expect(findNode(extracted.root, "row-a")).toMatchObject({
      type: "instance",
      args: { text: "Avery", role: "Owner", text2: "Away" }
    })
  })
})
