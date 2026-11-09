import type { ComponentInfo, ComponentSource, DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { componentComposition, componentExample } from "./composition.ts"

const nova = (name: string, more: Partial<ComponentSource> = {}): ComponentSource => ({
  path: "@buildkit/nova",
  export: name,
  library: "nova",
  ...more
})

/** Nova's sidebar, as its library file describes it. */
const sources = {
  "nova/SidebarProvider": nova("SidebarProvider", {
    visual: false,
    sample: { children: [{ component: "nova/Sidebar" }] }
  }),
  "nova/Sidebar": nova("Sidebar", {
    parents: ["nova/SidebarProvider"],
    parentsFrom: "example",
    sample: { children: [{ component: "nova/SidebarContent" }] }
  }),
  "nova/SidebarContent": nova("SidebarContent", {
    parents: ["nova/SidebarProvider", "nova/Sidebar"],
    parentsFrom: "example"
  }),
  "nova/SidebarInset": nova("SidebarInset", { parents: ["nova/SidebarProvider"], parentsFrom: "example" }),
  "nova/DropdownMenuItem": nova("DropdownMenuItem", {
    parents: ["nova/DropdownMenu", "nova/DropdownMenuContent", "nova/DropdownMenuGroup"],
    optionalParents: ["nova/DropdownMenuGroup"],
    parentsFrom: "example"
  }),
  "nova/Field": nova("Field", {
    sample: { props: { render: { $render: [{ component: "nova/Input" }], spread: true } } }
  }),
  "nova/Input": nova("Input", { sample: { children: [] } }),
  "nova/Tooltip": nova("Tooltip", { sample: { props: { content: { $element: ["Saved"] } } } }),
  Badge: { path: "src/Badge.tsx", export: "Badge" },
  Account: { path: "src/Account.tsx", export: "Account" }
} satisfies Record<string, ComponentSource>

const props = {
  Badge: {
    name: "Badge",
    path: "src/Badge.tsx",
    props: [
      { name: "children", kind: "node", group: "own" },
      { name: "icon", kind: "node", group: "own" },
      { name: "tone", kind: "enum", options: ["neutral", "info"], group: "variant" }
    ]
  }
} satisfies Record<string, ComponentInfo>

const context = { sources, props }

/** The components an example holds, outermost first. */
function components(node: DesignNode): string[] {
  if (node.type !== "component") {
    return []
  }

  return [node.component, ...Object.values(node.slots ?? {}).flatMap((nodes) => nodes.flatMap(components))]
}

describe("componentComposition", () => {
  it("tells an agent a sidebar needs its provider before it inserts one", () => {
    const sidebar = componentComposition("nova/Sidebar", context)
    expect(sidebar.parents).toEqual({
      status: "listed",
      chain: [{ component: "nova/SidebarProvider" }],
      from: "example"
    })
    expect(components(sidebar.example.node)).toEqual(["nova/SidebarProvider", "nova/Sidebar", "nova/SidebarContent"])
  })

  it("tells a provider that draws nothing from a wrapper that draws, and both from an ordinary component", () => {
    expect(componentComposition("nova/SidebarProvider", context)).toMatchObject({
      role: "provider",
      holds: ["nova/Sidebar", "nova/SidebarInset"]
    })
    expect(componentComposition("nova/Sidebar", context)).toMatchObject({
      role: "wrapper",
      holds: ["nova/SidebarContent"]
    })
    expect(componentComposition("nova/SidebarContent", context)).toMatchObject({ role: "component", holds: [] })
  })

  it("marks the parents a part goes without when the ones outside them are there", () => {
    expect(componentComposition("nova/DropdownMenuItem", context).parents).toEqual({
      status: "listed",
      chain: [
        { component: "nova/DropdownMenu" },
        { component: "nova/DropdownMenuContent" },
        { component: "nova/DropdownMenuGroup", optional: true }
      ],
      from: "example"
    })
  })

  it("says a library part with no parents listed needs none, and a project component's are unknown", () => {
    expect(componentComposition("nova/Input", context).parents).toEqual({ status: "none" })
    expect(componentComposition("Account", context).parents).toMatchObject({ status: "unknown" })
  })

  it("learns a project component needs nothing around it once it has drawn on its own", () => {
    const drawn = { ...context, renderStatus: { Account: { drawn: true as const } } }
    expect(componentComposition("Account", drawn)).toMatchObject({
      parents: { status: "none" },
      example: { status: "drawn" }
    })
  })

  it("reports a provider no library names as unknown, with the error that says so", () => {
    const error = "useSession must be used within a SessionProvider."
    const failing = { ...context, renderStatus: { Account: { error } } }
    const account = componentComposition("Account", failing)
    expect(account.parents).toEqual({ status: "unknown", reason: expect.stringContaining(error) })
    expect(account.example).toMatchObject({ status: "failing", reason: expect.stringContaining("Needs a provider") })
  })

  it("leaves an example untried until the component has drawn", () => {
    expect(componentComposition("nova/Sidebar", context).example.status).toBe("untried")
  })

  it("lists children and element props from the component's props", () => {
    expect(componentComposition("Badge", context).slots).toEqual([
      { name: "children", key: "children", kind: "children" },
      { name: "icon", key: "icon", kind: "element" }
    ])
  })

  it("lists a sample's render functions and elements by the key a node holds them under", () => {
    expect(componentComposition("nova/Field", context).slots).toEqual([
      { name: "render", key: "$renderWith:render", kind: "render" }
    ])
    expect(componentComposition("nova/Tooltip", context).slots).toEqual([
      { name: "content", key: "content", kind: "element" }
    ])
  })

  it("takes a library part's children from its sample, but not an input's empty ones", () => {
    expect(componentComposition("nova/Sidebar", context).slots).toEqual([
      { name: "children", key: "children", kind: "children" }
    ])
    expect(componentComposition("nova/Input", context).slots).toEqual([])
  })
})

describe("componentExample", () => {
  it("is the same tree each time, numbered in order", () => {
    const example = componentExample("nova/SidebarContent", undefined, sources)
    expect(example).toEqual(componentExample("nova/SidebarContent", undefined, sources))
    expect(example).toMatchObject({ id: "p1", component: "nova/SidebarProvider" })
  })
})
