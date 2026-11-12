import { describe, expect, it } from "vite-plus/test"
import { isNamedLength, nodeStyle, styleKeys } from "./model.ts"

describe("nodeStyle", () => {
  it("reads a style and leaves out what's set to undefined, as JSON does", () => {
    expect(nodeStyle.parse({ gap: 4, padding: [2, "gutter"], background: undefined })).toEqual({
      gap: 4,
      padding: [2, "gutter"]
    })
  })

  it("refuses a key it doesn't know", () => {
    expect(nodeStyle.safeParse({ colour: "red" }).success).toBe(false)
  })

  it("takes padding on all sides, per axis or per side, and no other list", () => {
    expect(nodeStyle.safeParse({ padding: 4 }).success).toBe(true)
    expect(nodeStyle.safeParse({ padding: [1, 2] }).success).toBe(true)
    expect(nodeStyle.safeParse({ padding: [1, 2, 3, "gutter"] }).success).toBe(true)
    expect(nodeStyle.safeParse({ padding: [1, 2, 3] }).success).toBe(false)
  })

  it("takes a whole number or a token for zIndex", () => {
    expect(nodeStyle.safeParse({ zIndex: 10 }).success).toBe(true)
    expect(nodeStyle.safeParse({ zIndex: "z-modal" }).success).toBe(true)
    expect(nodeStyle.safeParse({ zIndex: 1.5 }).success).toBe(false)
  })

  it("lists its keys in the order panels show them", () => {
    expect(styleKeys.slice(0, 3)).toEqual(["display", "direction", "columns"])
    expect(styleKeys.at(-1)).toBe("lines")
  })
})

describe("isNamedLength", () => {
  it("tells a name from steps", () => {
    expect(isNamedLength("fill")).toBe(true)
    expect(isNamedLength(4)).toBe(false)
    expect(isNamedLength(undefined)).toBe(false)
  })
})
