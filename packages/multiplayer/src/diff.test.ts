import { type CanvasDocument, type ContainerSpec, emptyDocument } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { diffFiles } from "./diff.ts"

const home: ContainerSpec = {
  id: "home",
  name: "Home",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    children: [
      { type: "text", id: "title", text: "Hello" },
      { type: "text", id: "old", text: "Old" }
    ]
  }
}

const about: ContainerSpec = { ...home, id: "about", name: "About" }

describe("diffFiles", () => {
  it("says what changed between two snapshots of a file, by id", () => {
    const before: CanvasDocument = {
      ...emptyDocument(),
      containers: [home, about],
      notes: [{ id: "n1", text: "One", position: { x: 0, y: 0 } }]
    }

    const after: CanvasDocument = {
      ...emptyDocument(),
      containers: [
        {
          ...home,
          name: "Start",
          root: {
            type: "layout",
            id: "root",
            children: [
              { type: "text", id: "title", text: "Hi" },
              { type: "text", id: "new", text: "New" }
            ]
          }
        }
      ],
      notes: [
        { id: "n1", text: "Changed", position: { x: 0, y: 0 } },
        { id: "n2", text: "Two", position: { x: 0, y: 0 } }
      ],
      links: []
    }

    expect(diffFiles("app.par", before, after)).toEqual({
      designs: {
        added: [],
        removed: ["app.par#about"],
        moved: [],
        changed: [{ design: "app.par#home", fields: [{ path: ["name"], before: "Home", after: "Start" }] }]
      },
      layers: {
        added: [{ design: "app.par#home", node: "new" }],
        removed: [{ design: "app.par#home", node: "old" }],
        moved: [],
        changed: [
          {
            address: { design: "app.par#home", node: "title" },
            fields: [{ path: ["text"], before: "Hello", after: "Hi" }]
          }
        ]
      },
      notes: { added: ["app.par#n2"], removed: [], changed: ["app.par#n1"] },
      references: { added: [], removed: [], changed: [] },
      fileFields: ["links"],
      modes: false
    })
  })

  it("lists every design of a file added or removed whole", () => {
    const document: CanvasDocument = { ...emptyDocument(), containers: [home, about] }

    expect(diffFiles("app.par", undefined, document).designs.added).toEqual(["app.par#home", "app.par#about"])
    expect(diffFiles("app.par", document, undefined).designs.removed).toEqual(["app.par#home", "app.par#about"])
  })
})
