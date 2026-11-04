import type { ComponentInfo, ComponentSource, RenderNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { componentPreviewTree, previewFrameWidth, previewRootId } from "./component-preview.ts"

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
})
