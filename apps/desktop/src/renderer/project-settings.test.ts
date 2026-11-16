import type { CanvasDocument } from "@parity-app/core"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { getPreferences, setPreferences } from "./chrome/preferences.ts"
import { openTestSession } from "./doc-fixtures.ts"
import {
  clearProjectExtensionSetting,
  clearProjectPreference,
  getEffectivePreferences,
  setEffectivePreference,
  setProjectExtensionSetting,
  setProjectPreference
} from "./project-settings.ts"
import { resetWindowStores } from "./store.ts"

function open(documents: { path: string; document: CanvasDocument }[] = []) {
  const writes: string[] = []

  const { doc, saver } = openTestSession(documents, {
    main: "app.par",
    saveDocument: async (path) => {
      writes.push(path)
    }
  })

  return { doc, saver, writes }
}

afterEach(() => {
  resetWindowStores()
})

describe("a project's settings", () => {
  it("are each an undo step on the main file, saved with it", async () => {
    const { doc, saver, writes } = open([{ path: "app.par", document: { version: 4, containers: [] } }])

    setProjectPreference({ key: "snapping", value: false }, doc)
    setProjectExtensionSetting("storybook", "configDir", "web/.storybook", doc)

    expect(doc.file(doc.main)).toMatchObject({
      preferences: { snapping: false },
      extensions: { storybook: { configDir: "web/.storybook" } }
    })
    expect(doc.history().undo[0]).toBe("Set storybook configDir")
    expect(saver.unsaved()).toEqual(["app.par"])

    doc.undo()
    expect(doc.file(doc.main)?.extensions).toBeUndefined()
    doc.redo()

    await saver.flush()
    expect(writes).toEqual(["app.par"])
    expect(saver.hasUnsaved()).toBe(false)

    clearProjectPreference("snapping", doc)
    clearProjectExtensionSetting("storybook", "configDir", doc)
    expect(doc.file(doc.main)).toEqual({ version: 4, containers: [] })
  })

  it("make the main file when the project has none yet", () => {
    const { doc } = open()
    setProjectPreference({ key: "autosave", value: true }, doc)

    expect(doc.file(doc.main)).toEqual({ version: 4, containers: [], preferences: { autosave: true } })
  })

  it("leave undo alone when clearing what the project doesn't set", () => {
    const { doc } = open([{ path: "app.par", document: { version: 4, containers: [] } }])
    clearProjectPreference("layoutGrid", doc)
    clearProjectExtensionSetting("storybook", "configDir", doc)

    expect(doc.history().canUndo).toBe(false)
  })
})

describe("the preferences in effect", () => {
  it("are the person's, with the project's own over them", () => {
    const { doc } = open()
    setPreferences({ snapping: true, layoutGrid: false })
    const before = getEffectivePreferences(doc)

    expect(before).toBe(getEffectivePreferences(doc))
    expect(before.snapping).toBe(true)

    setProjectPreference({ key: "snapping", value: false }, doc)
    expect(getEffectivePreferences(doc).snapping).toBe(false)
    expect(getEffectivePreferences(undefined).snapping).toBe(true)
  })

  it("change where they take effect: the project's own value when it sets one, else the person's", () => {
    const { doc } = open()
    setProjectPreference({ key: "snapping", value: false }, doc)

    setEffectivePreference({ key: "snapping", value: true }, doc)
    expect(doc.file(doc.main)?.preferences).toEqual({ snapping: true })

    setEffectivePreference({ key: "layoutGrid", value: true }, doc)
    expect(getPreferences().layoutGrid).toBe(true)
    expect(doc.file(doc.main)?.preferences).toEqual({ snapping: true })
  })
})
