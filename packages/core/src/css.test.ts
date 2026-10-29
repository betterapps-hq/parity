import { describe, expect, it } from "vitest"
import { prepareCanvasCss, rewriteMedia, rewriteSheetViewportUnits, rewriteViewportUnits } from "./css.ts"

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

  it("measures viewport units against the frame", () => {
    const css =
      ".a { height: 100vh; min-height: 100svh; width: calc(100vw - 2rem); margin-left: -50vw; max-height: calc(100dvh - 6rem); }"
    expect(prepareCanvasCss(css, options).scoped).toBe(
      ".a { height: calc(100 * var(--canvas-vh, 1vh)); min-height: calc(100 * var(--canvas-vh, 1svh)); " +
        "width: calc(calc(100 * var(--canvas-vw, 1vw)) - 2rem); margin-left: calc(-50 * var(--canvas-vw, 1vw)); " +
        "max-height: calc(calc(100 * var(--canvas-vh, 1dvh)) - 6rem); }"
    )
    expect(prepareCanvasCss(".a { font-size: 2.5vmin; }", options).scoped).toBe(
      ".a { font-size: calc(2.5 * min(var(--canvas-vw, 1vw), var(--canvas-vh, 1vh))); }"
    )
  })

  it("leaves viewport units in selectors, strings and urls alone", () => {
    const css = '.h-\\[100vh\\] { content: "100vh"; background: url(/img-100vw.png); height: 50vh; }'
    expect(prepareCanvasCss(css, options).scoped).toBe(
      '.h-\\[100vh\\] { content: "100vh"; background: url(http://localhost:5555/img-100vw.png); ' +
        "height: calc(50 * var(--canvas-vh, 1vh)); }"
    )
  })

  it("rewrites a viewport length once, however often it's asked", () => {
    const once = rewriteViewportUnits("calc(100vh - 2rem) 5vmax")
    expect(rewriteViewportUnits(once)).toBe(once)
    const style = "translate(10px, 2px) rotate(1turn)"
    expect(rewriteViewportUnits(style)).toBe(style)
  })

  it("rewrites the declarations of rules added at run time, not their selectors", () => {
    const css = ".h-\\[100vh\\]{height:50vh}@media (min-width: 40rem){.a:hover{min-height:100dvh;width:1vw}}"
    expect(rewriteSheetViewportUnits(css)).toBe(
      ".h-\\[100vh\\]{height:calc(50 * var(--canvas-vh, 1vh))}@media (min-width: 40rem){.a:hover{" +
        "min-height:calc(100 * var(--canvas-vh, 1dvh));width:calc(1 * var(--canvas-vw, 1vw))}}"
    )
    expect(rewriteSheetViewportUnits(rewriteSheetViewportUnits(css))).toBe(rewriteSheetViewportUnits(css))
    expect(rewriteSheetViewportUnits('.a { content: "{"; height: 10vh }')).toBe(
      '.a { content: "{"; height: calc(10 * var(--canvas-vh, 1vh)) }'
    )
  })

  it("leaves keyframes and protocol-relative urls alone", () => {
    const css = "@keyframes spin { to { transform: rotate(1turn); } } .a { background: url(//cdn.example/x.png); }"
    expect(prepareCanvasCss(css, options).scoped).toBe(css)
  })
})
