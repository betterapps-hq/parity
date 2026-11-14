import { type CanvasDocument, defaultModeSettings } from "@parity-app/core"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { getPreferences, setPreferences } from "./chrome/preferences.ts"
import { DesignStore } from "./design-store.ts"
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

  const store = new DesignStore(documents, defaultModeSettings, "app.par", {
    saveDocument: async (path) => {
      writes.push(path)
    },
    autosave: () => false
  })

  return { store, writes }
}

afterEach(() => {
  resetWindowStores()
})

describe("a project's settings", () => {
  it("are each an undo step on the main file, saved with it", async () => {
    const { store, writes } = open([{ path: "app.par", document: { version: 4, containers: [] } }])

    setProjectPreference({ key: "snapping", value: false }, store)
    setProjectExtensionSetting("storybook", "configDir", "web/.storybook", store)

    expect(store.getMainDocument()).toMatchObject({
      preferences: { snapping: false },
      extensions: { storybook: { configDir: "web/.storybook" } }
    })
    expect(store.getHistory().undoLabel).toBe("Set storybook configDir")
    expect(store.unsavedPaths()).toEqual(["app.par"])

    store.undo()
    expect(store.getMainDocument()?.extensions).toBeUndefined()
    store.redo()

    await store.flush()
    expect(writes).toEqual(["app.par"])
    expect(store.hasUnsaved()).toBe(false)

    clearProjectPreference("snapping", store)
    clearProjectExtensionSetting("storybook", "configDir", store)
    expect(store.getMainDocument()).toEqual({ version: 4, containers: [] })
  })

  it("make the main file when the project has none yet", () => {
    const { store } = open()
    setProjectPreference({ key: "autosave", value: true }, store)

    expect(store.getMainDocument()).toEqual({ version: 4, containers: [], preferences: { autosave: true } })
  })

  it("leave the history alone when clearing what the project doesn't set", () => {
    const { store } = open([{ path: "app.par", document: { version: 4, containers: [] } }])
    clearProjectPreference("layoutGrid", store)
    clearProjectExtensionSetting("storybook", "configDir", store)

    expect(store.getHistory().canUndo).toBe(false)
  })
})

describe("the preferences in effect", () => {
  it("are the person's, with the project's own over them", () => {
    const { store } = open()
    setPreferences({ snapping: true, layoutGrid: false })
    const before = getEffectivePreferences(store)

    expect(before).toBe(getEffectivePreferences(store))
    expect(before.snapping).toBe(true)

    setProjectPreference({ key: "snapping", value: false }, store)
    expect(getEffectivePreferences(store).snapping).toBe(false)
    expect(getEffectivePreferences(undefined).snapping).toBe(true)
  })

  it("change where they take effect: the project's own value when it sets one, else the person's", () => {
    const { store } = open()
    setProjectPreference({ key: "snapping", value: false }, store)

    setEffectivePreference({ key: "snapping", value: true }, store)
    expect(store.getMainDocument()?.preferences).toEqual({ snapping: true })

    setEffectivePreference({ key: "layoutGrid", value: true }, store)
    expect(getPreferences().layoutGrid).toBe(true)
    expect(store.getMainDocument()?.preferences).toEqual({ snapping: true })
  })
})
