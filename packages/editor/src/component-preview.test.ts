import type { ComponentInfo, ComponentSource, DesignNode, RenderNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  componentPreviewTree,
  componentUses,
  drawnOpen,
  missingProps,
  previewFrameWidth,
  previewProblem,
  previewRootId,
  previewValue,
  previewVariants
} from "./component-preview.ts"

const takesChildren = { props: [{ name: "children", kind: "node" }] } as unknown as ComponentInfo

const sources: Record<string, ComponentSource> = {
  "acme/Tabs": { path: "@acme/ui", export: "Tabs", library: "acme" },
  "acme/TabsList": { path: "@acme/ui", export: "TabsList", library: "acme", parents: ["acme/Tabs"] },
  "acme/TabsTrigger": {
    path: "@acme/ui",
    export: "TabsTrigger",
    library: "acme",
    parents: ["acme/Tabs", "acme/TabsList"]
  },
  Badge: { path: "src/Badge.tsx", export: "Badge" }
}

const context = { sources, library: new Map(), viewport: "desktop" }

/** The components a tree draws, outermost first. */
function components(tree: RenderNode[]): string[] {
  return tree.flatMap((node) => {
    if (node.kind === "component") return [node.component, ...Object.values(node.slots).flatMap(components)]
    return node.kind === "element" ? components(node.children) : []
  })
}

describe("componentPreviewTree", () => {
  it("draws what inserting places, inside an element sized to it with room around", () => {
    const [root] = componentPreviewTree("Badge", { ...context, info: takesChildren })
    expect(root).toMatchObject({
      kind: "element",
      nodeId: previewRootId,
      style: { width: "max-content", maxWidth: `${previewFrameWidth}px`, padding: "8px" }
    })
    expect(root?.kind === "element" && root.children).toEqual([
      expect.objectContaining({ kind: "component", component: "Badge", props: { children: "Badge" } })
    ])
  })

  it("puts a library part inside the parents it needs", () => {
    expect(components(componentPreviewTree("acme/TabsTrigger", context))).toEqual([
      "acme/Tabs",
      "acme/TabsList",
      "acme/TabsTrigger"
    ])
  })

  it("is the same tree each time, so its preview key is too", () => {
    expect(componentPreviewTree("acme/TabsTrigger", context)).toEqual(componentPreviewTree("acme/TabsTrigger", context))
  })

  it("draws a part of what opens with its parents open", () => {
    const [root] = componentPreviewTree("acme/DialogTitle", { ...context, sources: openSources })
    expect(root?.kind === "element" && root.children).toEqual([
      expect.objectContaining({ component: "acme/Dialog", props: { defaultOpen: true } })
    ])
  })
})

const library = (name: string, more: Partial<ComponentSource> = {}): ComponentSource => ({
  path: "@acme/ui",
  export: name,
  library: "acme",
  ...more
})

const openSources: Record<string, ComponentSource> = {
  "acme/Dialog": library("Dialog", { openProps: ["defaultOpen"] }),
  "acme/DialogTitle": library("DialogTitle", { parents: ["acme/Dialog"] }),
  "acme/Menubar": library("Menubar"),
  "acme/MenubarMenu": library("MenubarMenu", { openProps: ["defaultOpen"] }),
  "acme/MenubarSub": library("MenubarSub", { openProps: ["defaultOpen"] }),
  "acme/Accordion": library("Accordion", { openProps: ["defaultValue", "value"] }),
  "acme/AccordionItem": library("AccordionItem", { openProps: ["value"] }),
  "acme/AccordionContent": library("AccordionContent")
}

/** A component layer, with an id from its name. */
function layer(component: string, props?: Record<string, unknown>, children: DesignNode[] = []): DesignNode {
  return {
    type: "component",
    id: component,
    component: `acme/${component}`,
    ...(props ? { props } : {}),
    ...(children.length > 0 ? { slots: { children } } : {})
  }
}

/** Each component's props in a tree, by its id, for the ones given any. */
function propsOf(node: DesignNode): Record<string, unknown> {
  if (node.type !== "component") return {}
  const inside = Object.values(node.slots ?? {}).flat()
  return Object.assign(node.props ? { [node.id]: node.props } : {}, ...inside.map(propsOf)) as Record<string, unknown>
}

describe("drawnOpen", () => {
  it("opens the first that opens and the first inside it, not the ones beside them", () => {
    const menu = (id: string) => ({ ...layer("MenubarMenu", {}, [{ ...layer("MenubarSub"), id: `${id}-sub` }]), id })
    const tree = layer("Menubar", undefined, [menu("file"), menu("edit")])
    expect(propsOf(drawnOpen(tree, openSources))).toEqual({
      file: { defaultOpen: true },
      "file-sub": { defaultOpen: true },
      edit: {}
    })
  })

  it("leaves one given open or closed as it is, and opens the next", () => {
    const tree = layer("Menubar", undefined, [
      { ...layer("MenubarMenu", { open: false }), id: "closed" },
      { ...layer("MenubarMenu"), id: "next" }
    ])
    expect(propsOf(drawnOpen(tree, openSources))).toEqual({ closed: { open: false }, next: { defaultOpen: true } })
  })

  it("chooses an item a sample chooses none of, beside the ones it chooses as a list", () => {
    const tree = layer("Accordion", { defaultValue: ["billing"] }, [layer("AccordionItem", { value: "faq" })])
    expect(propsOf(drawnOpen(tree, openSources))).toEqual({
      Accordion: { defaultValue: ["billing", "faq"] },
      AccordionItem: { value: "faq" }
    })
  })

  it("gives an item with no value one to be chosen by, as a single value when none is chosen", () => {
    const tree = layer("Accordion", undefined, [layer("AccordionItem", undefined, [layer("AccordionContent")])])
    expect(propsOf(drawnOpen(tree, openSources))).toEqual({
      Accordion: { defaultValue: previewValue },
      AccordionItem: { value: previewValue }
    })
  })

  it("leaves a sample that chooses one of its items, or is given its value, as it is", () => {
    const items = [layer("AccordionItem", { value: "a" }), { ...layer("AccordionItem", { value: "b" }), id: "second" }]
    const chooses = layer("Accordion", { defaultValue: "b" }, items)
    expect(drawnOpen(chooses, openSources)).toEqual(chooses)
    const given = layer("Accordion", { value: "c" }, items)
    expect(drawnOpen(given, openSources)).toEqual(given)
  })

  it("changes nothing for components that don't say what's open", () => {
    const tree = layer("Card", { title: "Plan" }, [layer("Badge")])
    expect(drawnOpen(tree, openSources)).toEqual(tree)
  })
})

/** The props a tree gives the first layer of a component, outermost first. */
function drawnProps(tree: RenderNode[], component: string): Record<string, unknown> | undefined {
  for (const node of tree) {
    if (node.kind === "component" && node.component === component) return node.props
    let inside: RenderNode[] = []
    if (node.kind === "component") inside = Object.values(node.slots).flat()
    else if (node.kind === "element") inside = node.children
    const within = drawnProps(inside, component)
    if (within) return within
  }
  return undefined
}

const prop = (name: string, more: object = {}) => ({ name, kind: "string", group: "own", ...more })
const infoOf = (...props: object[]) => ({ name: "Badge", path: "src/Badge.tsx", props }) as unknown as ComponentInfo

describe("a variant's preview", () => {
  it("lays its props over the component's own, on the component inside the parents a part needs", () => {
    const tree = componentPreviewTree("acme/TabsTrigger", { ...context, props: { variant: "line" } })
    expect(drawnProps(tree, "acme/TabsTrigger")).toMatchObject({ variant: "line" })
    expect(drawnProps(tree, "acme/Tabs")).not.toHaveProperty("variant")
  })

  it("keeps the sample's other props and replaces the one it sets", () => {
    const [root] = componentPreviewTree("Badge", { ...context, info: takesChildren, props: { children: "New" } })
    expect(root?.kind === "element" && root.children[0]).toMatchObject({ props: { children: "New" } })
  })
})

describe("previewVariants", () => {
  it("shows a style variant before an own prop with options", () => {
    const info = infoOf(
      prop("size", { kind: "enum", options: ["sm", "lg"] }),
      prop("variant", { kind: "enum", group: "variant", options: ["default", "outline", "ghost"] })
    )
    expect(previewVariants(info)).toEqual({ prop: "variant", options: ["default", "outline", "ghost"] })
  })

  it("falls back to an own prop, and needs more than one option", () => {
    const info = infoOf(
      prop("tone", { kind: "enum", group: "variant", options: ["only"] }),
      prop("size", { kind: "enum", options: ["sm", "lg"] })
    )
    expect(previewVariants(info)).toEqual({ prop: "size", options: ["sm", "lg"] })
  })

  it("is none for a component without choices, or an attribute's", () => {
    expect(previewVariants(infoOf(prop("label")))).toBeUndefined()
    expect(
      previewVariants(infoOf(prop("dir", { kind: "enum", group: "html", options: ["ltr", "rtl"] })))
    ).toBeUndefined()
    expect(previewVariants(undefined)).toBeUndefined()
  })
})

describe("missingProps", () => {
  it("lists required props inserting can't fill, leaving out handlers", () => {
    const info = infoOf(
      prop("children", { kind: "node" }),
      prop("items", { kind: "object", required: true }),
      prop("src", { required: true }),
      prop("onSelect", { kind: "function", required: true }),
      prop("alt")
    )
    expect(missingProps("Badge", info, sources)).toEqual(["items"])
  })

  it("counts children the sample places as given", () => {
    const info = infoOf(prop("children", { kind: "node", required: true }))
    expect(missingProps("Badge", info, sources)).toEqual([])
  })
})

describe("previewProblem", () => {
  it("names a provider or server code from the error, before missing props", () => {
    expect(previewProblem({ error: "useRouter must be used within a RouterProvider" }, ["src"])).toBe("needs-provider")
    expect(previewProblem({ error: "process is not defined" }, [])).toBe("server-only")
    expect(previewProblem({ error: "async Client Component" }, [])).toBe("server-only")
  })

  it("says it needs props when it's missing some, and otherwise that it failed or drew nothing", () => {
    expect(previewProblem({ error: "Cannot read properties of undefined (reading 'map')" }, ["items"])).toBe(
      "needs-props"
    )
    expect(previewProblem({ empty: true }, ["items"])).toBe("needs-props")
    expect(previewProblem({ error: "Boom" }, [])).toBe("failed")
    expect(previewProblem({ empty: true }, [])).toBe("draws-nothing")
  })
})

describe("componentUses", () => {
  it("counts each component's layers across designs, in slots too", () => {
    const card = layer("Card", {}, [layer("Badge"), layer("Badge")])
    expect(componentUses([card, layer("Badge")])).toEqual(
      new Map([
        ["acme/Card", 1],
        ["acme/Badge", 3]
      ])
    )
  })
})
