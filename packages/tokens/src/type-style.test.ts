import { describe, expect, it } from "vite-plus/test"
import { typeStyleParts } from "./type-style.ts"

describe("a typography preset token's parts", () => {
  it("reads MUI's font shorthand: weight, size over line height, and the family after", () => {
    expect(typeStyleParts('300 6rem/1.167 "Roboto", "Helvetica", "Arial", sans-serif')).toEqual({
      weight: "300",
      size: "6rem",
      lineHeight: "1.167",
      family: '"Roboto", "Helvetica", "Arial", sans-serif'
    })
  })

  it("keeps a part that names another token as that token's var()", () => {
    expect(typeStyleParts("var(--weight-regular) var(--size-300)/var(--line-300) var(--family-base)")).toEqual({
      weight: "var(--weight-regular)",
      size: "var(--size-300)",
      lineHeight: "var(--line-300)",
      family: "var(--family-base)"
    })
  })

  it("reads italic, a size with no line height, and a family with spaces", () => {
    expect(typeStyleParts('italic bold 14px "Open Sans", serif')).toEqual({
      style: "italic",
      weight: "bold",
      size: "14px",
      family: '"Open Sans", serif'
    })
  })

  it("reads nothing from a value that isn't a shorthand", () => {
    expect(typeStyleParts("inherit")).toBeUndefined()
    expect(typeStyleParts("caption")).toBeUndefined()
  })
})
