import { describe, expect, it } from "vite-plus/test"
import { callerOrigin, importConditions, relativeUrlsFrom, withImports, withMedia } from "./page-css.ts"

// docs/editor.md, A project's stylesheets stay in its frames (PAR-1187): what's done to a stylesheet's text.

describe("callerOrigin", () => {
  const stack = (...frames: string[]) => ["Error", ...frames.map((frame) => `    at ${frame}`)].join("\n")

  it("is the first frame's origin with an address, or nothing for Parity's own", () => {
    expect(
      callerOrigin(
        stack("Array.forEach (<anonymous>)", "updateStyle (http://localhost:5173/@vite/client:900:9)"),
        "http://localhost:5391"
      )
    ).toBe("http://localhost:5173")
    expect(callerOrigin(stack("http://localhost:5391/src/main.tsx:4:2"), "http://localhost:5391")).toBeUndefined()
    expect(callerOrigin(stack("eval (<anonymous>)"), "http://localhost:5391")).toBeUndefined()
  })

  it("looks past frames with an opaque origin, as webpack-internal code has", () => {
    expect(
      callerOrigin(
        stack("insertStyle (webpack-internal:///./src/theme.js:12:5)", "http://localhost:3000/_next/main.js:40:1"),
        "http://localhost:5391"
      )
    ).toBe("http://localhost:3000")
    expect(
      callerOrigin(stack("insertStyle (webpack-internal:///./src/theme.js:12:5)"), "http://localhost:5391")
    ).toBeUndefined()
  })
})

describe("withImports", () => {
  it("puts what each @import reads in its place, nested, with its own url()s resolved and its conditions kept", async () => {
    const sheets = new Map([
      ["http://project.test/css/base.css", '@import "fonts/body.css"; body { margin: 0; }'],
      ["http://project.test/css/fonts/body.css", "@font-face { src: url(body.woff2); }"],
      ["http://project.test/print.css", ".no-print { display: none; }"]
    ])

    const read = async (address: string) => {
      const text = sheets.get(address)

      return text === undefined ? undefined : { text, from: address }
    }

    const css = await withImports(
      '@import url("css/base.css") layer(base); @import "/print.css" print; @import "missing.css"; .a {}',
      "http://project.test/app.css",
      read
    )

    expect(css).toBe(
      [
        "@layer base {",
        "@font-face { src: url(http://project.test/css/fonts/body.woff2); } body { margin: 0; }",
        "} @media print {",
        ".no-print { display: none; }",
        "}  .a {}"
      ].join("\n")
    )
  })

  it("reads a quoted address whole, semicolons and all, and an import's root against its own origin", async () => {
    const fonts = "https://fonts.test/css2?family=Roboto:wght@400;700&display=swap"
    const asked: string[] = []

    const read = async (address: string) => {
      asked.push(address)

      return { text: "@font-face { src: url(/s/roboto.woff2); }", from: address }
    }

    const css = await withImports(`@import url("${fonts}"); .a {}`, "http://project.test/app.css", read)

    expect(asked).toEqual([fonts])
    expect(css).toBe("@font-face { src: url(https://fonts.test/s/roboto.woff2); } .a {}")
  })

  it("leaves an @import in a comment alone", async () => {
    const asked: string[] = []

    const read = async (address: string) => {
      asked.push(address)

      return { text: ".b {}", from: address }
    }

    const css = await withImports(
      '/* @import "old.css"; */ @import "new.css"; .a {}',
      "http://project.test/app.css",
      read
    )

    expect(asked).toEqual(["http://project.test/new.css"])
    expect(css).toBe('/* @import "old.css"; */ .b {} .a {}')
  })

  it("leaves @import in a string alone", async () => {
    const asked: string[] = []

    const read = async (address: string) => {
      asked.push(address)

      return { text: ".b {}", from: address }
    }

    const css = `.a::before { content: '@import "old.css";'; } .c::after { content: "say \\"@import 'x.css';\\""; }`

    expect(await withImports(css, "http://project.test/app.css", read)).toBe(css)
    expect(asked).toEqual([])
  })
})

describe("importConditions", () => {
  it("wraps in the layer, then supports, then media, outward", () => {
    expect(importConditions(".a {}", "layer supports(display: grid) screen")).toBe(
      "@media screen {\n@supports (display: grid) {\n@layer {\n.a {}\n}\n}\n}"
    )
    expect(importConditions(".a {}", "")).toBe(".a {}")
    expect(importConditions(".a {}", "supports((display: grid) and (not (color: red))) print")).toBe(
      "@media print {\n@supports (display: grid) and (not (color: red)) {\n.a {}\n}\n}"
    )
    expect(importConditions(".a {}", "supports(selector(:has(*)))")).toBe("@supports selector(:has(*)) {\n.a {}\n}")
    expect(importConditions(".a {}", "supports(not (display: grid))")).toBe("@supports not (display: grid) {\n.a {}\n}")
  })
})

describe("relativeUrlsFrom", () => {
  it("resolves relative url()s against the stylesheet's address, leaving the rest", () => {
    const address = "http://project.test/_next/static/css/app.css"

    expect(
      relativeUrlsFrom(
        '.a { background: url("../media/a.png"); } @font-face { src: url(f.woff2); } .b { background: url(/b.png), url(data:image/png;base64,x), url(#c), url(https://cdn.test/d.png); }',
        address
      )
    ).toBe(
      '.a { background: url("http://project.test/_next/static/media/a.png"); } @font-face { src: url(http://project.test/_next/static/css/f.woff2); } .b { background: url(http://project.test/b.png), url(data:image/png;base64,x), url(#c), url(https://cdn.test/d.png); }'
    )
  })

  it("reads a quoted address whole, parentheses and all", () => {
    expect(
      relativeUrlsFrom(".a { background: url(\"card(1).png\"), url('b (2).png'); }", "http://project.test/css/")
    ).toBe(
      ".a { background: url(\"http://project.test/css/card(1).png\"), url('http://project.test/css/b%20(2).png'); }"
    )
  })

  it("leaves url( in a string or a comment as it's written", () => {
    expect(
      relativeUrlsFrom(
        ".a::before { content: \"url(card.png)\"; } /* url(old.png) */ .b::after { content: 'say \\'url(x)\\''; background: url(b.png); }",
        "http://project.test/css/"
      )
    ).toBe(
      ".a::before { content: \"url(card.png)\"; } /* url(old.png) */ .b::after { content: 'say \\'url(x)\\''; background: url(http://project.test/css/b.png); }"
    )
  })
})

describe("withMedia", () => {
  it("wraps a stylesheet only in a medium narrower than all", () => {
    expect(withMedia(".a {}", null)).toBe(".a {}")
    expect(withMedia(".a {}", " all ")).toBe(".a {}")
    expect(withMedia(".a {}", "(min-width: 40em)")).toBe("@media (min-width: 40em) {\n.a {}\n}")
  })
})
