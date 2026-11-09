import {
  type ComponentInfo,
  componentLibrary,
  type ComponentSource,
  type ContainerSpec,
  type DesignNode,
  type ImageNode,
  findNode,
  nodeIds
} from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import type { InsertContext } from "./insert.ts"
import { designOfItem, designOfLayers, layersName } from "./new-screen.ts"

const text = (id: string, words = id): DesignNode => ({ type: "text", id, text: words })

const image = (id: string, alt?: string): DesignNode => {
  const node: ImageNode = { type: "image", id, src: `${id}.png` }

  if (alt) {
    node.alt = alt
  }

  return node
}

/** A badge component design, with a param its instances fill. */
const badge: ContainerSpec = {
  id: "badge",
  name: "Badge",
  kind: "component",
  position: { x: 0, y: 0 },
  params: { label: { type: "text", default: "New" } },
  root: {
    type: "layout",
    id: "badge-root",
    name: "Badge",
    children: [{ type: "text", id: "badge-label", text: "New", bind: { text: "label" } }]
  },
  states: [{ id: "default", name: "Default" }]
}

const context = (fields: Partial<InsertContext> = {}): InsertContext => ({
  sources: {},
  library: componentLibrary([badge]),
  ...fields
})

const designName = (id: string) => (id === "badge" ? "Badge" : undefined)

/** The layers a screen holds, in its root column. */
function inside(design: ContainerSpec): DesignNode[] {
  return design.root.type === "layout" ? design.root.children : []
}

describe("what a new screen is called", () => {
  it("names one layer as the Layers panel does", () => {
    expect(layersName([text("t", "Sign in to your account")])).toBe("Sign in to your account")
    expect(layersName([{ type: "layout", id: "l", name: "Hero", children: [] }])).toBe("Hero")
    expect(layersName([{ type: "layout", id: "l", children: [] }])).toBe("Column")
    expect(layersName([{ type: "layout", id: "l", style: { direction: "row" }, children: [] }])).toBe("Row")
    expect(layersName([image("photo", "A hill at dawn")])).toBe("A hill at dawn")
    expect(layersName([image("photo")])).toBe("Image")
  })

  it("names a component without its library, unless it has a name of its own", () => {
    expect(layersName([{ type: "component", id: "b", component: "nova/Button" }])).toBe("Button")
    expect(layersName([{ type: "component", id: "b", component: "nova/Button", name: "Save" }])).toBe("Save")
  })

  it("names an instance after its design, by its id when the design isn't known", () => {
    expect(layersName([{ type: "instance", id: "i", design: "badge" }], designName)).toBe("Badge")
    expect(layersName([{ type: "instance", id: "i", design: "gone" }], designName)).toBe("gone")
  })

  it("names several images Images, and several other layers after the first and how many more", () => {
    expect(layersName([image("a"), image("b")])).toBe("Images")
    expect(layersName([text("Headline"), text("Lede"), image("photo")])).toBe("Headline and 2 more")
  })

  it("is never Pasted", () => {
    expect(layersName([])).toBe("Untitled frame")
    expect(layersName([text("pasted", "Pasted text")])).not.toBe("Pasted")
  })
})

describe("layers with nothing to go into", () => {
  it("become a new frame there, named after them, laid out in a padded column that hugs them", () => {
    const design = designOfLayers([text("heading", "Welcome back")], ["form"], { x: 40, y: 60 })
    expect(design).toMatchObject({
      id: "welcome-back",
      name: "Welcome back",
      kind: "frame",
      position: { x: 40, y: 60 },
      root: {
        type: "layout",
        style: { padding: 6, gap: 4, width: "hug", background: "background", foreground: "foreground" }
      },
      states: [{ id: "default", name: "Default" }]
    })
    expect(design).not.toHaveProperty("size")
    expect(inside(design)).toMatchObject([{ type: "text", text: "Welcome back" }])
  })

  it("takes an id clear of the designs', and gives every layer a fresh one", () => {
    const design = designOfLayers([text("heading"), text("heading")], ["heading-and-1-more"], { x: 0, y: 0 })
    expect(design.id).toBe("heading-and-1-more-2")
    const ids = [...nodeIds(design.root)]
    expect(ids).toHaveLength(3)
    expect(ids).not.toContain("heading")
  })

  it("keeps no bindings, only the values the layers showed", () => {
    const bound: DesignNode = { type: "text", id: "title", text: "Card title", bind: { text: "title" } }
    const [pasted] = inside(designOfLayers([bound], [], { x: 0, y: 0 }))
    expect(pasted).toMatchObject({ text: "Card title" })
    expect(pasted).not.toHaveProperty("bind")
  })
})

describe("an item with nothing to go into", () => {
  it("makes a new frame there named after the component, holding it as inserting it would", () => {
    const button: ComponentInfo = {
      name: "Button",
      path: "src/components/ui/button.tsx",
      props: [{ name: "children", kind: "node", group: "own" }]
    }

    const { design, node } = designOfItem(
      { kind: "component", component: "nova/Button" },
      context({ info: button }),
      ["button"],
      { x: 300, y: -120 }
    )

    expect(design).toMatchObject({ id: "button-2", name: "Button", kind: "frame", position: { x: 300, y: -120 } })
    expect(inside(design)).toEqual([findNode(design.root, node)])
    expect(findNode(design.root, node)).toMatchObject({ component: "nova/Button", props: { children: "Button" } })
  })

  it("names a design's instance after the design, and an image after its alt text", () => {
    const instance = designOfItem({ kind: "instance", design: "badge" }, context(), [], { x: 0, y: 0 }, designName)
    expect(instance.design.name).toBe("Badge")
    expect(findNode(instance.design.root, instance.node)).toMatchObject({ type: "instance", design: "badge" })

    const picture = designOfItem(
      { kind: "image", src: "images/hill.png", alt: "A hill", width: 1600, height: 900 },
      context(),
      [],
      { x: 0, y: 0 }
    )

    expect(picture.design.name).toBe("A hill")
  })

  it("names a library part after itself, inside the parents it needs", () => {
    const source = (fields: Partial<ComponentSource>): ComponentSource => ({
      path: "@acme/ui",
      export: "x",
      library: "acme",
      ...fields
    })

    const sources = { "acme/Tabs": source({}), "acme/Tab": source({ parents: ["acme/Tabs"] }) }

    const { design, node } = designOfItem({ kind: "component", component: "acme/Tab" }, context({ sources }), [], {
      x: 0,
      y: 0
    })

    expect(design.name).toBe("Tab")
    expect(inside(design)).toMatchObject([{ type: "component", component: "acme/Tabs" }])
    expect(findNode(design.root, node)).toMatchObject({ component: "acme/Tab" })
  })
})
