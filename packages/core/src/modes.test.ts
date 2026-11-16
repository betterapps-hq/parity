import { describe, expect, it } from "vite-plus/test"
import {
  defaultModeSettings,
  isTouchMode,
  type ModeSettings,
  modeAppearance,
  modeDevice,
  parseModeSettings,
  previewMode,
  type ResolvedMode,
  resolveModes,
  textDirection,
  uniqueId,
  type VariableOption,
  withPreviewGlobals
} from "./modes.ts"

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
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- settings are saved as JSON, so the test goes through it
    expect(parseModeSettings(JSON.parse(JSON.stringify(defaultModeSettings)))).toEqual(defaultModeSettings)
  })
})

describe("modeDevice", () => {
  it("takes a viewport's device, or else the one its width suggests, and phones and tablets are touch", () => {
    const settings: ModeSettings = {
      version: 1,
      variables: [
        {
          id: "viewport",
          name: "Viewport",
          kind: "viewport",
          options: [
            { id: "wide-phone", name: "Wide phone", width: 700, device: "phone" },
            { id: "narrow", name: "Narrow", width: 360 },
            { id: "laptop", name: "Laptop", width: 1280 }
          ]
        }
      ],
      modes: ["wide-phone", "narrow", "laptop"].map((id) => ({ id, name: id, values: { viewport: id } }))
    }

    const modes = resolveModes(settings)
    expect(modes.map(modeDevice)).toEqual(["phone", "phone", "laptop"])
    expect(modes.map(isTouchMode)).toEqual([true, true, false])
  })
})

describe("parseModeSettings", () => {
  it("rejects a mode that picks an option a variable doesn't have", () => {
    const settings = structuredClone(defaultModeSettings)
    settings.modes[0]!.values = { theme: "sepia" }
    expect(() => parseModeSettings(settings)).toThrow('/modes/0/values/theme: "sepia" is not an option of Theme')
  })
})

describe("previewMode", () => {
  const named = (settings: ModeSettings, appearance: "light" | "dark") =>
    previewMode(resolveModes(settings), appearance)?.id

  it("is the primary mode when it matches, else the matching one with its other options", () => {
    expect(named(defaultModeSettings, "light")).toBe("desktop-light")
    expect(named(defaultModeSettings, "dark")).toBe("desktop-dark")
  })

  it("keeps the primary mode's viewport over a matching mode listed first", () => {
    const settings: ModeSettings = {
      ...defaultModeSettings,
      modes: [
        { id: "desktop-light", name: "Desktop Light", values: { viewport: "desktop", theme: "light" } },
        { id: "mobile-dark", name: "Mobile Dark", values: { viewport: "mobile", theme: "dark" } },
        {
          id: "desktop-dark-ar",
          name: "Desktop Dark Arabic",
          values: { viewport: "desktop", theme: "dark", locale: "ar" }
        }
      ]
    }

    expect(named(settings, "dark")).toBe("desktop-dark-ar")
    // With no other mode on its viewport, the first that matches.
    settings.modes.pop()
    expect(named(settings, "dark")).toBe("mobile-dark")
  })

  it("is the primary mode when none matches or the project has no theme", () => {
    const lightOnly = { ...defaultModeSettings, modes: [defaultModeSettings.modes[0]!, defaultModeSettings.modes[2]!] }
    expect(named(lightOnly, "dark")).toBe("desktop-light")

    const noTheme: ModeSettings = {
      version: 1,
      variables: defaultModeSettings.variables.filter((variable) => variable.kind !== "theme"),
      modes: [{ id: "desktop", name: "Desktop", values: { viewport: "desktop" } }]
    }

    expect(named(noTheme, "dark")).toBe("desktop")
    expect(named({ ...noTheme, modes: [] }, "dark")).toBeUndefined()
  })

  it("reads a mode as dark by its theme option's id, name or class", () => {
    const theme = (option: VariableOption): ResolvedMode["options"] => [
      { variable: { id: "theme", name: "Theme", kind: "theme", options: [option] }, option }
    ]

    expect(modeAppearance({ options: theme({ id: "night", name: "Night", className: "theme-dark" }) })).toBe("dark")
    expect(modeAppearance({ options: theme({ id: "dark-blue", name: "Midnight" }) })).toBe("dark")
    expect(modeAppearance({ options: theme({ id: "darkest", name: "Darkest" }) })).toBe("light")
    expect(modeAppearance({ options: [] })).toBeUndefined()
  })
})

describe("uniqueId", () => {
  it("slugs names and avoids ids in use", () => {
    expect(uniqueId("Desktop Dark", [])).toBe("desktop-dark")
    expect(uniqueId("Desktop Dark", ["desktop-dark"])).toBe("desktop-dark-2")
  })
})

describe("withPreviewGlobals (PAR-105)", () => {
  const theme = { id: "theme", options: [{ id: "light" }, { id: "dark" }, { id: "dim", name: "Dim" }] }

  const locale = {
    id: "locale",
    name: "Language",
    options: [{ id: "en", name: "English" }, { id: "ar", name: "العربية" }, { id: "he" }, { id: "fr" }],
    initial: "fr"
  }

  it("adds the options a variable lacks after its own, which keep what they do", () => {
    const settings = withPreviewGlobals(defaultModeSettings, [theme])
    const variable = settings.variables.find(({ id }) => id === "theme")
    expect(variable?.options).toEqual([
      { id: "light", name: "Light" },
      { id: "dark", name: "Dark", className: "dark" },
      { id: "dim", name: "Dim" }
    ])
    expect(settings.modes).toEqual(defaultModeSettings.modes)
  })

  it("makes a global the project has no variable for a variable of its own, its starting option first", () => {
    const settings = withPreviewGlobals({ ...defaultModeSettings, variables: [] }, [locale])
    expect(settings.variables).toEqual([
      {
        id: "locale",
        name: "Language",
        kind: "locale",
        options: [
          { id: "fr", name: "fr", attributes: { lang: "fr", dir: "ltr" } },
          { id: "en", name: "English", attributes: { lang: "en", dir: "ltr" } },
          { id: "ar", name: "العربية", attributes: { lang: "ar", dir: "rtl" } },
          { id: "he", name: "he", attributes: { lang: "he", dir: "rtl" } }
        ]
      }
    ])
  })

  it("takes a custom kind and a capitalized name for a global it can't place, and passes over viewports", () => {
    const settings = withPreviewGlobals(defaultModeSettings, [
      { id: "density", options: [{ id: "comfortable" }, { id: "compact" }] },
      { id: "viewport", options: [{ id: "watch" }] }
    ])

    expect(settings.variables.at(-1)).toEqual({
      id: "density",
      name: "Density",
      kind: "custom",
      options: [
        { id: "comfortable", name: "comfortable" },
        { id: "compact", name: "compact" }
      ]
    })
    expect(settings.variables.find(({ id }) => id === "viewport")).toEqual(defaultModeSettings.variables[0])
  })

  it("gives the same settings back with no globals, and its result parses", () => {
    expect(withPreviewGlobals(defaultModeSettings, [])).toBe(defaultModeSettings)
    const settings = withPreviewGlobals(defaultModeSettings, [theme, locale])
    expect(parseModeSettings(structuredClone(settings))).toEqual(settings)
  })
})

describe("textDirection", () => {
  it("reads a tag's direction from Intl.Locale, and gives ltr for a tag it can't read", () => {
    expect(["ar", "he-IL", "fa", "en", "zh-Hant", "not a tag"].map(textDirection)).toEqual([
      "rtl",
      "rtl",
      "rtl",
      "ltr",
      "ltr",
      "ltr"
    ])
  })
})
