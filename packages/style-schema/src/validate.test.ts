import { describe, expect, it } from "vite-plus/test"
import { uncheckedProperties, validate } from "./validate.ts"

describe("validate", () => {
  it.each([
    ["width", "10px"],
    ["width", "fit-content"],
    ["width", "calc(4 * 0.25rem)"],
    ["width", "min(100%, 20rem)"],
    ["width", "inherit"],
    ["margin", "revert-layer"],
    ["color", "oklch(0.5 0.1 20 / 50%)"],
    ["color", "#ff00"],
    ["color", "light-dark(red, blue)"],
    ["color", "color-mix(in oklab, red 20%, blue)"],
    ["background", "linear-gradient(to right, red, blue) center / cover no-repeat, #fff"],
    ["box-shadow", "0 1px 2px rgb(0 0 0 / 0.1), inset 0 0 0 1px red"],
    ["transition", "opacity 150ms ease-out, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)"],
    ["grid-template-columns", "repeat(3, minmax(0, 1fr))"],
    ["filter", "blur(4px) brightness(1.2)"],
    ["transform", "translate(10px, 20%) rotate(45deg)"],
    ["font-family", "Inter, system-ui, sans-serif"],
    ["border-radius", "calc(infinity * 1px)"],
    ["corner-shape", "squircle"],
    ["aspect-ratio", "16 / 9"],
    ["inset", "0 auto"],
    ["text-wrap", "balance"],
    ["align-self", "anchor-center"],
    ["flex", "1 1 0%"],
    ["line-height", "1.5"],
    ["opacity", "50%"],
    ["row-rule", "1px solid red"],
    ["-webkit-line-clamp", "3"],
    ["-webkit-box-orient", "vertical"],
    ["Z-Index", "10"]
  ])("takes %s: %s", (property, value) => {
    expect(validate(property, value)).toEqual({ valid: true })
  })

  it.each([
    ["width", "red"],
    ["color", "12px"],
    ["z-index", "1.5"],
    ["display", "flexx"],
    ["padding", "1px 2px 3px 4px 5px"],
    ["padding", "-4px"],
    ["opacity", "half"],
    ["width", ""]
  ])("refuses %s: %s", (property, value) => {
    expect(validate(property, value)).toMatchObject({ valid: false, problem: "value" })
  })

  it("gives the grammar a refused value didn't match", () => {
    expect(validate("flex-wrap", "sometimes")).toEqual({
      valid: false,
      problem: "value",
      syntax: "nowrap | [ wrap | wrap-reverse ] || balance"
    })
  })

  it("refuses a property the ledger doesn't hold", () => {
    expect(validate("colour", "red")).toEqual({ valid: false, problem: "property" })
    expect(validate("custom-property", "red")).toEqual({ valid: false, problem: "property" })
    // Deprecated, so not counted, though css-tree's own dictionary has it.
    expect(validate("clip", "auto")).toEqual({ valid: false, problem: "property" })
  })

  it("takes any value for a custom property, but not none", () => {
    expect(validate("--brand", "anything at all")).toEqual({ valid: true })
    expect(validate("--brand", " ")).toMatchObject({ valid: false, problem: "value" })
  })

  it("leaves a value with var() to be checked once its tokens are filled in", () => {
    expect(validate("width", "calc(var(--spacing) * 4)")).toEqual({ valid: true })
    expect(validate("color", "var(--primary)")).toEqual({ valid: true })
  })

  it("knows which properties it can't check", () => {
    // Each grammar names a type no spec gives a grammar for. A spec data update that changes the list shows here.
    expect(uncheckedProperties()).toEqual(["cursor", "custom-property"])
  })
})
