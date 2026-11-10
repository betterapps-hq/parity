import type { Found } from "@parity-app/connectors"
import { type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import { newDesign } from "@parity-app/editor"
import { describe, expect, it, vi } from "vite-plus/test"
import { deleteSelection } from "../chrome/commands.ts"
import { DesignStore } from "../design-store.ts"
import { SelectionStore } from "../selection.ts"
import type { ProjectSession } from "../workspace.ts"
import { placeReferences } from "./find-references.ts"

vi.mock("../canvas/CanvasEditor.tsx", () => ({ canvasIdFor: (key: string) => key }))

function screen(id: string, platform: "web" | "ios" = "web"): Found {
  return {
    connector: "mobbin",
    id,
    kind: "screens",
    title: id === "quill" ? "Quill" : "Ledgerly",
    platform,
    image: { url: `https://images.example/${id}.png`, width: 768, height: 480 },
    link: `https://mobbin.com/screens/${id}`,
    credit: [{ name: "Ledgerly" }, { name: "Mobbin" }]
  }
}

function session(containers: ContainerSpec[] = []): ProjectSession {
  const store = new DesignStore(
    [{ path: "app.par", document: { version: 3, containers } }],
    defaultModeSettings,
    "app.par",
    {
      saveDocument: async () => undefined,
      autosave: () => false
    }
  )

  // SAFETY: placing and deleting references read only the store, the selection and the canvas, which isn't drawn here.
  return { store, selection: new SelectionStore() } as ProjectSession
}

describe("placing references", () => {
  it("puts what's picked in a row as one step, each with the search that found it, and selects the last", () => {
    const placing = session()
    const { store, selection } = placing

    placeReferences(placing, [screen("ledgerly"), screen("quill", "ios")], undefined, new Map([["quill", "paywall"]]))

    const placed = store.getReferences().map(({ reference }) => reference)

    expect(placed.map(({ app, position, query }) => ({ app, position, query }))).toEqual([
      { app: "Ledgerly", position: { x: -859, y: -400 }, query: undefined },
      { app: "Quill", position: { x: 469, y: -400 }, query: "paywall" }
    ])
    expect(store.getHistory().undoLabel).toBe("Place 2 references")
    expect(selection.get()).toEqual({ reference: store.getReferences()[1]!.key })
  })

  it("records the design they were found for, in its file", () => {
    const design = { ...newDesign("screen", [], { x: 0, y: 0 }), id: "pricing", name: "Pricing" }
    const placing = session([design])

    placeReferences(placing, [screen("ledgerly")], "app.par#pricing")

    expect(placing.store.getReferences().map(({ reference }) => reference.design)).toEqual(["pricing"])
  })

  it("deletes the selected one, and Undo brings it back", () => {
    const placing = session()
    const { store } = placing

    placeReferences(placing, [screen("ledgerly")])
    deleteSelection(placing)

    expect(store.getReferences()).toEqual([])
    store.undo()
    expect(store.getReferences().map(({ reference }) => reference.app)).toEqual(["Ledgerly"])
  })
})
