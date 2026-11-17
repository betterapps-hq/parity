import { type ContainerSpec, defaultModeSettings, emptyDocument } from "@parity-app/core"
import { withEditedText } from "@parity-app/editor"
import { describe, expect, it, vi } from "vite-plus/test"
import { typeInContainer } from "./callers.ts"
import { createProjectDoc } from "./project-doc.ts"
import { plainProvider } from "./testing/plain-provider.ts"

const home: ContainerSpec = {
  id: "home",
  name: "home",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", children: [{ type: "text", id: "title", text: "Sign in" }] },
  states: [
    { id: "default", name: "Default" },
    { id: "error", name: "Error", overrides: { title: { text: "Try again" } } }
  ]
}

function open() {
  const doc = createProjectDoc(
    plainProvider.open({
      files: [{ path: "app.par", document: { ...emptyDocument(), containers: [home] } }],
      main: "app.par",
      modes: defaultModeSettings
    }),
    { undoLimit: 10, main: "app.par" }
  )

  return { doc, transact: vi.spyOn(doc, "transact") }
}

describe("typing in a design (PAR-1238)", () => {
  it("writes the change typed in a layer's own text, not the whole text", () => {
    const { doc, transact } = open()
    typeInContainer(
      doc,
      "app.par#home",
      "Edit text",
      (container) => withEditedText(container, undefined, "title", "Sign in!", new Map()),
      { node: "title", splice: { start: 7, end: 7, insert: "!" } }
    )

    expect(transact.mock.calls[0]?.[1]).toEqual([
      { op: "editText", design: "app.par#home", node: "title", edit: { kind: "splice", at: 7, remove: 0, insert: "!" } }
    ])
  })

  it("writes a state's text whole, and a change that doesn't make what's typed as the whole text", () => {
    const { doc, transact } = open()
    typeInContainer(
      doc,
      "app.par#home",
      "Edit text",
      (container) => withEditedText(container, "error", "title", "Try again!", new Map()),
      { node: "title", splice: { start: 9, end: 9, insert: "!" } }
    )
    typeInContainer(
      doc,
      "app.par#home",
      "Edit text",
      (container) => withEditedText(container, undefined, "title", "Sign up", new Map()),
      { node: "title", splice: { start: 0, end: 0, insert: "?" } }
    )

    expect(transact.mock.calls[0]?.[1]).toMatchObject([{ op: "setDesign", path: ["states"] }])
    expect(transact.mock.calls[1]?.[1]).toEqual([
      { op: "editText", design: "app.par#home", node: "title", edit: { kind: "replace", text: "Sign up" } }
    ])
  })
})
