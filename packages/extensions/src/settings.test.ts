import type { SettingContribution } from "@parity-app/extension-api"
import { describe, expect, it } from "vite-plus/test"
import { changedValues, defaultOf, fits, readExtensionSettings, storedKey } from "./settings.ts"

const declared = {
  "storybook.configDir": { type: "string", default: ".storybook", scope: "project", title: "Config folder" },
  "storybook.openIn": {
    type: "string",
    enum: ["browser", "parity"],
    enumTitles: ["Your browser", "Parity's browser"],
    default: "browser",
    scope: "app",
    title: "Open stories in"
  }
} satisfies Record<string, SettingContribution>

describe("extensions' settings", () => {
  it("keeps a setting by its key after the prefix", () => {
    expect(storedKey("storybook", "storybook.configDir")).toBe("configDir")
  })

  it("reads each setting from its own scope's values, and the rest at their defaults", () => {
    expect(readExtensionSettings("storybook", declared, { project: { configDir: "docs/.storybook" } })).toEqual({
      values: { "storybook.configDir": "docs/.storybook", "storybook.openIn": "browser" },
      problems: []
    })

    // A project can't set an app setting, nor the person a project one.
    expect(
      readExtensionSettings("storybook", declared, {
        app: { configDir: "elsewhere" },
        project: { openIn: "parity" }
      }).values
    ).toEqual({ "storybook.configDir": ".storybook", "storybook.openIn": "browser" })
  })

  it("puts a value that doesn't fit at its default, with a note", () => {
    const read = readExtensionSettings("storybook", declared, { app: { openIn: "tab" } })

    expect(read.values["storybook.openIn"]).toBe("browser")
    expect(read.problems).toEqual(["Open stories in is set to \"tab\", which it can't take, so it's at its default."])
  })

  it("takes a value only of its type, and one of its choices when it has them", () => {
    expect(fits({ type: "number", scope: "app", title: "N" }, 3)).toBe(true)
    expect(fits({ type: "number", scope: "app", title: "N" }, "3")).toBe(false)
    expect(fits({ type: "boolean", scope: "app", title: "On" }, false)).toBe(true)
    expect(fits(declared["storybook.openIn"], "parity")).toBe(true)
    expect(fits(declared["storybook.openIn"], "tab")).toBe(false)
  })

  it("defaults to the first choice, or the type's empty value, without a default", () => {
    expect(defaultOf({ type: "string", enum: ["a", "b"], scope: "app", title: "Pick" })).toBe("a")
    expect(defaultOf({ type: "number", scope: "app", title: "N" })).toBe(0)
    expect(defaultOf({ type: "boolean", scope: "app", title: "On" })).toBe(false)
  })

  it("names only the values that changed", () => {
    expect(changedValues({ a: 1, b: "x" }, { a: 1, b: "y" })).toEqual({ b: "y" })
  })
})
