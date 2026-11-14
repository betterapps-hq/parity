import { type ContainerSpec, defaultModeSettings, formatVersion } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { designOperationChanges } from "./design-operations.ts"
import type { DesignSnapshot } from "./history.ts"
import { noTokenEdits } from "./token-edits.ts"

const home: ContainerSpec = {
  id: "home",
  name: "Home",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    children: [
      { type: "text", id: "title", name: "Title", text: "Welcome" },
      { type: "text", id: "body", text: "Hello" }
    ]
  }
}

const snapshot: DesignSnapshot = {
  documents: new Map([["app.par", { version: formatVersion, containers: [home] }]]),
  modes: defaultModeSettings,
  tokens: noTokenEdits
}

describe("designOperationChanges", () => {
  it("renames a layer as a change to its design, with the design as it was", () => {
    const [change] = designOperationChanges(snapshot, [
      { op: "set", design: "app.par#home", node: "title", path: ["name"], value: "Heading" }
    ])

    expect(change).toMatchObject({ path: "app.par", id: "home", base: home })
    expect(change?.after?.root).toMatchObject({ children: [{ id: "title", name: "Heading" }, { id: "body" }] })
  })

  it("takes a field away when the value is left out, and a record left empty with it", () => {
    const [unnamed] = designOperationChanges(snapshot, [
      { op: "set", design: "app.par#home", node: "title", path: ["name"] }
    ])

    expect(unnamed?.after?.root).toMatchObject({ children: [{ id: "title", text: "Welcome" }, { id: "body" }] })
    expect(JSON.stringify(unnamed?.after)).not.toContain("Title")

    const [styled] = designOperationChanges(snapshot, [
      { op: "set", design: "app.par#home", node: "body", path: ["style", "padding"], value: "1rem" },
      { op: "set", design: "app.par#home", node: "body", path: ["style", "padding"] }
    ])

    expect(styled).toBeUndefined()
  })

  it("inserts before a sibling, moves and removes layers, in order", () => {
    const [change] = designOperationChanges(snapshot, [
      {
        op: "insert",
        design: "app.par#home",
        parent: "root",
        before: "title",
        node: { type: "text", id: "kicker", text: "New" }
      },
      { op: "move", design: "app.par#home", node: "body", parent: "root", before: "kicker" },
      { op: "remove", design: "app.par#home", node: "title" }
    ])

    expect(change?.after?.root).toMatchObject({ children: [{ id: "body" }, { id: "kicker" }] })
  })

  it("refuses, naming the operation, what can't apply or would leave a design invalid", () => {
    expect(() => designOperationChanges(snapshot, [{ op: "remove", design: "app.par#gone", node: "title" }])).toThrow(
      'Operation 1: no design "app.par#gone"'
    )

    expect(() =>
      designOperationChanges(snapshot, [
        { op: "set", design: "app.par#home", node: "title", path: ["name"], value: "Fine" },
        { op: "set", design: "app.par#home", node: "missing", path: ["name"], value: "Lost" }
      ])
    ).toThrow('Operation 2: No layer "missing" in this design')

    expect(() =>
      designOperationChanges(snapshot, [{ op: "set", design: "app.par#home", node: "title", path: ["id"], value: "x" }])
    ).toThrow("A layer's id can't be set")

    expect(() =>
      designOperationChanges(snapshot, [
        { op: "set", design: "app.par#home", node: "title", path: ["text"], value: 42 }
      ])
    ).toThrow("app.par would be invalid")

    expect(() =>
      designOperationChanges(snapshot, [
        { op: "insert", design: "app.par#home", parent: "root", node: { type: "text", id: "body", text: "Again" } }
      ])
    ).toThrow('A node with id "body" already exists')
  })
})
