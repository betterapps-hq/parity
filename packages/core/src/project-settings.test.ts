import { describe, expect, it } from "vite-plus/test"
import { type CanvasDocument, parseCanvasDocument } from "./document.ts"
import {
  clearExtensionSetting,
  clearPreferenceOverride,
  preferenceOverrides,
  setExtensionSetting,
  setPreferenceOverride,
  storybookConfigDir,
  withProjectPreferences
} from "./project-settings.ts"
import type { JsonValue } from "./schema.ts"

const empty: CanvasDocument = { version: 4, containers: [] }
const person = { theme: "dark", autosave: false, snapping: true, layoutGrid: false, exportSizes: [] }

/** The document as it's saved and read back. */
function roundTrip(document: CanvasDocument): CanvasDocument {
  return parseCanvasDocument(structuredClone(document))
}

describe("a project's own preferences", () => {
  it("are kept in the order they were set, and an update keeps its place", () => {
    let document = setPreferenceOverride(empty, { key: "layoutGrid", value: true })
    document = setPreferenceOverride(document, { key: "exportSizes", value: [{ format: "jpg", scale: 1 }] })
    document = setPreferenceOverride(document, { key: "autosave", value: true })
    document = setPreferenceOverride(document, { key: "layoutGrid", value: false })

    expect(preferenceOverrides(roundTrip(document))).toEqual([
      { key: "layoutGrid", value: false },
      { key: "exportSizes", value: [{ format: "jpg", scale: 1 }] },
      { key: "autosave", value: true }
    ])
  })

  it("leave the file as it was once the last is cleared", () => {
    const set = setPreferenceOverride(empty, { key: "snapping", value: false })
    const cleared = clearPreferenceOverride(set, "snapping")

    expect(cleared).toEqual(empty)
    expect(cleared).not.toHaveProperty("preferences")
    expect(clearPreferenceOverride(empty, "snapping")).toEqual(empty)
  })

  it("win over the person's while the project is open", () => {
    const document = setPreferenceOverride(empty, { key: "snapping", value: false })

    expect(withProjectPreferences(person, document)).toEqual({ ...person, snapping: false })
    expect(withProjectPreferences(person, empty)).toBe(person)
    expect(withProjectPreferences(person, undefined)).toBe(person)
  })

  it("are refused when a value isn't one the preference takes, or the preference isn't one a project sets", () => {
    const file = (preferences: JsonValue) => ({ version: 4, containers: [], preferences })

    expect(() => parseCanvasDocument(file({ autosave: "yes" }))).toThrow("/preferences/autosave")
    expect(() => parseCanvasDocument(file({ exportSizes: [] }))).toThrow("/preferences/exportSizes")
    expect(() => parseCanvasDocument(file({ exportSizes: [{ format: "gif", scale: 1 }] }))).toThrow(
      "/preferences/exportSizes/0/format"
    )
    expect(() => parseCanvasDocument(file({ theme: "light" }))).toThrow("/preferences")
  })
})

describe("extensions' project settings", () => {
  it("are kept by extension and key, and read back as they were saved", () => {
    const document = setExtensionSetting(empty, "storybook", "configDir", "apps/web/.storybook")

    expect(roundTrip(document).extensions).toEqual({ storybook: { configDir: "apps/web/.storybook" } })
    expect(storybookConfigDir(roundTrip(document))).toBe("apps/web/.storybook")
  })

  it("go when cleared, the extension with its last and the field with the last extension", () => {
    let document = setExtensionSetting(empty, "storybook", "configDir", ".config/storybook")
    document = setExtensionSetting(document, "linear", "team", "PAR")
    document = setExtensionSetting(document, "linear", "project", "Parity")

    expect(clearExtensionSetting(document, "linear", "team").extensions).toEqual({
      storybook: { configDir: ".config/storybook" },
      linear: { project: "Parity" }
    })

    const storybookLeft = clearExtensionSetting(clearExtensionSetting(document, "linear", "team"), "linear", "project")
    expect(storybookLeft.extensions).toEqual({ storybook: { configDir: ".config/storybook" } })
    expect(clearExtensionSetting(storybookLeft, "storybook", "configDir")).toEqual(empty)
  })

  it("read Storybook's folder as unset when the project leaves it, or sets something that isn't a folder", () => {
    expect(storybookConfigDir(empty)).toBeUndefined()
    expect(storybookConfigDir(setExtensionSetting(empty, "storybook", "configDir", "  "))).toBeUndefined()
    expect(storybookConfigDir(setExtensionSetting(empty, "storybook", "configDir", 3))).toBeUndefined()
  })
})

describe("a project file from before project settings", () => {
  it("reads without them, and saves without them", () => {
    const read = parseCanvasDocument({ version: 4, containers: [] })

    expect(preferenceOverrides(read)).toEqual([])
    expect(storybookConfigDir(read)).toBeUndefined()
    expect(JSON.stringify(read)).toBe('{"version":4,"containers":[]}')
  })
})
