import { describe, expect, it } from "vitest"
import { prepareCanvasCss, rewriteMedia } from "./css.ts"

const options = { baseUrl: "http://localhost:5555/" }

describe("rewriteMedia", () => {
  it.each([
    ["@media (width >= 40rem)", "@container canvas-viewport (width >= 40rem)"],
    ["@media (width < 48rem)", "@container canvas-viewport (width < 48rem)"],
    ["@media (min-width: 640px)", "@container canvas-viewport (min-width: 640px)"],
    ["@media screen and (max-width: 767px)", "@container canvas-viewport (max-width: 767px)"],
    ["@media (40rem <= width < 64rem)", "@container canvas-viewport (40rem <= width < 64rem)"],
    [
      "@media (min-width: 640px) and (max-width: 1023px)",
      "@container canvas-viewport (min-width: 640px) and (max-width: 1023px)"
    ],
    ["@media not all and (min-width: 640px)", "@container canvas-viewport not (min-width: 640px)"]
  ])("rewrites %s", (input, expected) => {
    expect(rewriteMedia(input)).toBe(expected)
  })

  it.each([
    "@media (prefers-color-scheme: dark)",
    "@media (hover: hover)",
    "@media print",
    "@media (min-width: 640px) and (hover: hover)",
    "@media (min-height: 600px)"
  ])("leaves %s alone", (input) => {
    expect(rewriteMedia(input)).toBe(input)
  })
})

describe("prepareCanvasCss", () => {
  it("rewrites nested viewport media queries", () => {
    const { scoped } = prepareCanvasCss(".sm\\:w-auto { @media (width >= 40rem) { width: auto; } }", options)
    expect(scoped).toBe(".sm\\:w-auto { @container canvas-viewport (width >= 40rem) { width: auto; } }")
  })

  it("maps document selectors onto the shadow root", () => {
    const { scoped } = prepareCanvasCss(
      ":root { --a: 1; }\nhtml, :host { color: red; }\nbody > main { margin: 0; }",
      options
    )
    expect(scoped).toContain(":host {")
    expect(scoped).toContain(":host, :host {")
    expect(scoped).toContain("[data-canvas-body] > main {")
  })

  it("keeps class names that contain document words", () => {
    const { scoped } = prepareCanvasCss(".bodyText, .html-preview { color: red; }", options)
    expect(scoped).toContain(".bodyText, .html-preview {")
  })

  it("moves @property and @font-face to the document", () => {
    const css = [
      "@layer theme { :root { --x: 1; } }",
      '@property --tw-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }',
      "@font-face { font-family: Geist; src: url(/node_modules/geist.woff2) format('woff2'); }"
    ].join("\n")
    const { scoped, global } = prepareCanvasCss(css, options)
    expect(scoped).not.toContain("@property")
    expect(scoped).not.toContain("@font-face")
    expect(global).toContain('@property --tw-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }')
    expect(global).toContain("url(http://localhost:5555/node_modules/geist.woff2)")
  })

  it("ignores braces and semicolons inside strings, comments and parentheses", () => {
    const css = '/* a { b } */ .a::before { content: "{;}"; background: url(data:image/svg+xml;utf8,<svg/>); }'
    const { scoped } = prepareCanvasCss(css, options)
    expect(scoped).toBe(' .a::before { content: "{;}"; background: url(data:image/svg+xml;utf8,<svg/>); }')
  })

  it("treats escaped quotes and parentheses in selectors as literal", () => {
    const css = [
      ".\\[\\&_svg\\:not\\(\\[class\\*\\=\\'size-\\'\\]\\)\\]\\:size-4 { & svg:not([class*='size-']) { width: 1rem; } }",
      ":root { --primary: black; }"
    ].join("\n")
    const { scoped } = prepareCanvasCss(css, options)
    expect(scoped).toContain(":host { --primary: black; }")
    expect(scoped).toContain(".\\[\\&_svg\\:not\\(\\[class\\*\\=\\'size-\\'\\]\\)\\]\\:size-4 {")
  })

  it("leaves keyframes and protocol-relative urls alone", () => {
    const css = "@keyframes spin { to { transform: rotate(1turn); } } .a { background: url(//cdn.example/x.png); }"
    expect(prepareCanvasCss(css, options).scoped).toBe(css)
  })
})
