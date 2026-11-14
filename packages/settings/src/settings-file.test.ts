import { describe, expect, it } from "vite-plus/test"
import { defaultSettings, settingsChange } from "./app-settings.ts"
import { changedSettings, changeSettings, readSettings } from "./settings-file.ts"

describe("reading settings.json", () => {
  it("gives the defaults when there's no file", () => {
    expect(readSettings(undefined)).toEqual({ values: defaultSettings, badValues: [], extensions: {} })
  })

  it("reads each saved setting, and the rest at their defaults", () => {
    const read = readSettings(JSON.stringify({ theme: "light", exportSizes: [{ format: "jpg", scale: 3 }] }))

    expect(read.values).toEqual({ ...defaultSettings, theme: "light", exportSizes: [{ format: "jpg", scale: 3 }] })
    expect(read.badValues).toEqual([])
  })

  it("puts one value that doesn't read at its default without resetting the rest", () => {
    const read = readSettings(JSON.stringify({ theme: "sepia", snapping: false }))

    expect(read.values).toEqual({ ...defaultSettings, snapping: false })
    expect(read.badValues).toEqual(["theme"])
  })

  it("passes over keys it doesn't know", () => {
    expect(readSettings(JSON.stringify({ somethingNewer: 1 })).values).toEqual(defaultSettings)
  })

  it("says why a file that isn't JSON couldn't be read", () => {
    const read = readSettings("{ theme: ")

    expect(read.values).toEqual(defaultSettings)
    expect(read.problem).toMatch(/^settings.json isn't JSON/)
  })

  it("says why a file that isn't an object couldn't be read", () => {
    expect(readSettings("[]").problem).toBe("settings.json isn't an object of settings.")
  })
})

describe("changing settings.json", () => {
  it("writes only the settings changed", () => {
    expect(JSON.parse(changeSettings(undefined, { theme: "light" }))).toEqual({ theme: "light" })
  })

  it("keeps every key it doesn't change, including ones it doesn't know", () => {
    const text = JSON.stringify({ snapping: false, somethingNewer: { a: 1 } })

    expect(JSON.parse(changeSettings(text, { theme: "system" }))).toEqual({
      snapping: false,
      somethingNewer: { a: 1 },
      theme: "system"
    })
  })

  it("takes a setting out to put it back to its default", () => {
    expect(JSON.parse(changeSettings(JSON.stringify({ theme: "light", snapping: false }), { theme: null }))).toEqual({
      snapping: false
    })
  })

  it("refuses to write over text that doesn't parse", () => {
    expect(() => changeSettings("{ half", { theme: "light" })).toThrow(/isn't JSON/)
  })
})

describe("a change from a window", () => {
  it("reads values and resets", () => {
    expect(settingsChange.safeParse({ theme: "light", snapping: null }).success).toBe(true)
  })

  it("refuses a value that doesn't read, rather than putting it at its default", () => {
    expect(settingsChange.safeParse({ theme: "sepia" }).success).toBe(false)
  })

  it("refuses a setting there isn't", () => {
    expect(settingsChange.safeParse({ endpoint: "https://example.com" }).success).toBe(false)
  })
})

describe("what changed", () => {
  it("gives the settings whose values differ, with their new values", () => {
    const after = {
      ...defaultSettings,
      theme: "light" as const,
      exportSizes: [{ format: "jpg" as const, scale: 1 as const }]
    }

    expect(changedSettings(defaultSettings, after)).toEqual({ theme: "light", exportSizes: after.exportSizes })
    expect(changedSettings(defaultSettings, { ...defaultSettings })).toEqual({})
  })
})

describe("extensions' settings in settings.json", () => {
  it("reads each extension's settings unchecked, leaving out one that isn't an object", () => {
    const text = JSON.stringify({ extensions: { storybook: { openIn: "parity", later: [1] }, broken: 3 } })

    expect(readSettings(text).extensions).toEqual({ storybook: { openIn: "parity", later: [1] } })
  })

  it("reads none from an extensions entry that isn't an object", () => {
    expect(readSettings(JSON.stringify({ extensions: [] })).extensions).toEqual({})
  })

  it("sets one key and keeps the extension's others and other extensions'", () => {
    const text = JSON.stringify({ theme: "light", extensions: { storybook: { a: 1 }, tailwind: { b: true } } })

    expect(JSON.parse(changeSettings(text, { extensions: { storybook: { openIn: "parity" } } }))).toEqual({
      theme: "light",
      extensions: { storybook: { a: 1, openIn: "parity" }, tailwind: { b: true } }
    })
  })

  it("takes a key out with null, and the extension and the entry when they're left empty", () => {
    const text = JSON.stringify({ extensions: { storybook: { openIn: "parity" } } })

    expect(JSON.parse(changeSettings(text, { extensions: { storybook: { openIn: null } } }))).toEqual({})
  })

  it("isn't a change a window's settings change can carry", () => {
    expect(settingsChange.safeParse({ extensions: { storybook: { openIn: "parity" } } }).success).toBe(false)
  })
})
