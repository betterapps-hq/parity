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

describe("taking a value away", () => {
  const submit = (container: ContainerSpec, state: number) =>
    nodeInState(findNode(container.root, "submit")!, container.states[state])

  it("takes a prop the design sets away in one state, leaving the design and the other states alone", () => {
    const next = editNode(design, "loading", "submit", { unset: { props: ["children"] } })
    expect(next.states[1]?.overrides?.submit).toEqual({ props: { disabled: true }, unset: { props: ["children"] } })
    expect(submit(next, 1)).toEqual({ type: "component", id: "submit", component: "Button", props: { disabled: true } })
    expect(findNode(next.root, "submit")).toEqual(findNode(design.root, "submit"))
    expect(changeCount(next.states[1]!)).toBe(2)
  })

  it("takes a value the state set away too, keeping nothing for what the design doesn't set", () => {
    const next = editNode(design, "loading", "submit", { unset: { props: ["disabled"] } })
    expect(next.states[1]?.overrides).toBeUndefined()
    const style = editNode(design, "loading", "page", { unset: { style: ["gap", "padding"] } })
    expect(style.states[1]?.overrides?.page).toEqual({ unset: { style: ["gap"] } })
    expect(nodeInState(style.root, style.states[1]).style).toBeUndefined()
  })

  it("sets a value it took away again, and Reset takes the state's change back", () => {
    const taken = editNode(design, "loading", "submit", { unset: { props: ["children"] } })
    const again = editNode(taken, "loading", "submit", { props: { children: "Wait" } })
    expect(again.states[1]?.overrides?.submit).toEqual({ props: { disabled: true, children: "Wait" } })
    const back = editNode(taken, "loading", "submit", { props: { children: undefined } })
    expect(back.states[1]?.overrides?.submit).toEqual({ props: { disabled: true } })
    const reset = resetOverride(taken, "loading", "submit", { kind: "props", key: "children" })
    expect(reset.states[1]?.overrides?.submit).toEqual({ props: { disabled: true } })
    expect(submit(reset, 1)).toMatchObject({ props: { children: "Sign up", disabled: true } })
  })

  it("removes the value from the design in the base state", () => {
    const next = editNode(design, "default", "submit", { unset: { props: ["children"] } })
    expect(findNode(next.root, "submit")).toEqual({ type: "component", id: "submit", component: "Button" })
    expect(editNode(design, "default", "page", { unset: { style: ["gap"] } }).root.style).toBeUndefined()
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
