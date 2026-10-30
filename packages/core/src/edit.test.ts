import { describe, expect, it } from "vite-plus/test"
import type { ContainerSpec } from "./document.ts"
import {
  addState,
  changeCount,
  deleteNode,
  duplicateState,
  editNode,
  findNode,
  insertNode,
  locateNode,
  moveNode,
  nodeInState,
  nodeLabel,
  removeState,
  resetOverride,
  withFreshIds
} from "./edit.ts"

const design: ContainerSpec = {
  id: "signup",
  name: "Sign up",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "page",
    style: { gap: 4 },
    children: [
      { type: "text", id: "title", text: "Create an account" },
      {
        type: "component",
        id: "card",
        component: "Card",
        slots: { children: [{ type: "component", id: "submit", component: "Button", props: { children: "Sign up" } }] }
      }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "loading", name: "Loading", overrides: { submit: { props: { disabled: true } } } }
  ]
}

describe("editing the base state", () => {
  it("changes the design itself", () => {
    const next = editNode(design, "default", "title", { text: "Join us" })
    expect(findNode(next.root, "title")).toMatchObject({ text: "Join us" })
    expect(next.states).toBe(design.states)
  })

  it("clears values set to undefined", () => {
    const next = editNode(design, "default", "page", { style: { gap: undefined } })
    expect(findNode(next.root, "page")?.style).toBeUndefined()
  })
})

describe("editing another state", () => {
  it("writes an override and leaves the design alone", () => {
    const next = editNode(design, "loading", "submit", { props: { children: "Signing up…" } })
    expect(findNode(next.root, "submit")).toEqual(findNode(design.root, "submit"))
    expect(next.states[1]?.overrides?.submit).toEqual({ props: { disabled: true, children: "Signing up…" } })
  })

  it("drops an override that matches the base value", () => {
    const next = editNode(design, "loading", "submit", { props: { disabled: undefined } })
    expect(next.states[1]?.overrides).toBeUndefined()
    const same = editNode(design, "loading", "title", { text: "Create an account" })
    expect(same.states[1]?.overrides?.title).toBeUndefined()
  })

  it("shows the node as the state sees it", () => {
    const submit = findNode(design.root, "submit")!
    expect(nodeInState(submit, design.states[1])).toMatchObject({ props: { children: "Sign up", disabled: true } })
  })

  it("resets one field or the whole override", () => {
    const edited = editNode(design, "loading", "title", { hidden: true })
    expect(changeCount(edited.states[1]!)).toBe(2)
    expect(resetOverride(edited, "loading", "title", { kind: "hidden" }).states[1]?.overrides).toEqual({
      submit: { props: { disabled: true } }
    })
    expect(resetOverride(edited, "loading", "submit").states[1]?.overrides).toEqual({ title: { hidden: true } })
  })
})

describe("states", () => {
  it("adds, duplicates and removes states", () => {
    const added = addState(design, "Error")
    expect(added.id).toBe("error")
    const copied = duplicateState(added.container, "loading")
    expect(copied.container.states.map((state) => state.id)).toEqual(["default", "loading", "loading-copy", "error"])
    expect(copied.container.states[2]?.overrides).toEqual(design.states[1]?.overrides)
    expect(removeState(copied.container, "loading-copy").states).toHaveLength(3)
    expect(() => removeState(design, "default")).toThrow("base state")
  })
})

describe("tree edits", () => {
  it("inserts into layouts and component slots", () => {
    const root = insertNode(design.root, "card", { type: "text", id: "hint", text: "Free" }, { index: 0 })
    expect(locateNode(root, "hint")).toMatchObject({ slot: "children", index: 0 })
    expect(() => insertNode(root, "title", { type: "text", id: "x", text: "" })).toThrow("text node")
    expect(() => insertNode(root, "page", { type: "text", id: "hint", text: "" })).toThrow("already exists")
  })

  it("moves nodes, keeping indexes stable within one list", () => {
    const root = moveNode(design.root, "title", "page", { index: 2 })
    expect(root.type === "layout" && root.children.map((child) => child.id)).toEqual(["card", "title"])
    expect(() => moveNode(design.root, "page", "card")).toThrow("root")
    expect(() => moveNode(design.root, "card", "submit")).toThrow("inside itself")
  })

  it("deletes a node and its overrides", () => {
    const next = deleteNode(design, "card")
    expect(findNode(next.root, "submit")).toBeUndefined()
    expect(next.states[1]?.overrides).toBeUndefined()
  })

  it("gives copies fresh ids", () => {
    const copy = withFreshIds(findNode(design.root, "card")!, new Set(["page"]))
    expect(copy.id).not.toBe("card")
    expect(copy.type === "component" && copy.slots?.children?.[0]?.id).not.toBe("submit")
  })
})

describe("nodeLabel", () => {
  it("calls an unnamed instance after its design when the design is known", () => {
    const row = { type: "instance" as const, id: "row-1", design: "member-row" }
    const designs = new Map([["member-row", "Member row"]])
    expect(nodeLabel(row, (id) => designs.get(id))).toBe("Member row")
    expect(nodeLabel(row)).toBe("member-row")
    expect(nodeLabel({ ...row, name: "First row" }, (id) => designs.get(id))).toBe("First row")
  })
})
