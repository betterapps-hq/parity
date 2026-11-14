import { describe, expect, it } from "vite-plus/test"
import { readPreferences } from "./preferences.ts"

const defaults = {
  theme: "dark",
  snapping: true,
  exportSizes: [{ format: "png", scale: 2 }],
  componentsView: "list",
  layoutGrid: false,
  autosave: false,
  performanceStats: false,
  codeEditor: "auto"
}

describe("saved preferences", () => {
  it("read back as they were saved", () => {
    const saved = {
      ...defaults,
      theme: "light",
      exportSizes: [
        { format: "png", scale: 1 },
        { format: "jpg", scale: 3 }
      ],
      autosave: true,
      codeEditor: "zed",
      componentsView: "grid"
    }

    expect(readPreferences(JSON.stringify(saved))).toEqual(saved)
  })

  it("put one value that doesn't read back to its default and keep the rest", () => {
    const saved = { theme: "light", exportSizes: [{ format: "webp", scale: 2 }], autosave: true }
    expect(readPreferences(JSON.stringify(saved))).toEqual({ ...defaults, theme: "light", autosave: true })
    expect(readPreferences(JSON.stringify({ theme: "sepia", snapping: false }))).toEqual({
      ...defaults,
      snapping: false
    })
  })

  it("leave out a setting that's gone, such as the old export scale", () => {
    const saved = { theme: "light", exportScale: 3 }
    expect(readPreferences(JSON.stringify(saved))).toEqual({ ...defaults, theme: "light" })
  })

  it("are the defaults when nothing was saved or what was saved isn't preferences", () => {
    expect(readPreferences(null)).toEqual(defaults)
    expect(readPreferences("{")).toEqual(defaults)
    expect(readPreferences("[true]")).toEqual(defaults)
  })
})
