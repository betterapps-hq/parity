import { type CanvasDocument, type ContainerSpec, type DesignNode, findNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { instancesOf, makeComponent } from "./components.ts"

const card = (key: string, title: string): DesignNode => ({
  type: "layout",
  id: `card-${key}`,
  children: [
    { type: "text", id: `${key}-title`, text: title, style: { weight: 600 } },
    { type: "text", id: `${key}-body`, text: "Details" }
  ]
})

/** A screen with two cards built the same way. */
const projects: ContainerSpec = {
  id: "projects",
  name: "Projects",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "page", children: [card("a", "Atlas"), card("b", "Beacon")] },
  states: [{ id: "default", name: "Default" }]
}

const settings: ContainerSpec = {
  id: "settings",
  name: "Settings",
  position: { x: 1600, y: 0 },
  root: { type: "layout", id: "settings-page", children: [] },
  states: [{ id: "default", name: "Default" }]
}

const documents = (): Map<string, CanvasDocument> =>
  new Map([
    ["screens/projects.par", { version: 3, containers: [projects] }],
    ["canvas.par", { version: 3, containers: [settings] }]
  ])

const options = { name: "Project card", into: "canvas.par", position: { x: 0, y: -640 }, viewports: ["desktop"] }

describe("making a component", () => {
  it("adds the component to the project file and puts an instance in place of each occurrence", () => {
    const before = documents()
    const made = makeComponent(before, { path: "screens/projects.par", id: "projects" }, ["card-a", "card-b"], options)
    expect(made.id).toBe("project-card")
    const [kept, component] = made.documents.get("canvas.par")!.containers
    expect(kept).toBe(settings)
    expect(component).toMatchObject({
      id: "project-card",
      name: "Project card",
      kind: "component",
      position: { x: 0, y: -640 }
    })
    const design = made.documents.get("screens/projects.par")!.containers[0]!
    expect(findNode(design.root, "card-a")).toMatchObject({ type: "instance", design: "project-card" })
    expect(findNode(design.root, "card-b")).toMatchObject({ type: "instance", design: "project-card" })
    expect(before).toEqual(documents())
  })

  it("gives it an id no design has, and the params the names asked for", () => {
    const taken = documents()
    taken.set("canvas.par", { version: 3, containers: [settings, { ...settings, id: "project-card" }] })
    const made = makeComponent(taken, { path: "screens/projects.par", id: "projects" }, ["card-a", "card-b"], {
      ...options,
      paramNames: { text: "title" }
    })
    expect(made.id).toBe("project-card-2")
    const component = made.documents.get("canvas.par")!.containers.at(-1)!
    expect(Object.keys(component.params ?? {})).toEqual(["title"])
  })

  it("starts the project file when there isn't one", () => {
    const made = makeComponent(documents(), { path: "screens/projects.par", id: "projects" }, ["card-a"], {
      ...options,
      into: "new.par"
    })
    expect(made.documents.get("new.par")).toEqual({
      version: 3,
      containers: [expect.objectContaining({ id: "project-card" })]
    })
  })

  it("throws for a design that isn't there, or layers that can't share a component", () => {
    expect(() => makeComponent(documents(), { path: "canvas.par", id: "projects" }, ["card-a"], options)).toThrow(
      'No design "projects" in canvas.par'
    )
    expect(() =>
      makeComponent(documents(), { path: "screens/projects.par", id: "projects" }, ["card-a", "a-title"], options)
    ).toThrow("isn't structured like")
  })
})

describe("finding a component's instances", () => {
  it("finds them in every design, in layouts and slots, in order", () => {
    const instance = (id: string, design = "badge"): DesignNode => ({ type: "instance", id, design })
    const designs = [
      {
        key: "a",
        container: {
          ...projects,
          root: { type: "layout", id: "a-root", children: [instance("one"), instance("other", "chip")] }
        }
      },
      { key: "b", container: settings },
      {
        key: "c",
        container: {
          ...settings,
          root: { type: "component", id: "c-root", component: "Card", slots: { footer: [instance("two")] } }
        }
      }
    ] satisfies { key: string; container: ContainerSpec }[]
    expect(instancesOf(designs, "badge")).toEqual([
      { entry: designs[0], node: "one" },
      { entry: designs[2], node: "two" }
    ])
    expect(instancesOf(designs, "missing")).toEqual([])
  })
})
