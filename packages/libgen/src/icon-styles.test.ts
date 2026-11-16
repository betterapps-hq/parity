import { describe, expect, it } from "vite-plus/test"
import { type DrawIcon, styleModules, styleName } from "./icon-styles.ts"
import type { Live, LiveObject } from "./live.ts"

/** What each icon component draws, as the fake renderer below draws it. */
const drawings = new Map<Live, string>()

/** An icon component that draws `markup`. */
function icon(markup: string) {
  const component = () => null
  drawings.set(component, markup)

  return component
}

const draw: DrawIcon = (component) => drawings.get(component)

/** A module of icons, each drawn as its name and `style`. */
const iconsIn = (style: string, names: string[]) =>
  Object.fromEntries(names.map((name) => [name, icon(`<svg ${style}>${name}</svg>`)]))

const names = ["AcademicCapIcon", "BellIcon", "CogIcon", "HeartIcon"]

describe("styleModules", () => {
  it("finds styles kept in modules of their own, named by their paths, in the package's order", async () => {
    const outline = iconsIn("outline", names)

    const modules = new Map<string, LiveObject>([
      ["@heroicons/react/16/solid", iconsIn("solid16", names.slice(0, 3))],
      ["@heroicons/react/20/solid", iconsIn("solid20", names)],
      ["@heroicons/react/24/outline", outline],
      ["@heroicons/react/24/solid", iconsIn("solid24", names)]
    ])

    const load = async (specifier: string) => {
      const module = modules.get(specifier)

      if (!module) {
        throw new Error(`Can't find ${specifier}`)
      }

      return module
    }

    const entries = [".", "./package.json", "./outline", "./16/solid", "./16/solid/*", "./20/solid", "./24/outline"]
    expect(
      await styleModules("@heroicons/react", [...entries, "./24/solid"], "@heroicons/react/24/outline", load, draw)
    ).toEqual({
      "16 Solid": "@heroicons/react/16/solid",
      "20 Solid": "@heroicons/react/20/solid",
      "24 Outline": "@heroicons/react/24/outline",
      "24 Solid": "@heroicons/react/24/solid"
    })
  })

  it("passes over other ways in to the same icons, and modules of other things", async () => {
    const main = iconsIn("regular", names)

    const modules = new Map<string, LiveObject>([
      ["icons", main],
      ["icons/ssr", iconsIn("regular", names)],
      ["icons/lib", { ...main }],
      ["icons/dynamic", { DynamicIcon: icon("<svg />") }]
    ])

    const load = async (specifier: string) => modules.get(specifier) ?? Promise.reject(new Error("no"))
    const entries = ["./ssr", "./lib", "./dynamic", "./fonts"]
    expect(await styleModules("icons", entries, "icons", load, draw)).toBeUndefined()
  })

  it("names a default module that isn't one of the listed paths Default", async () => {
    const modules = new Map<string, LiveObject>([
      ["icons", iconsIn("outline", names)],
      ["icons/solid", iconsIn("solid", names)]
    ])

    const load = async (specifier: string) => modules.get(specifier)!
    expect(await styleModules("icons", ["./solid"], "icons", load, draw)).toEqual({
      Default: "icons",
      Solid: "icons/solid"
    })
  })
})

describe("styleName", () => {
  it("reads each part of a module's path as a word", () => {
    expect(styleName("24/outline")).toBe("24 Outline")
    expect(styleName("duo-tone")).toBe("Duo Tone")
  })
})
