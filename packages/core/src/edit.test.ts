import { describe, expect, it } from "vite-plus/test"
import type { ContainerSpec, DesignNode } from "./document.ts"
import {
  addState,
  addVariant,
  changeCount,
  deleteNode,
  duplicateState,
  editNode,
  findNode,
  insertNode,
  locateNode,
  mapChildLists,
  mapNode,
  mapNodes,
  moveNode,
  nodeIds,
  nodeInState,
  nodeLabel,
  propChange,
  removeNode,
  removeState,
  resetOverride,
  withFreshIds
} from "./edit.ts"
import { CodedError, errorDetails } from "./errors.ts"

/** The error `run` throws, or undefined when it doesn't throw one. */
function caught(run: () => void): Error | undefined {
  try {
    run()
  } catch (error) {
    return error instanceof Error ? error : undefined
  }

  return undefined
}

const design: ContainerSpec = {
  id: "signup",
  name: "Sign up",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "page",
    style: { gap: { step: 4 } },
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

  it("keeps an override that matches the base value when asked to, as agents' changes are written", () => {
    const kept = { keepEqual: true }
    const next = editNode(design, "loading", "title", { text: "Create an account", hidden: false }, kept)
    expect(next.states[1]?.overrides?.title).toEqual({ text: "Create an account", hidden: false })
    const style = editNode(design, "loading", "page", { style: { gap: { step: 4 } } }, kept)
    expect(style.states[1]?.overrides?.page).toEqual({ style: { gap: { step: 4 } } })
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

describe("clearing a prop, as the inspector does", () => {
  const disabled: ContainerSpec = editNode(design, "default", "submit", { props: { disabled: true } })

  const shown = (container: ContainerSpec) => {
    const node = nodeInState(findNode(container.root, "submit")!, container.states[1])

    return node.type === "component" ? { props: node.props } : {}
  }

  it("turns a prop the design sets off in one state, and Reset takes that back", () => {
    // The design disables the button; Loading set nothing of its own for it.
    const base = { ...disabled, states: [disabled.states[0]!, { id: "loading", name: "Loading" }] }
    const off = editNode(base, "loading", "submit", propChange("disabled", undefined))
    expect(shown(off).props).toEqual({ children: "Sign up" })
    expect(findNode(off.root, "submit")).toMatchObject({ props: { disabled: true } })
    const reset = resetOverride(off, "loading", "submit", { kind: "props", key: "disabled" })
    expect(reset.states[1]?.overrides).toBeUndefined()
    expect(shown(reset).props).toEqual({ children: "Sign up", disabled: true })
  })

  it("removes it from the design in the base state, and sets a value as before", () => {
    expect(findNode(editNode(disabled, "default", "submit", propChange("disabled", undefined)).root, "submit")).toEqual(
      findNode(design.root, "submit")
    )
    expect(propChange("size", "sm")).toEqual({ props: { size: "sm" } })
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

  it("gives a frame no second state and no variants, with a code an agent can act on", () => {
    const frame: ContainerSpec = { ...design, kind: "frame", name: "Sketch", states: [design.states[0]!] }

    const refusals = [
      () => addState(frame, "Error"),
      () => duplicateState(frame, "default"),
      () => addVariant(frame, "size", ["Small", "Large"])
    ]

    for (const refuse of refusals) {
      expect(refuse).toThrow(CodedError)
      expect(refuse).toThrow(/^Sketch is a frame, which has/)
      expect(errorDetails(caught(refuse))).toEqual({ code: "invalid_input", field: "design", retryable: false })
    }

    // Editing its one state still changes its layers.
    expect(findNode(editNode(frame, "default", "title", { text: "Idea" }).root, "title")).toMatchObject({
      text: "Idea"
    })
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

describe("mapping every node (PAR-966)", () => {
  // A layout holding a code component, whose slot holds an instance, which fills its own slot with a layout of texts.
  const tree: DesignNode = {
    type: "layout",
    id: "page",
    children: [
      { type: "text", id: "title", text: "Team" },
      {
        type: "component",
        id: "card",
        component: "Card",
        slots: {
          children: [
            {
              type: "instance",
              id: "row",
              design: "row",
              slots: {
                content: [{ type: "layout", id: "fill", children: [{ type: "text", id: "name", text: "Avery" }] }],
                actions: [{ type: "image", id: "photo", src: "/avery.jpg" }]
              }
            }
          ]
        }
      }
    ]
  }

  it("reaches a layout's children, a code component's slots and the layers an instance fills its slots with", () => {
    const met: string[] = []

    const next = mapNodes(tree, (node) => {
      met.push(node.id)

      return { ...node, name: node.id.toUpperCase() }
    })

    // A node before what it holds, in the order the tree holds them.
    expect(met).toEqual(["page", "title", "card", "row", "fill", "name", "photo"])
    expect([...nodeIds(next)]).toEqual(met)

    for (const id of met) {
      expect(findNode(next, id)).toMatchObject({ name: id.toUpperCase() })
    }

    expect(locateNode(next, "photo")).toMatchObject({ slot: "actions", index: 0 })
  })

  it("goes into what a node's replacement holds, not what the node held", () => {
    const next = mapNodes(tree, (node) =>
      node.id === "row" && node.type === "instance"
        ? { ...node, slots: { content: [{ type: "text", id: "swapped", text: "Swapped" }] } }
        : { ...node, hidden: true }
    )

    expect(findNode(next, "swapped")).toMatchObject({ hidden: true })
    expect(findNode(next, "name")).toBeUndefined()
  })

  it("gives back the same tree when nothing changes, and the same branches beside one that does", () => {
    expect(mapNodes(tree, (node) => node)).toBe(tree)
    const next = mapNodes(tree, (node) => (node.id === "name" ? { ...node, hidden: true } : node))
    expect(next).not.toBe(tree)
    expect(findNode(next, "title")).toBe(findNode(tree, "title"))
    expect(findNode(next, "photo")).toBe(findNode(tree, "photo"))
  })

  it("maps each list a node holds by the slot it's in, and leaves a node that holds none as it is", () => {
    const row = findNode(tree, "row")!
    const slots: (string | undefined)[] = []

    const emptied = mapChildLists(row, (nodes, slot) => {
      slots.push(slot)

      return slot === "actions" ? [] : nodes
    })

    expect(slots).toEqual(["content", "actions"])
    expect(emptied).toMatchObject({ slots: { content: [{ id: "fill" }], actions: [] } })
    expect(mapChildLists(tree, (nodes, slot) => (slot === undefined ? nodes.slice(0, 1) : nodes))).toMatchObject({
      children: [{ id: "title" }]
    })

    const title = findNode(tree, "title")!
    expect(mapChildLists(title, () => [])).toBe(title)
    expect(mapChildLists(row, (nodes) => nodes)).toBe(row)
  })

  it("lets one node be replaced or removed inside the layers an instance fills its slots with", () => {
    const replaced = mapNode(tree, "photo", (node) => ({ ...node, hidden: true }))
    expect(locateNode(replaced, "photo")).toMatchObject({ node: { hidden: true }, slot: "actions" })
    // The branches beside the change are the same objects.
    expect(findNode(replaced, "title")).toBe(findNode(tree, "title"))
    expect(findNode(replaced, "fill")).toBe(findNode(tree, "fill"))

    const removed = removeNode(tree, "name")
    expect(findNode(removed, "name")).toBeUndefined()
    expect(findNode(removed, "fill")).toMatchObject({ type: "layout", children: [] })
    expect(findNode(removed, "photo")).toBe(findNode(tree, "photo"))
  })

  it("is how a copy gets fresh ids, the layers an instance fills its slots with included", () => {
    const taken = nodeIds(tree)
    const copy = withFreshIds(tree, taken)
    const fresh = [...nodeIds(copy)]
    expect(fresh).toHaveLength(7)
    expect(fresh.filter((id) => nodeIds(tree).has(id))).toEqual([])
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
