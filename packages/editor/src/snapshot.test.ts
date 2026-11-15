import {
  type CanvasDocument,
  type ContainerSpec,
  defaultModeSettings,
  type ModeSettings,
  parseCanvasDocument
} from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { mergedDocument, savedView } from "./snapshot.ts"

/** Modes other than the defaults, which the main file carries. */
const custom: ModeSettings = { ...defaultModeSettings, modes: [] }

function design(id: string): ContainerSpec {
  return {
    id,
    name: id,
    kind: "component",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] }
  }
}

function files(list: { path: string; document: CanvasDocument }[]): ReadonlyMap<string, CanvasDocument> {
  return new Map(list.map(({ path, document }) => [path, document]))
}

describe("the merged project file", () => {
  it("holds every file's designs and notes, and the modes when they aren't the defaults", () => {
    const documents = files([
      { path: "app.par", document: { version: 4, containers: [design("home")] } },
      {
        path: "more.par",
        document: {
          version: 4,
          containers: [design("about")],
          notes: [{ id: "n", text: "Hi", position: { x: 0, y: 0 } }]
        }
      }
    ])

    expect(mergedDocument({ documents, modes: defaultModeSettings }, "app.par")).toEqual({
      version: 4,
      containers: [design("home"), design("about")],
      notes: [{ id: "n", text: "Hi", position: { x: 0, y: 0 } }]
    })
    expect(mergedDocument({ documents, modes: custom }, "app.par").modes).toEqual(custom)
  })

  it("holds every file's canvas objects and links once each, and the main file's sources", () => {
    const users = { kind: "table", ref: "public.users", position: { x: 0, y: 0 } } as const
    const route = { kind: "route", ref: "/users/:id", position: { x: 400, y: 0 } } as const

    const reads = {
      id: "l1",
      type: "reads",
      from: { kind: "operation", ref: "getUser" },
      to: { kind: "table", ref: "public.users" }
    } as const

    const shows = {
      id: "l2",
      type: "shows",
      from: { kind: "screen", ref: "home" },
      to: { kind: "route", ref: "/users/:id" }
    } as const

    const documents = files([
      {
        path: "app.par",
        document: { version: 4, containers: [], objects: [users], links: [reads], sources: { data: "migrations" } }
      },
      {
        path: "more.par",
        document: {
          version: 4,
          containers: [],
          objects: [{ ...users, position: { x: 9, y: 9 } }, route],
          links: [{ ...reads, type: "writes" }, shows],
          sources: { data: "drizzle" }
        }
      }
    ])

    const merged = mergedDocument({ documents, modes: defaultModeSettings }, "app.par")
    expect(merged).toEqual({
      version: 4,
      containers: [],
      objects: [users, route],
      links: [reads, shows],
      sources: { data: "migrations" }
    })
    const written = JSON.stringify(merged)
    expect(parseCanvasDocument(JSON.parse(written))).toEqual(merged)
  })

  it("holds the main file's project settings", () => {
    const preferences = { snapping: false }
    const extensions = { storybook: { configDir: "web/.storybook" } }

    const documents = files([
      { path: "app.par", document: { version: 4, containers: [], preferences, extensions } },
      { path: "more.par", document: { version: 4, containers: [], preferences: { autosave: true } } }
    ])

    expect(mergedDocument({ documents, modes: defaultModeSettings }, "app.par")).toEqual({
      version: 4,
      containers: [],
      preferences,
      extensions
    })
  })
})

describe("a design's view as saved", () => {
  const view = { previews: { "default/desktop": { width: 900 } } }

  it("reads it from the design's file, as given", () => {
    const saved = files([{ path: "app.par", document: { version: 4, containers: [{ ...design("home"), view }] } }])

    expect(savedView((path) => saved.get(path), "app.par", "app.par", "home", false)).toEqual(view)
  })

  it("reads a design drawn from code from what the project file keeps for it", () => {
    const saved = files([
      { path: "app.par", document: { version: 4, containers: [], codeDesigns: { "(stories)#card": { view } } } }
    ])

    expect(savedView((path) => saved.get(path), "app.par", "(stories)", "card", true)).toEqual(view)
    expect(savedView((path) => saved.get(path), "app.par", "(stories)", "other", true)).toBeUndefined()
  })
})
