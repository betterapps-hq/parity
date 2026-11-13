import { describe, expect, it } from "vite-plus/test"
import { addDesigns, emptyDocument, removeDesigns } from "./designs.ts"
import { type CanvasDocument, type ContainerSpec, formatVersion, parseCanvasDocument } from "./document.ts"
import { componentLibrary, resolveDesign } from "./render.ts"

function design(id: string, kind: ContainerSpec["kind"] = "screen", root?: ContainerSpec["root"]): ContainerSpec {
  return { id, name: id, kind, position: { x: 0, y: 0 }, root: root ?? { type: "layout", id: "root", children: [] } }
}

const button = design("button", "component")

const home = design("home", "screen", {
  type: "layout",
  id: "root",
  children: [{ type: "instance", id: "cta", design: "button" }]
})

const ids = (document: CanvasDocument) => document.containers.map((container) => container.id)

describe("project files", () => {
  it("makes an empty file a project file can be read from", () => {
    expect(parseCanvasDocument(emptyDocument())).toEqual({ version: formatVersion, containers: [] })
  })

  it("adds designs to a file the project doesn't have yet", () => {
    expect(addDesigns(undefined, [home])).toEqual({ version: formatVersion, containers: [home] })
  })

  it("adds designs after the ones a file has, keeping what else it holds", () => {
    const file: CanvasDocument = { ...emptyDocument(), containers: [button], notes: [] }
    const added = addDesigns(file, [home, design("about")])

    expect(ids(added)).toEqual(["button", "home", "about"])
    expect(added.notes).toEqual([])
    expect(addDesigns(file, [])).toBe(file)
  })

  it("removes a component other designs place, leaving their instances to show it's gone", () => {
    const file = addDesigns(undefined, [button, home])
    const removed = removeDesigns(file, ["button"])

    expect(ids(removed)).toEqual(["home"])

    const [root] = resolveDesign(
      removed.containers[0]!.root,
      undefined,
      "desktop",
      componentLibrary(removed.containers)
    )

    expect(root?.kind === "element" && root.children[0]).toMatchObject({
      kind: "component",
      component: 'No component design "button"'
    })
  })

  it("leaves a file that has none of the designs as it was", () => {
    const file = addDesigns(undefined, [home])

    expect(removeDesigns(file, ["pricing"])).toBe(file)
  })
})
