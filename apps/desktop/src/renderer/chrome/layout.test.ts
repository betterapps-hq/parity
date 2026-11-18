import { describe, expect, it } from "vite-plus/test"
import { lensLayoutOf, readLayout, saveLensLayout } from "./layout.ts"

describe("the saved panel layout", () => {
  it("reads back as it was saved", () => {
    const saved = {
      left: false,
      right: true,
      leftWidth: 300,
      rightWidth: 400,
      leftTab: "assets",
      console: true,
      consoleHeight: 320,
      bottomTab: "@parity-app/extension-storybook",
      lenses: { "D:/work/app": { groups: [{ where: "main", tabs: ["pages"] }] } }
    }

    expect(readLayout(saved)).toEqual(saved)
  })

  it("puts a width that doesn't read, or is past the panel's limits, back to its default and keeps the rest", () => {
    expect(readLayout({ left: false, leftWidth: "wide", rightWidth: 9000, consoleHeight: 20, lenses: [] })).toEqual({
      left: false,
      right: true,
      leftWidth: 256,
      rightWidth: 320,
      console: false,
      consoleHeight: 240,
      bottomTab: "console",
      lenses: {}
    })
  })

  it("is the default layout when nothing was saved or it isn't a layout", () => {
    // The console starts closed (PAR-147).
    const defaults = {
      left: true,
      right: true,
      leftWidth: 256,
      rightWidth: 320,
      console: false,
      consoleHeight: 240,
      bottomTab: "console",
      lenses: {}
    }

    expect(readLayout(undefined)).toEqual(defaults)
    expect(readLayout(null)).toEqual(defaults)
  })
})

describe("each project's lens layout", () => {
  const layout = (lens: string) => ({ groups: [{ where: "main" as const, tabs: [lens], open: lens }], focus: 0 })

  it("is kept by the project's root, and read back as the project opens", () => {
    saveLensLayout("D:/work/app", layout("pages"))
    saveLensLayout("D:/work/site", layout("screens"))

    expect(lensLayoutOf("D:/work/app")).toEqual(layout("pages"))
    expect(lensLayoutOf("D:/work/site")).toEqual(layout("screens"))
    expect(lensLayoutOf("D:/work/other")).toBeUndefined()
  })

  it("keeps the 50 projects saved most recently", () => {
    for (let n = 0; n < 51; n++) {
      saveLensLayout(`D:/work/${n}`, layout("pages"))
    }

    // The first saved again counts as recent.
    saveLensLayout("D:/work/1", layout("stories"))
    saveLensLayout("D:/work/51", layout("pages"))

    expect(lensLayoutOf("D:/work/0")).toBeUndefined()
    expect(lensLayoutOf("D:/work/2")).toBeUndefined()
    expect(lensLayoutOf("D:/work/1")).toEqual(layout("stories"))
    expect(lensLayoutOf("D:/work/51")).toEqual(layout("pages"))
  })
})
