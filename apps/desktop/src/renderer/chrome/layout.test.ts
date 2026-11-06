import { describe, expect, it } from "vite-plus/test"
import { readLayout } from "./layout.ts"

describe("the saved panel layout", () => {
  it("reads back as it was saved", () => {
    const saved = { left: false, right: true, leftWidth: 300, rightWidth: 400, leftTab: "assets" }
    expect(readLayout(JSON.stringify(saved))).toEqual(saved)
  })

  it("puts a width that doesn't read, or is past the panel's limits, back to its default and keeps the rest", () => {
    expect(readLayout(JSON.stringify({ left: false, leftWidth: "wide", rightWidth: 9000 }))).toEqual({
      left: false,
      right: true,
      leftWidth: 256,
      rightWidth: 320
    })
  })

  it("is the default layout when nothing was saved or it isn't a layout", () => {
    const defaults = { left: true, right: true, leftWidth: 256, rightWidth: 320 }
    expect(readLayout(null)).toEqual(defaults)
    expect(readLayout("null")).toEqual(defaults)
  })
})
