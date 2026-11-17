import { describe, expect, it } from "vite-plus/test"
import { copyShadowStyle, throughCopyRoot } from "./freezer.ts"

const copy = { origin: "http://p1.localhost:5173" }
const css = "@media (prefers-color-scheme: dark) { :host { color: white } span { color: white } }"

describe("copyShadowStyle (PAR-1262)", () => {
  it("answers a shadow style's colour scheme for the mode, keeping its rules its own", () => {
    const dark = copyShadowStyle(copy, css, "dark")
    const light = copyShadowStyle(copy, css, "light")

    expect(dark).not.toContain("prefers-color-scheme")
    expect(dark).not.toContain("data-canvas-color-scheme")
    expect(dark).toContain(":host")
    expect(dark).toContain("min-width: 0px")
    expect(light).toContain("max-width: -1px")
  })
})

describe("throughCopyRoot (PAR-1262)", () => {
  it("finds the root's child body through the element around a copy's body", () => {
    expect(throughCopyRoot(":host > [data-canvas-body] { padding: 24px } :host(.x)>[data-canvas-body].y {}")).toBe(
      ":host > :where([data-copy-root]) > [data-canvas-body] { padding: 24px } :host(.x) > :where([data-copy-root]) > [data-canvas-body].y {}"
    )
  })
})
