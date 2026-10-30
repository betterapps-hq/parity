import { describe, expect, it } from "vite-plus/test"
import { defaultModeSettings, parseModeSettings, resolveModes, uniqueId } from "./modes.ts"

describe("default modes", () => {
  it("are desktop light, desktop dark, tablet light and mobile light", () => {
    const modes = resolveModes(defaultModeSettings)
    expect(modes.map((mode) => [mode.name, mode.width, mode.viewport, mode.classNames])).toEqual([
      ["Desktop Light", 1280, "desktop", []],
      ["Desktop Dark", 1280, "desktop", ["dark"]],
      ["Tablet Light", 768, "tablet", []],
      ["Mobile Light", 390, "mobile", []]
    ])
  })

  it("fall back to a variable's first option and merge attributes", () => {
    const [mode] = resolveModes(defaultModeSettings)
    expect(mode?.attributes).toEqual({ lang: "en", dir: "ltr" })
  })

  it("round-trip through the parser", () => {
    expect(parseModeSettings(JSON.parse(JSON.stringify(defaultModeSettings)))).toEqual(defaultModeSettings)
  })
})

describe("parseModeSettings", () => {
  it("rejects a mode that picks an option a variable doesn't have", () => {
    const settings = structuredClone(defaultModeSettings) as unknown as { modes: { values: object }[] }
    settings.modes[0]!.values = { theme: "sepia" }
    expect(() => parseModeSettings(settings)).toThrow('/modes/0/values/theme: "sepia" is not an option of Theme')
  })
})

describe("uniqueId", () => {
  it("slugs names and avoids ids in use", () => {
    expect(uniqueId("Desktop Dark", [])).toBe("desktop-dark")
    expect(uniqueId("Desktop Dark", ["desktop-dark"])).toBe("desktop-dark-2")
  })
})
