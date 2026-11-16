import { type ContainerSpec, defaultModeSettings, emptyDocument } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { updateContainer } from "./callers.ts"
import { containerEntries, containerEntry, noteEntries } from "./lookups.ts"
import { createProjectDoc } from "./project-doc.ts"
import { plainProvider } from "./testing/plain-provider.ts"

const design = (id: string): ContainerSpec => ({
  id,
  name: id,
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", children: [] }
})

describe("lookups", () => {
  it("keep each entry while its design is the same object, and the list while every entry is", () => {
    const doc = createProjectDoc(
      plainProvider.open({
        files: [
          {
            path: "app.par",
            document: {
              ...emptyDocument(),
              containers: [design("a"), design("b")],
              notes: [{ id: "n", text: "Note", position: { x: 0, y: 0 } }]
            }
          }
        ],
        main: "app.par",
        modes: defaultModeSettings
      }),
      { undoLimit: 10, main: "app.par" }
    )

    const entries = containerEntries(doc)
    expect(containerEntries(doc)).toBe(entries)
    expect(entries.map((entry) => entry.key)).toEqual(["app.par#a", "app.par#b"])

    const notes = noteEntries(doc)
    updateContainer(doc, "app.par#a", "Rename", (container) => ({ ...container, name: "A" }))

    expect(containerEntries(doc)).not.toBe(entries)
    expect(containerEntry(doc, "app.par#b")).toBe(entries[1])
    expect(containerEntry(doc, "app.par#a")?.container.name).toBe("A")
    expect(noteEntries(doc)).toBe(notes)
  })
})
