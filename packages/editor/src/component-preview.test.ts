import type { ComponentInfo, ComponentSource, DesignNode, RenderNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { componentPreviewTree, drawnOpen, previewFrameWidth, previewRootId, previewValue } from "./component-preview.ts"

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
