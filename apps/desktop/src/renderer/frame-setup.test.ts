import { colorSchemeAttribute } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { frameSetup } from "./frame-setup.ts"

const themes = { dark: { "data-theme": "dark" } }

const phone = {
  classNames: ["dark"],
  attributes: { "data-density": "compact" },
  viewport: { width: 390, height: 844 },
  globals: { theme: "dark", viewport: "mobile" },
  touch: true as const
}

describe("frameSetup", () => {
  it("gives the body the mode's classes, and the attributes that switch its themes on", () => {
    const { environment } = frameSetup(phone, themes)

    expect(environment.classNames).toEqual(["dark"])
    expect(environment.attributes).toEqual({
      [colorSchemeAttribute]: "dark",
      "data-theme": "dark",
      "data-density": "compact"
    })
  })

  it("has the frame and its code measure the mode's window", () => {
    const { environment, options } = frameSetup(phone, themes)

    expect(environment.viewport).toEqual({ width: 390, height: 844 })
    expect(options.viewport).toEqual({ width: 390, height: 844 })
  })

  it("passes the mode's options to decorators, and thin scrollbars to a phone's frame", () => {
    const { environment, options } = frameSetup(phone, themes)

    expect(options.globals).toEqual({ theme: "dark", viewport: "mobile" })
    expect(environment.touch).toBe(true)
  })

  it("leaves out what a desktop mode without options doesn't have", () => {
    const { environment, options } = frameSetup(
      { classNames: [], attributes: {}, viewport: { width: 1280, height: 800 } },
      themes
    )

    expect(environment).toEqual({
      classNames: [],
      attributes: { [colorSchemeAttribute]: "light" },
      viewport: { width: 1280, height: 800 }
    })
    expect(options).toEqual({ viewport: { width: 1280, height: 800 } })
  })

  it("adopts the sheets it's given after the project's", () => {
    // SAFETY: the sheet is only passed along, so any object stands in for one outside a browser.
    const sheet = {} as CSSStyleSheet

    expect(frameSetup(phone, themes, [sheet]).environment.sheets).toEqual([sheet])
    expect(frameSetup(phone, themes, []).environment.sheets).toBeUndefined()
  })
})
