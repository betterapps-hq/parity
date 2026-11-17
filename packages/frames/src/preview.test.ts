import { Window } from "happy-dom"
import { describe, expect, it } from "vite-plus/test"
import { tokenPreviewCss, updatesItself } from "./preview.ts"

describe("tokenPreviewCss (PAR-1264)", () => {
  const tokens = [
    { name: "primary", theme: "default", value: "#ff0000" },
    { name: "primary", theme: "dark", value: "#880000" },
    { name: "radius", theme: "default", value: "1rem" }
  ]

  // `primary` has a dark value of its own; `radius` has only its default, which dark inherits.
  const themes = new Map([
    ["primary", ["default", "dark"]],
    ["radius", ["default"]]
  ])

  it("declares a default value on a copy's roots without the class of a theme the token has its own value in", () => {
    expect(tokenPreviewCss(tokens, themes, "copy")).toBe(
      [
        ":host(:not(.dark)), [data-copy-root]:not(.dark), [data-canvas-body]:not(.dark) { --primary: #ff0000; }",
        ":host(.dark), [data-copy-root].dark, [data-canvas-body].dark { --primary: #880000; }",
        ":host, [data-copy-root], [data-canvas-body] { --radius: 1rem; }"
      ].join("\n")
    )
  })

  it("declares them on the live page's root, a default-only token in every theme", () => {
    expect(tokenPreviewCss(tokens, themes, "page")).toBe(
      ":root:not(.dark) { --primary: #ff0000; }\n:root.dark { --primary: #880000; }\n:root { --radius: 1rem; }"
    )
  })

  it("leaves out a value that would end its declaration and a theme that isn't a class", () => {
    expect(
      tokenPreviewCss(
        [
          { name: "primary", theme: "default", value: "red; } * { color: red" },
          { name: "primary", theme: '[data-theme="x"]', value: "red" }
        ],
        themes,
        "page"
      )
    ).toBe("")
  })

  it("is a real stylesheet a document takes", () => {
    const { document } = new Window()
    document.head.innerHTML = `<style>${tokenPreviewCss(tokens, themes, "page")}</style>`

    expect(document.styleSheets[0]?.cssRules).toHaveLength(3)
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
