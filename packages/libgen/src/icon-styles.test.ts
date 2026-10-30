import { describe, expect, it } from "vitest"
import { styleModules, styleName } from "./icon-styles.ts"

/** An icon component that draws `markup`, as the fake renderer below draws it. */
const icon = (markup: string) => Object.assign(() => null, { markup })
const draw = (component: unknown) => (component as { markup?: string }).markup

/** A module of icons, each drawn as its name and `style`. */
const iconsIn = (style: string, names: string[]) =>
  Object.fromEntries(names.map((name) => [name, icon(`<svg ${style}>${name}</svg>`)]))

const names = ["AcademicCapIcon", "BellIcon", "CogIcon", "HeartIcon"]

describe("styleModules", () => {
  it("finds styles kept in modules of their own, named by their paths, in the package's order", async () => {
    const outline = iconsIn("outline", names)
    const modules: Record<string, Record<string, unknown>> = {
      "@heroicons/react/16/solid": iconsIn("solid16", names.slice(0, 3)),
      "@heroicons/react/20/solid": iconsIn("solid20", names),
      "@heroicons/react/24/outline": outline,
      "@heroicons/react/24/solid": iconsIn("solid24", names)
    }
    const load = async (specifier: string) => {
      const module = modules[specifier]
      if (!module) throw new Error(`Can't find ${specifier}`)
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
    const modules: Record<string, Record<string, unknown>> = {
      icons: main,
      "icons/ssr": iconsIn("regular", names),
      "icons/lib": { ...main },
      "icons/dynamic": { DynamicIcon: icon("<svg />") }
    }
    const load = async (specifier: string) => modules[specifier] ?? Promise.reject(new Error("no"))
    const entries = ["./ssr", "./lib", "./dynamic", "./fonts"]
    expect(await styleModules("icons", entries, "icons", load, draw)).toBeUndefined()
  })

  it("names a default module that isn't one of the listed paths Default", async () => {
    const modules: Record<string, Record<string, unknown>> = {
      icons: iconsIn("outline", names),
      "icons/solid": iconsIn("solid", names)
    }
    const load = async (specifier: string) => modules[specifier]!
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
