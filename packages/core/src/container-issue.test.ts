import { describe, expect, it } from "vite-plus/test"
import { containerIssue, type ContainerSpec, containerSpec, type DesignNode, type LayoutNode } from "./document.ts"

const cta: DesignNode = {
  type: "instance",
  id: "cta",
  design: "button",
  slots: { label: [{ type: "text", id: "go", text: "Go" }] }
}

const card: LayoutNode = {
  type: "layout",
  id: "card",
  children: [{ type: "text", id: "title", text: "Hello" }, cta]
}

const rootChildren: DesignNode[] = [
  card,
  { type: "layout", id: "actions", slot: "actions", children: [] },
  {
    type: "component",
    id: "chart",
    component: "Chart",
    slots: { children: [{ type: "text", id: "caption", text: "Sales" }] },
    internals: [{ type: "layout", id: "bars", children: [] }]
  }
]

const base: ContainerSpec = {
  id: "home",
  name: "Home",
  kind: "component",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", children: rootChildren },
  states: [
    { id: "default", name: "Default" },
    { id: "hover", name: "Hover", overrides: { title: { text: "Hi" } } }
  ]
}

/** `base` with the root's children replaced; the layers `update` keeps stay the same objects. */
function withChildren(update: (children: DesignNode[]) => DesignNode[]): ContainerSpec {
  return { ...base, root: { type: "layout", id: "root", children: update(rootChildren) } }
}

/** `base` with the card's title replaced and the rest of its layers kept. */
function withTitle(title: DesignNode): ContainerSpec {
  return withChildren((children) => [{ ...card, children: [title, cta] }, ...children.slice(1)])
}

/** A value read from JSON, which may not be the layer its type says: how an invalid one reaches the check. */
function fromJson(text: string): DesignNode {
  return JSON.parse(text)
}

const changes = {
  "a renamed layer": withTitle({ type: "text", id: "title", text: "Hello", name: "Heading" }),
  "pasted layers": withChildren((children) => [
    ...children,
    { type: "layout", id: "pasted", children: [{ type: "text", id: "pasted-1", text: "One" }] }
  ]),
  "a layer moved": withChildren((children) => [children[1]!, children[0]!, children[2]!]),
  "a layer removed": withChildren((children) => [children[0]!, children[2]!]),
  "a design field": { ...base, name: "Home page" },
  "a style that isn't one": withTitle(
    fromJson('{ "type": "text", "id": "title", "text": "Hi", "style": { "width": {} } }')
  ),
  "a field no layer has": withTitle(fromJson('{ "type": "text", "id": "title", "text": "Hi", "colour": "red" }')),
  "a type no layer is": withTitle(fromJson('{ "type": "sticker", "id": "title" }')),
  "a layer that isn't an object": withTitle(fromJson('"title"')),
  "a new layer with a taken id": withChildren((children) => [
    ...children,
    { type: "text", id: "title", text: "Again" }
  ]),
  "the same layer twice": withChildren((children) => [...children, card]),
  "a second slot of the same name": withChildren((children) => [
    ...children,
    { type: "layout", id: "more", slot: "actions", children: [] }
  ]),
  "a slot name that can't be one": withChildren((children) => [
    ...children,
    { type: "layout", id: "more", slot: "className", children: [] }
  ]),
  "a state naming a removed layer": withChildren((children) => children.slice(1)),
  "a bad layer in a component's internals": withChildren((children) => [
    ...children.slice(0, 2),
    fromJson(
      '{ "type": "component", "id": "chart", "component": "Chart", "internals": [{ "type": "text", "id": "bar" }] }'
    )
  ]),
  "a bad layer in an instance's slot": withChildren((children) => [
    { ...card, children: [fromJson('{ "type": "instance", "id": "cta", "design": "b", "slots": { "label": [{}] } }')] },
    ...children.slice(1)
  ]),
  "states on a screen": { ...base, kind: "screen" },
  "a frame whose root isn't a layout": {
    ...base,
    kind: "frame",
    states: undefined,
    root: { type: "text", id: "root", text: "Frame" }
  }
} satisfies Record<string, ContainerSpec>

const valid = new Set(["a renamed layer", "pasted layers", "a layer moved", "a layer removed", "a design field"])

describe("containerIssue", () => {
  it("starts from a valid design", () => {
    expect(containerSpec.safeParse(base).success).toBe(true)
  })

  for (const [name, after] of Object.entries(changes)) {
    it(`reports ${name} as containerSpec does`, () => {
      const issue = containerIssue(after, base)
      expect(issue).toEqual(containerSpec.safeParse(after).error?.issues[0])
      expect(issue === undefined).toBe(valid.has(name))
    })
  }

  it("checks a whole design without a previous one", () => {
    expect(containerIssue(base)).toBeUndefined()
    expect(containerIssue(changes["a field no layer has"])).toBeDefined()
  })

  it("doesn't check again the layers kept from the previous design", () => {
    // A kept layer that was invalid all along isn't looked at, which is what makes a change cost only what it changed.
    const previous = withTitle(fromJson('{ "type": "text", "id": "title", "text": 1 }'))
    const after = { ...previous, name: "Renamed" }

    expect(containerSpec.safeParse(after).success).toBe(false)
    expect(containerIssue(after, previous)).toBeUndefined()
  })
})
