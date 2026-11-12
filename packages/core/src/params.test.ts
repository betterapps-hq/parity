import { describe, expect, it } from "vite-plus/test"
import type { ContainerSpec } from "./document.ts"
import { findNode } from "./edit.ts"
import { addParam, bindingProblem, bindNode, changeArgs, deleteParam, renameParam, updateParam } from "./params.ts"
import { componentLibrary } from "./render.ts"

function card(): ContainerSpec {
  return {
    id: "stat-card",
    name: "Stat card",
    kind: "component",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "card",
      children: [
        { type: "text", id: "label", text: "Revenue", bind: { text: "label" } },
        { type: "text", id: "trend", text: "+4%", bind: { visible: "showTrend" } },
        {
          type: "component",
          id: "more",
          component: "Button",
          props: { children: "More" },
          bind: { props: { size: "size" } }
        }
      ]
    },
    params: {
      label: { type: "text", default: "Revenue" },
      showTrend: { type: "boolean", default: false },
      size: {
        type: "variant",
        default: "small",
        options: [
          { id: "medium", name: "Medium" },
          { id: "small", name: "Small", overrides: { card: { style: { padding: 3 } } } }
        ]
      }
    },
    view: { variants: { size: "small" } }
  }
}

function screen(): ContainerSpec {
  return {
    id: "dashboard",
    name: "Dashboard",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "page",
      children: [
        {
          type: "instance",
          id: "revenue",
          design: "stat-card",
          args: { label: "Sales", size: "small" },
          responsive: { mobile: { props: { label: "Sales (m)" }, unset: { props: ["size"] } } }
        }
      ]
    },
    states: [
      { id: "default", name: "Default" },
      { id: "empty", name: "Empty", overrides: { revenue: { props: { label: "None" } } } }
    ]
  }
}

describe("addParam", () => {
  it("adds a param to a component", () => {
    const next = addParam(card(), "caption", { type: "text", default: "Last 30 days" })

    expect(next.params?.caption).toEqual({ type: "text", default: "Last 30 days" })
  })

  it.each([
    { name: "label", param: { type: "text" as const }, field: "name", message: "already a prop called label" },
    { name: "two words", param: { type: "text" as const }, field: "name", message: "has to start with a letter" },
    { name: "count", param: { type: "number" as const, default: "3" }, field: "default", message: "is a number" },
    { name: "tone", param: { type: "variant" as const }, field: "options", message: "at least one option" },
    {
      name: "on",
      param: { type: "boolean" as const, options: [{ id: "a", name: "A" }] },
      field: "options",
      message: "Only a variant"
    },
    {
      name: "tone",
      param: { type: "variant" as const, default: "loud", options: [{ id: "quiet", name: "Quiet" }] },
      field: "default",
      message: "one of its options' ids: quiet"
    }
  ])("refuses $name when $message", ({ name, param, field, message }) => {
    expect(() => addParam(card(), name, param)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining(message),
        details: expect.objectContaining({ code: "invalid_input", field })
      })
    )
  })

  it("refuses a design that isn't a component", () => {
    expect(() => addParam(screen(), "title", { type: "text" })).toThrow("isn't a component")
  })
})

describe("renameParam", () => {
  it("renames the param in place, with the nodes that bind it and the option the board shows", () => {
    const next = renameParam(renameParam(card(), "label", "title"), "size", "scale")

    expect(Object.keys(next.params!)).toEqual(["title", "showTrend", "scale"])
    expect(findNode(next.root, "label")?.bind).toEqual({ text: "title" })
    expect(findNode(next.root, "more")?.bind).toEqual({ props: { size: "scale" } })
    expect(next.view).toEqual({ variants: { scale: "small" } })
  })

  it("refuses a name another prop has", () => {
    expect(() => renameParam(card(), "label", "showTrend")).toThrow("already a prop called showTrend")
  })
})

describe("deleteParam", () => {
  it("leaves each bound node showing the param's default as its own", () => {
    const next = deleteParam(deleteParam(card(), "label"), "showTrend")

    expect(findNode(next.root, "label")).toEqual({ type: "text", id: "label", text: "Revenue" })
    expect(findNode(next.root, "trend")).toEqual({ type: "text", id: "trend", text: "+4%", hidden: true })
    expect(Object.keys(next.params!)).toEqual(["size"])
  })

  it("takes a variant's options and the board's choice with it", () => {
    const next = deleteParam(card(), "size")

    expect(next.params?.size).toBeUndefined()
    expect(next.view).toBeUndefined()
    expect(findNode(next.root, "more")).toMatchObject({ props: { children: "More", size: "small" } })
    expect(findNode(next.root, "more")?.bind).toBeUndefined()
  })
})

describe("updateParam", () => {
  it("changes a default and a description, and takes them away with null", () => {
    const described = updateParam(card(), "label", { default: "Users", description: "What's counted" }).container

    expect(described.params?.label).toEqual({ type: "text", default: "Users", description: "What's counted" })
    expect(updateParam(described, "label", { default: null, description: null }).container.params?.label).toEqual({
      type: "text"
    })
  })

  it("replaces a variant's options, saying which went, and forgets a default or choice on one that went", () => {
    const { container, dropped } = updateParam(card(), "size", {
      options: [
        { id: "medium", name: "Medium" },
        { id: "large", name: "Large" }
      ]
    })

    expect(dropped).toEqual(["small"])
    expect(container.params?.size).toEqual({
      type: "variant",
      options: [
        { id: "medium", name: "Medium" },
        { id: "large", name: "Large" }
      ]
    })
    expect(container.view).toBeUndefined()
  })

  it("refuses options on a param that isn't a variant", () => {
    expect(() => updateParam(card(), "label", { options: [{ id: "a", name: "A" }] })).toThrow("Only a variant")
  })
})

describe("bindNode", () => {
  it("binds a field and, unbound, keeps what the param showed", () => {
    const bound = bindNode(card(), "trend", { text: "label" })

    expect(findNode(bound.root, "trend")?.bind).toEqual({ visible: "showTrend", text: "label" })

    const unbound = bindNode(bound, "trend", { text: null, visible: null })

    expect(findNode(unbound.root, "trend")).toEqual({ type: "text", id: "trend", text: "Revenue", hidden: true })
  })

  it.each([
    { node: "trend", change: { text: "missing" }, message: `"missing", which isn't one of Stat card's params` },
    { node: "trend", change: { visible: "label" }, message: `takes a boolean or value param, and "label" is a text` },
    { node: "card", change: { text: "label" }, message: "only a text layer's text" },
    { node: "label", change: { props: { size: "size" } }, message: "only a code component's props" }
  ])("refuses binding $node to $change", ({ node, change, message }) => {
    expect(() => bindNode(card(), node, change)).toThrow(message)
  })
})

describe("bindingProblem", () => {
  it("finds a bind in a design that isn't a component", () => {
    const design = screen()
    const node = { type: "text" as const, id: "x", text: "Hi", bind: { text: "label" } }

    expect(bindingProblem(design, node)?.message).toContain("only a component's layers bind to params")
  })

  it("finds nothing wrong with a component's own binds", () => {
    const design = card()

    expect(bindingProblem(design, design.root)).toBeUndefined()
  })
})

describe("changeArgs", () => {
  const library = componentLibrary([card()])

  it("renames an arg in instances, their responsive patches and the states' patches", () => {
    const next = changeArgs(screen(), "stat-card", { rename: "label", to: "title" }, library)
    const instance = findNode(next.root, "revenue")

    expect(instance).toMatchObject({
      args: { title: "Sales", size: "small" },
      responsive: { mobile: { props: { title: "Sales (m)" }, unset: { props: ["size"] } } }
    })
    expect(next.states![1]!.overrides).toEqual({ revenue: { props: { title: "None" } } })
  })

  it("drops an arg, and a patch left with nothing", () => {
    const next = changeArgs(screen(), "stat-card", { drop: "label" }, library)

    expect(findNode(next.root, "revenue")).toMatchObject({ args: { size: "small" } })
    expect(next.states![1]).toEqual({ id: "empty", name: "Empty" })
  })

  it("drops a variant's arg only where it picked an option that went", () => {
    const kept = changeArgs(screen(), "stat-card", { param: "size", options: ["large"] }, library)
    const dropped = changeArgs(screen(), "stat-card", { param: "size", options: ["small"] }, library)

    expect(findNode(kept.root, "revenue")).toMatchObject({ args: { label: "Sales", size: "small" } })
    expect(findNode(dropped.root, "revenue")).toMatchObject({ args: { label: "Sales" } })
  })

  it("leaves instances of other components alone", () => {
    const design = screen()

    expect(changeArgs(design, "other", { drop: "label" }, library)).toEqual(design)
  })
})
