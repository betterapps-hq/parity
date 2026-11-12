import { type ContainerSpec, defaultModeSettings, findNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { execute } from "./run.ts"
import type { AgentHooks, AgentSnapshot } from "./types.ts"

/** A Stat card component and a Dashboard screen with one instance of it. */
function snapshot(): AgentSnapshot {
  const card: ContainerSpec = {
    id: "stat-card",
    name: "Stat card",
    kind: "component",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "card",
      name: "Card",
      children: [{ type: "text", id: "label", name: "Label", text: "Revenue", bind: { text: "label" } }]
    },
    states: [{ id: "default", name: "Default" }],
    params: { label: { type: "text", default: "Revenue" } }
  }

  const dashboard: ContainerSpec = {
    id: "dashboard",
    name: "Dashboard",
    position: { x: 2000, y: 0 },
    root: {
      type: "layout",
      id: "page",
      children: [{ type: "instance", id: "sales", design: "stat-card", args: { label: "Sales" } }]
    },
    states: [
      { id: "default", name: "Default" },
      { id: "empty", name: "Empty", overrides: { sales: { props: { label: "No sales" } } } }
    ]
  }

  return {
    tab: `tab-${Math.random()}`,
    components: ["Button"],
    tokens: [],
    theme: [],
    modes: defaultModeSettings,
    documents: [{ path: "app.par", document: { version: 4, containers: [card, dashboard] } }],
    libraryDesigns: [],
    tokenOverrides: [],
    mainDocument: "app.par",
    props: {},
    selection: {},
    bounds: {}
  }
}

function hooks(): AgentHooks {
  const events: unknown[] = []

  return {
    presence: (batch) => events.push(...batch),
    render: async ({ mode }) => ({
      width: mode.width,
      height: 600,
      nodes: [],
      overflowsX: false,
      unknownComponents: []
    })
  }
}

async function run(code: string) {
  const result = await execute({ label: "Params", code }, snapshot(), hooks())
  const after = (id: string) => result.changes.designs.find((change) => change.id === id)?.after ?? undefined

  return { result, after }
}

describe("CreateDesign with params", () => {
  it("makes a component whose nodes bind the params it declares, a variant's options changing it by node name", async () => {
    const { result, after } = await run(`
const id = CreateDesign({
  name: "App sidebar",
  kind: "component",
  root: { type: "layout", name: "Sidebar", children: [
    { type: "text", name: "Workspace", text: "Acme", bind: { text: "workspace" } },
    { type: "text", name: "Badge", text: "Beta", bind: { visible: "showBadge" } }
  ] },
  params: {
    workspace: { type: "text", default: "Acme" },
    showBadge: { type: "boolean", default: false },
    density: { type: "variant", default: "Compact", options: [
      { name: "Comfortable" },
      { name: "Compact", overrides: { Sidebar: { style: { gap: { step: 2 } } } } }
    ] }
  }
})
Print(id)`)

    expect(result.ok).toBe(true)
    const sidebar = after("app-sidebar")!
    const root = sidebar.root.id

    expect(sidebar.params).toEqual({
      workspace: { type: "text", default: "Acme" },
      showBadge: { type: "boolean", default: false },
      density: {
        type: "variant",
        default: "compact",
        options: [
          { id: "comfortable", name: "Comfortable" },
          { id: "compact", name: "Compact", overrides: { [root]: { style: { gap: { step: 2 } } } } }
        ]
      }
    })
  })

  it.each([
    {
      code: `CreateDesign({ name: "Home", params: { title: { type: "text" } } })`,
      field: "params",
      message: "isn't a component"
    },
    {
      code: `CreateDesign({ name: "Tag", kind: "component", root: { type: "text", text: "New", bind: { text: "label" } } })`,
      field: "root",
      message: `"label", which isn't one of Tag's params`
    },
    {
      code: `CreateDesign({ name: "Tag", kind: "component", params: { label: { type: "colour" } } })`,
      field: "params/label/type",
      message: `expected one of "text"`
    }
  ])("refuses $message", async ({ code, field, message }) => {
    const { result } = await run(code)

    expect(result.ok).toBe(false)
    expect(result.error).toContain(message)
    expect(result.details).toMatchObject({ code: "invalid_input", field })
  })
})

describe("AddParam, UpdateParam and DeleteParam", () => {
  it("adds a param a node then binds with Update", async () => {
    const { result, after } = await run(`
AddParam("stat-card", "caption", { type: "text", default: "Last 30 days" })
const id = Insert("stat-card", { type: "text", name: "Caption", text: "Last 30 days" })
Update(id, { bind: { text: "caption" } })`)

    expect(result.ok).toBe(true)
    const card = after("stat-card")!

    expect(card.params?.caption).toEqual({ type: "text", default: "Last 30 days" })
    expect(card.root.type === "layout" && card.root.children[1]!.bind).toEqual({ text: "caption" })
  })

  it("renames a param in the component and in every instance's args and patches", async () => {
    const { result, after } = await run(`UpdateParam("stat-card", "label", { name: "title", default: "Users" })`)

    expect(result.ok).toBe(true)
    expect(after("stat-card")!.params).toEqual({ title: { type: "text", default: "Users" } })
    expect(findNode(after("stat-card")!.root, "label")?.bind).toEqual({ text: "title" })
    expect(findNode(after("dashboard")!.root, "sales")).toMatchObject({ args: { title: "Sales" } })
    expect(after("dashboard")!.states[1]!.overrides).toEqual({ sales: { props: { title: "No sales" } } })
  })

  it("keeps an option's changes when a new list names it again, and drops picks of an option that went", async () => {
    const { result, after } = await run(`
AddParam("stat-card", "tone", { type: "variant", options: [
  { name: "Plain" },
  { name: "Loud", overrides: { Card: { style: { padding: { step: 6 } } } } },
  { name: "Quiet" }
] })
Update("dashboard/sales", { args: { tone: "quiet" } })
UpdateParam("stat-card", "tone", { options: [{ name: "Plain" }, { name: "Loud" }] })`)

    expect(result.ok).toBe(true)
    expect(after("stat-card")!.params?.tone).toEqual({
      type: "variant",
      options: [
        { id: "plain", name: "Plain" },
        { id: "loud", name: "Loud", overrides: { card: { style: { padding: { step: 6 } } } } }
      ]
    })
    // The pick of Quiet went with it, which leaves Dashboard as it was.
    expect(after("dashboard")).toBeUndefined()
  })

  it("deletes a param, the bound node keeping its default and instances dropping the arg", async () => {
    const { result, after } = await run(`DeleteParam("stat-card", "label")`)

    expect(result.ok).toBe(true)
    expect(after("stat-card")!.params).toBeUndefined()
    expect(findNode(after("stat-card")!.root, "label")).toEqual({
      type: "text",
      id: "label",
      name: "Label",
      text: "Revenue"
    })
    expect(findNode(after("dashboard")!.root, "sales")).not.toHaveProperty("args")
  })

  it.each([
    { code: `AddParam("dashboard", "title", { type: "text" })`, field: "spec", message: "isn't a component" },
    { code: `UpdateParam("stat-card", "missing", { default: "x" })`, field: "name", message: `no param "missing"` },
    { code: `DeleteParam("stat-card", "missing")`, field: "name", message: "Params: label" },
    {
      code: `UpdateParam("stat-card", "label", { type: "number" })`,
      field: "type",
      message: "unknown property"
    },
    {
      code: `Insert("dashboard", { type: "text", text: "Hi", bind: { text: "label" } })`,
      field: "node",
      message: "only a component's layers bind to params"
    },
    { code: `Update("stat-card/label", { bind: { text: "nope" } })`, field: "change/bind", message: `"nope"` },
    {
      code: `AddState("stat-card", { name: "Busy" })
Update("stat-card/label", { bind: { text: null } }, { state: "busy" })`,
      field: "bind",
      message: "A state can only change"
    }
  ])("refuses $code", async ({ code, field, message }) => {
    const { result } = await run(code)

    expect(result.ok).toBe(false)
    expect(result.error).toContain(message)
    expect(result.details).toMatchObject({ code: "invalid_input", field })
  })
})
