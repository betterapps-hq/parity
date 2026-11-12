import { describe, expect, it } from "vite-plus/test"
import type { CssDeclaration } from "./adapter.ts"
import { cssPrinter } from "./css.ts"
import { declarations } from "./declare.ts"
import type { NodeStyle } from "./model.ts"

const card = cssPrinter({ selector: ".card", themes: { dark: ".dark" } })

const padding = { property: "padding", value: "calc(var(--spacing) * 4)" }
const fill = { property: "background-color", value: "var(--primary)" }

describe("printing declarations as CSS", () => {
  it("writes a layer's declarations as one rule, in their order", () => {
    expect(card.print([padding, fill])).toEqual({
      output: ".card {\n  padding: calc(var(--spacing) * 4);\n  background-color: var(--primary);\n}\n",
      unwritten: []
    })
  })

  it("writes a state at the end of the selector, a viewport as @media and a theme as an ancestor", () => {
    const { output } = card.print([
      padding,
      { ...fill, when: { state: ":hover" } },
      { ...padding, when: { viewport: "48rem" } },
      { ...fill, when: { theme: "dark" } },
      { ...fill, when: { viewport: "48rem", theme: "dark", state: ":focus-visible" } }
    ])

    expect(output).toBe(
      [
        ".card {\n  padding: calc(var(--spacing) * 4);\n}",
        ".card:hover {\n  background-color: var(--primary);\n}",
        "@media (width >= 48rem) {\n  .card {\n    padding: calc(var(--spacing) * 4);\n  }\n}",
        ".card:where(.dark, .dark *) {\n  background-color: var(--primary);\n}",
        "@media (width >= 48rem) {\n  .card:focus-visible:where(.dark, .dark *) {\n    background-color: var(--primary);\n  }\n}"
      ].join("\n\n") + "\n"
    )
  })

  it("puts declarations for one place in one rule, wherever they come in the list", () => {
    const { output } = card.print([
      { ...padding, when: { state: ":hover" } },
      fill,
      { ...fill, when: { state: ":hover" } }
    ])

    expect(output).toBe(
      ".card:hover {\n  padding: calc(var(--spacing) * 4);\n  background-color: var(--primary);\n}\n\n" +
        ".card {\n  background-color: var(--primary);\n}\n"
    )
  })

  it("leaves out a declaration for a theme it has no selector for", () => {
    const sepia = { ...fill, when: { theme: "sepia" } }

    expect(card.print([sepia])).toEqual({ output: "", unwritten: [sepia] })
  })
})

describe("reading CSS back", () => {
  it("reads the rules for its selector, however they're spaced", () => {
    const css = ".card{padding:1px;color:red}\n.card:hover { gap: 0 }\n@media (min-width: 900px) { .card { gap: 2px } }"

    expect(card.read(css)).toEqual({
      declarations: [
        { property: "padding", value: "1px" },
        { property: "color", value: "red" },
        { property: "gap", value: "0", when: { state: ":hover" } },
        { property: "gap", value: "2px", when: { viewport: "900px" } }
      ],
      unread: ""
    })
  })

  it("keeps what isn't its own, or isn't plain declarations, as it was", () => {
    const css = [
      ".card { padding: 1px }",
      ".card-title { color: red }",
      ".card > p { margin: 0 }",
      ".card { color: red !important }",
      "@supports (display: grid) { .card { display: grid } }",
      "@media (width >= 48rem) { .card { gap: 0 } .other { gap: 1px } }",
      "@media (width >= 48rem) and (hover: hover) { .card { gap: 0 } }"
    ].join("\n")

    expect(card.read(css)).toEqual({
      declarations: [
        { property: "padding", value: "1px" },
        { property: "gap", value: "0", when: { viewport: "48rem" } }
      ],
      unread: [
        ".card-title{color:red}",
        ".card > p{margin:0}",
        ".card{color:red!important}",
        "@supports (display: grid){.card{display:grid}}",
        "@media (width >= 48rem){.other{gap:1px}}",
        "@media (width >= 48rem) and (hover: hover){.card{gap:0}}"
      ].join("\n")
    })
  })

  it("keeps text that isn't CSS", () => {
    expect(card.read("not css at all")).toEqual({ declarations: [], unread: "not css at all" })
  })
})

describe("round trips", () => {
  const styles: NodeStyle[] = [
    { direction: "row", gap: 4, padding: [2, 4], align: "center", justify: "between", wrap: true },
    { display: "grid", columns: 3, rowGap: 2, width: "fill", minWidth: 10, self: "end" },
    { position: "absolute", top: 0, zIndex: 10, opacity: 50, overflow: "scroll", radius: "radius-full" },
    { font: "font-sans", size: "text-lg", weight: 600, textTransform: "uppercase", lines: 2 },
    { shadow: [{ kind: "drop", x: 0, y: 4, blur: 12, spread: -2, color: { color: "foreground", alpha: 10 } }] },
    { transform: { x: 2, y: { percent: -50 }, rotate: 45 }, filter: [{ kind: "blur", value: "blur-sm" }] },
    {
      background: [
        { kind: "image", src: "/t.png", fit: "fill" },
        {
          kind: "linear",
          stops: [
            { color: "primary", position: 0 },
            { color: "card", alpha: 50, position: 100 }
          ]
        },
        { kind: "solid", color: "muted" }
      ]
    }
  ]

  const plain = ({ property, value }: CssDeclaration): CssDeclaration => ({ property, value })

  it.each(styles)("writes %j and reads the same declarations back", (style) => {
    for (const kind of ["layout", "text"] as const) {
      const written = declarations(style, { kind, parent: "row" }).map(plain)
      const { output, unwritten } = card.print(written)

      expect(unwritten).toEqual([])
      expect(card.read(output)).toEqual({ declarations: written, unread: "" })
    }
  })

  it("reads each declaration back where it applies", () => {
    const patch: CssDeclaration[] = [
      padding,
      { ...fill, when: { state: ":hover" } },
      { ...fill, when: { state: '[data-state="open"]' } },
      { ...padding, when: { viewport: "64rem" } },
      { ...fill, when: { theme: "dark", state: ":focus-visible" } },
      { ...padding, when: { viewport: "64rem", theme: "dark" } }
    ]

    expect(card.read(card.print(patch).output)).toEqual({ declarations: patch, unread: "" })
  })

  it("prints the same CSS from what it read", () => {
    const css = card.print([
      padding,
      { ...fill, when: { state: ":hover" } },
      { ...padding, when: { viewport: "48rem" } }
    ])

    expect(card.print(card.read(css.output).declarations)).toEqual(css)
  })
})
