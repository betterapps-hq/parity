import { Window } from "happy-dom"
import { describe, expect, it } from "vite-plus/test"
import { tokenPreviewCss, updatesItself } from "./preview.ts"

describe("tokenPreviewCss (PAR-1264)", () => {
  const tokens = [
    { name: "primary", theme: "default", value: "#ff0000" },
    { name: "primary", theme: "dark", value: "#880000" },
    { name: "radius", theme: "default", value: "1rem" }
  ]

  it("declares a default value on a copy's roots without a theme's class, and a theme's where its class is", () => {
    expect(tokenPreviewCss(tokens, ["default", "dark"], "copy")).toBe(
      [
        ":host(:not(.dark)), [data-copy-root]:not(.dark), [data-canvas-body]:not(.dark) { --primary: #ff0000; --radius: 1rem; }",
        ":host(.dark), [data-copy-root].dark, [data-canvas-body].dark { --primary: #880000; }"
      ].join("\n")
    )
  })

  it("declares them on the live page's root", () => {
    expect(tokenPreviewCss(tokens, ["default", "dark"], "page")).toBe(
      ":root:not(.dark) { --primary: #ff0000; --radius: 1rem; }\n:root.dark { --primary: #880000; }"
    )
    expect(tokenPreviewCss(tokens.slice(2), ["default"], "page")).toBe(":root { --radius: 1rem; }")
  })

  it("leaves out a value that would end its declaration and a theme that isn't a class", () => {
    expect(
      tokenPreviewCss(
        [
          { name: "primary", theme: "default", value: "red; } * { color: red" },
          { name: "primary", theme: '[data-theme="x"]', value: "red" }
        ],
        ["default"],
        "page"
      )
    ).toBe("")
  })

  it("is a real stylesheet a document takes", () => {
    const { document } = new Window()
    document.head.innerHTML = `<style>${tokenPreviewCss(tokens, ["default", "dark"], "page")}</style>`

    expect(document.styleSheets[0]?.cssRules).toHaveLength(2)
  })
})

describe("updatesItself (PAR-1264)", () => {
  it("holds for Next's pages, which take its hot updates, and no other", () => {
    expect(updatesItself("nextjs")).toBe(true)
    expect(updatesItself("tanstack-router")).toBe(false)
    expect(updatesItself(null)).toBe(false)
    expect(updatesItself(undefined)).toBe(false)
  })
})
