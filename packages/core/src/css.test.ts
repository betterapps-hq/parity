import { describe, expect, it } from "vite-plus/test"
import {
  collectCustomProperties,
  colorSchemeQuery,
  prepareCanvasCss,
  resetCustomProperties,
  rewriteMedia,
  rewriteFrameUnits,
  rewriteSheetFrameUnits
} from "./css.ts"

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

describe("colorSchemeQuery", () => {
  it.each([
    ["(prefers-color-scheme: dark)", "dark"],
    ["( prefers-color-scheme : LIGHT )", "light"],
    ["screen and (prefers-color-scheme: dark)", undefined],
    ["(prefers-color-scheme: dark) and (width >= 40rem)", undefined],
    ["(prefers-contrast: more)", undefined]
  ])("reads %s as %s", (query, scheme) => {
    expect(colorSchemeQuery(query)).toBe(scheme)
  })
})

describe("prepareCanvasCss with prefers-color-scheme", () => {
  const dark = ':where([data-canvas-body][data-canvas-color-scheme="dark"])'
  const light = ':where([data-canvas-body][data-canvas-color-scheme="light"])'
  const scoped = (css: string) => prepareCanvasCss(css, options).scoped

  it("draws a block's root as the frame's body in that scheme, whatever Parity's window prefers", () => {
    expect(scoped("@media (prefers-color-scheme: dark) { :root { --surface: #1a1b1e; } }")).toBe(
      ` ${dark} { --surface: #1a1b1e; } `
    )
    expect(scoped("@media (prefers-color-scheme: light) { html { color: #213547; } }")).toBe(
      ` ${light} { color: #213547; } `
    )
    expect(scoped("@media (prefers-color-scheme: dark) { :root:not(.light) { --c: #000; } }")).toBe(
      ` ${dark}:not(.light) { --c: #000; } `
    )
  })

  it("keeps the body's own specificity and looks for anything else inside the body", () => {
    expect(
      scoped("@media (prefers-color-scheme: dark) { body { margin: 0; } .card, :root .x { color: white; } }")
    ).toBe(
      ` [data-canvas-body]:where([data-canvas-color-scheme="dark"]) { margin: 0; } ${dark} .card, ${dark} .x { color: white; } `
    )
  })

  it("draws a block nested in a rule, as Tailwind's dark variant writes, for the rule's elements in that scheme", () => {
    expect(scoped(".dark\\:bg-black { @media (prefers-color-scheme: dark) { background-color: black; } }")).toBe(
      `.dark\\:bg-black { ${dark} & { background-color: black; } }`
    )
  })

  it("moves a block nested in the root's own rule after it, where it can reach the body", () => {
    expect(scoped(":root { --c: #fff; @media (prefers-color-scheme: dark) { --c: #000; } }")).toBe(
      `:host { --c: #fff; } ${dark} { --c: #000; }`
    )
  })

  it("keeps a block under a layer in its layer, and leaves a query that asks for more alone", () => {
    expect(scoped("@layer base { @media (prefers-color-scheme: dark) { :root { --c: #000; } } }")).toBe(
      `@layer base {  ${dark} { --c: #000; }  }`
    )
    const both = "@media screen and (prefers-color-scheme: dark) { :host { --c: #000; } }"
    expect(scoped(both)).toBe(both)
  })

  it("leaves the blocks as written when asked to, for reading tokens", () => {
    const css = "@media (prefers-color-scheme: dark) { :host { --c: #000; } }"
    expect(prepareCanvasCss(css, { ...options, units: false, colorSchemes: false }).scoped).toBe(css)
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
      ".a { height: 100vh; min-height: 100svh; width: calc(100vw - 2px); margin-left: -50vw; max-height: calc(100dvh - 6px); }"
    expect(prepareCanvasCss(css, options).scoped).toBe(
      ".a { height: calc(100 * var(--canvas-vh, 1vh)); min-height: calc(100 * var(--canvas-vh, 1svh)); " +
        "width: calc(calc(100 * var(--canvas-vw, 1vw)) - 2px); margin-left: calc(-50 * var(--canvas-vw, 1vw)); " +
        "max-height: calc(calc(100 * var(--canvas-vh, 1dvh)) - 6px); }"
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

  it("rewrites a viewport length or rem once, however often it's asked", () => {
    const once = rewriteFrameUnits("calc(100vh - 2rem) 5vmax")
    expect(once).toBe(
      "calc(calc(100 * var(--canvas-vh, 1vh)) - calc(2 * var(--canvas-rem, 1rem))) " +
        "calc(5 * max(var(--canvas-vw, 1vw), var(--canvas-vh, 1vh)))"
    )
    expect(rewriteFrameUnits(once)).toBe(once)
    const style = "translate(10px, 2px) rotate(1turn) 1em"
    expect(rewriteFrameUnits(style)).toBe(style)
  })

  it("rewrites the declarations of rules added at run time, not their selectors or media queries", () => {
    const css =
      ".h-\\[100vh\\]{height:50vh}@media (min-width: 40rem){.a:hover{min-height:100dvh;width:1vw;padding:.5rem}}"
    expect(rewriteSheetFrameUnits(css)).toBe(
      ".h-\\[100vh\\]{height:calc(50 * var(--canvas-vh, 1vh))}@media (min-width: 40rem){.a:hover{" +
        "min-height:calc(100 * var(--canvas-vh, 1dvh));width:calc(1 * var(--canvas-vw, 1vw));" +
        "padding:calc(.5 * var(--canvas-rem, 1rem))}}"
    )
    expect(rewriteSheetFrameUnits(rewriteSheetFrameUnits(css))).toBe(rewriteSheetFrameUnits(css))
    expect(rewriteSheetFrameUnits('.a { content: "{"; height: 10vh }')).toBe(
      '.a { content: "{"; height: calc(10 * var(--canvas-vh, 1vh)) }'
    )
  })

  it("measures rem against the frame's root font, in declarations and custom properties", () => {
    const css = ":root { --spacing: 0.25rem; } .a { margin: -1.5rem 2rem; width: calc(var(--spacing) * 4); }"
    expect(prepareCanvasCss(css, options).scoped).toBe(
      ":host { --spacing: calc(0.25 * var(--canvas-rem, 1rem)); } .a { margin: calc(-1.5 * var(--canvas-rem, 1rem)) " +
        "calc(2 * var(--canvas-rem, 1rem)); width: calc(var(--spacing) * 4); }"
    )
  })

  it("leaves rem in selectors, strings, urls and queries alone", () => {
    const css =
      '.mt-\\[1rem\\] { content: "1rem"; background: url(/x-1rem.png); } @media (width >= 40rem) { .a { top: 0 } }' +
      " @container card (width > 20rem) { .b { top: 0 } }"
    expect(prepareCanvasCss(css, options).scoped).toBe(
      '.mt-\\[1rem\\] { content: "1rem"; background: url(http://localhost:5555/x-1rem.png); } ' +
        "@container canvas-viewport (width >= 40rem) { .a { top: 0 } } @container card (width > 20rem) { .b { top: 0 } }"
    )
  })

  it("works out a relative root font size from a browser's default", () => {
    const scoped = (css: string) => prepareCanvasCss(css, options).scoped
    expect(scoped("html { font-size: 62.5%; }")).toBe(":host { font-size: calc(62.5 / 100 * 16px); }")
    expect(scoped(":root{font-size:1.25rem}")).toBe(":host {font-size:calc(1.25 * 16px)}")
    expect(scoped("html { font-size: clamp(1em, 1em + 1vw, 1.5em) !important; }")).toBe(
      ":host { font-size: clamp(calc(1 * 16px), calc(1 * 16px) + calc(1 * var(--canvas-vw, 1vw)), " +
        "calc(1.5 * 16px)) !important; }"
    )
    expect(scoped("@media (min-width: 1200px) { html { font-size: 75%; } }")).toBe(
      "@container canvas-viewport (min-width: 1200px) { :host { font-size: calc(75 / 100 * 16px); } }"
    )
    expect(scoped("html { @media (min-width: 1200px) { font-size: 75%; } }")).toBe(
      ":host { @container canvas-viewport (min-width: 1200px) { font-size: calc(75 / 100 * 16px); } }"
    )
  })

  it("leaves the font size of everything but the root, and the root's other lengths, as they are", () => {
    const scoped = (css: string) => prepareCanvasCss(css, options).scoped
    expect(scoped("body { font-size: 62.5%; } .a { font-size: 1.2em; }")).toBe(
      "[data-canvas-body] { font-size: 62.5%; } .a { font-size: 1.2em; }"
    )
    expect(scoped("html { --root-font-size: 50%; line-height: 1.5em; font-size: larger; }")).toBe(
      ":host { --root-font-size: 50%; line-height: 1.5em; font-size: larger; }"
    )
  })

  it("keeps lengths as the project wrote them when asked, as tokens are read", () => {
    const css =
      "html { font-size: 62.5%; --spacing: 0.25rem; --header: 10vh; } @media (width >= 40rem) { .a { top: 1rem } }"
    expect(prepareCanvasCss(css, { ...options, units: false }).scoped).toBe(
      ":host { font-size: 62.5%; --spacing: 0.25rem; --header: 10vh; } " +
        "@container canvas-viewport (width >= 40rem) { .a { top: 1rem } }"
    )
  })

  it("splits a rule for the root and other elements, so only the root's font size changes", () => {
    expect(prepareCanvasCss("html, body, .a:is(.b, .c) { font-size: 62.5%; }", options).scoped).toBe(
      ":host { font-size: calc(62.5 / 100 * 16px); } [data-canvas-body], .a:is(.b, .c) { font-size: 62.5%; }"
    )
    expect(prepareCanvasCss(":root, :host { font-size: 50%; }", options).scoped).toBe(
      ":host, :host { font-size: calc(50 / 100 * 16px); }"
    )
    // Without a font size to work out, the rule stays whole, as theme rules such as `:root, body` are read whole.
    expect(prepareCanvasCss("html, body { --c: red; margin: 1rem; }", options).scoped).toBe(
      ":host, [data-canvas-body] { --c: red; margin: calc(1 * var(--canvas-rem, 1rem)); }"
    )
  })

  it("leaves keyframes and protocol-relative urls alone", () => {
    const css = "@keyframes spin { to { transform: rotate(1turn); } } .a { background: url(//cdn.example/x.png); }"
    expect(prepareCanvasCss(css, options).scoped).toBe(css)
  })
})

describe("collectCustomProperties", () => {
  it("keeps each declaration's selector and the at-rules around it, outermost first", () => {
    const css = [
      ":root { --a: 1; }",
      "@layer theme { @media (prefers-color-scheme: dark) { :root, :host { --a: 2; } } }",
      "@supports (color: oklch(0 0 0)) { .dark { --b: oklch(0 0 0); } }",
      ".card { @media (width >= 40rem) { --c: 3; } }"
    ].join("\n")
    expect(collectCustomProperties(css)).toEqual([
      { selector: ":root", atRules: [], name: "a", value: "1" },
      {
        selector: ":root, :host",
        atRules: [
          { name: "layer", prelude: "theme" },
          { name: "media", prelude: "(prefers-color-scheme: dark)" }
        ],
        name: "a",
        value: "2"
      },
      {
        selector: ".dark",
        atRules: [{ name: "supports", prelude: "(color: oklch(0 0 0))" }],
        name: "b",
        value: "oklch(0 0 0)"
      },
      { selector: ".card", atRules: [{ name: "media", prelude: "(width >= 40rem)" }], name: "c", value: "3" }
    ])
  })

  it("keeps a declaration directly in an at-rule, as Tailwind's @theme has, with no selector", () => {
    expect(collectCustomProperties("@theme inline { --a: 1; }")).toEqual([
      { selector: "", atRules: [{ name: "theme", prelude: "inline" }], name: "a", value: "1" }
    ])
  })

  it("skips declarations outside any rule", () => {
    expect(collectCustomProperties("--a: 1;")).toEqual([])
  })
})

describe("resetCustomProperties", () => {
  it("sets each custom property to initial", () => {
    expect(resetCustomProperties(["--background", "--tl-zoom"])).toBe("--background: initial; --tl-zoom: initial;")
  })

  it("leaves out names that aren't custom properties", () => {
    expect(resetCustomProperties(["color", "--", "-webkit-box", "--a"])).toBe("--a: initial;")
  })

  it("escapes characters that would end the name, so it can't set another property", () => {
    expect(resetCustomProperties(["--a:b", "--c d;", "--é_1"])).toBe(
      String.raw`--a\3a b: initial; --c\20 d\3b : initial; --é_1: initial;`
    )
  })
})
