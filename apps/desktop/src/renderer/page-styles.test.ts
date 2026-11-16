import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test"
import type * as pageStylesModule from "./page-styles.ts"
import { callerOrigin, relativeUrlsFrom, withMedia } from "./page-styles.ts"

// docs/editor.md, A project's stylesheets stay in its frames (PAR-1187). The boundary wraps the page's own DOM methods
// and tells code apart by where it was served from, so this runs in Chrome, with Parity's page and a project's code
// served from two origins.
let browser: Browser
let page: Page
const errors: string[] = []

/** Parity's side: the boundary, and a stylesheet of Parity's own added the same way a project's is. */
const entry = `
import { guardPage, pageStyles } from "./page-styles.ts"

export { guardPage, pageStyles }

export function addOwnStyle(css) {
  const style = document.createElement("style")
  style.textContent = css
  document.head.append(style)

  return style
}
`

/** The project's side: what its code does to the page, as a dev client, a bundler's runtime or CSS-in-JS would. */
const projectScript = `
window.project = {
  addStyle(css, media) {
    const style = document.createElement("style")
    style.textContent = css
    if (media) style.setAttribute("media", media)
    document.head.appendChild(style)
    return style
  },
  addLink(href) {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    document.head.append(link)
    return link
  },
  addRules(rules) {
    const style = document.createElement("style")
    document.head.insertBefore(style, null)
    rules.forEach((rule) => style.sheet.insertRule(rule, style.sheet.cssRules.length))
    return style
  },
  addTextThenRules(text, rules) {
    const style = document.createElement("style")
    document.head.append(style)
    style.textContent = text
    rules.forEach((rule) => style.sheet.insertRule(rule, style.sheet.cssRules.length))
    return style
  },
  addInto(parent, css) {
    const style = document.createElement("style")
    style.textContent = css
    parent.append(style)
    return style
  },
  call(fn) {
    return fn()
  }
}
`

beforeAll(async () => {
  const renderer = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: renderer, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "parity",
    platform: "browser"
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage()
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("http://parity.test/parity.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0]!.text })
  )
  await page.route("http://project.test/project.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: projectScript })
  )
  await page.route("http://project.test/card.css", (route) =>
    route.fulfill({
      contentType: "text/css",
      headers: { "access-control-allow-origin": "*" },
      body: ".card { color: rgb(255, 0, 0); background: url(card.png); }"
    })
  )
  await page.route("http://parity.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: [
        "<style>body { color: rgb(0, 0, 0); }</style>",
        '<script src="http://parity.test/parity.js"></script>',
        '<script src="http://project.test/project.js"></script>'
      ].join("")
    })
  )
  await page.goto("http://parity.test/")

  if (!(await page.evaluate(() => "parity" in window && "project" in window))) {
    throw new Error(`The page didn't load: ${errors.join(",")}`)
  }

  await page.evaluate(() => parity.guardPage())
})

afterAll(async () => {
  await browser?.close()
})

beforeEach(async () => {
  await page.evaluate(() => {
    for (const element of document.head.querySelectorAll("style:not(:first-of-type), link")) {
      element.remove()
    }
  })
})

declare const parity: typeof pageStylesModule & { addOwnStyle(css: string): HTMLStyleElement }

declare const project: {
  addStyle(css: string, media?: string): HTMLStyleElement
  addLink(href: string): HTMLLinkElement
  addRules(rules: string[]): HTMLStyleElement
  addTextThenRules(text: string, rules: string[]): HTMLStyleElement
  addInto(parent: ParentNode, css: string): HTMLStyleElement
  call<T>(fn: () => T): T
}

const origin = "http://project.test"

describe("a stylesheet a project's code adds to Parity's page", () => {
  it("styles nothing in the page and is kept for the project's frames", async () => {
    const result = await page.evaluate((origin) => {
      const style = project.addStyle("body { color: rgb(255, 0, 0); }")

      return {
        media: style.getAttribute("media"),
        color: getComputedStyle(document.body).color,
        sheets: parity.pageStyles(origin).sheets()
      }
    }, origin)

    expect(result).toEqual({
      media: "not all",
      color: "rgb(0, 0, 0)",
      sheets: [{ css: "body { color: rgb(255, 0, 0); }", baseUrl: "http://project.test/" }]
    })
  })

  it("leaves Parity's own stylesheets alone, and a project's in a frame's shadow root", async () => {
    const result = await page.evaluate((origin) => {
      const own = parity.addOwnStyle("body { outline-color: rgb(0, 0, 255); }")
      const host = document.createElement("div")
      document.body.append(host)
      const framed = project.addInto(host.attachShadow({ mode: "open" }), ".frame { color: red; }")

      return {
        own: own.getAttribute("media"),
        outline: getComputedStyle(document.body).outlineColor,
        framed: framed.getAttribute("media"),
        sheets: parity.pageStyles(origin).sheets().length
      }
    }, origin)

    expect(result).toEqual({ own: null, outline: "rgb(0, 0, 255)", framed: null, sheets: 0 })
  })

  it("follows its text, the rules its code inserts, and its removal, telling listeners once each time", async () => {
    const steps = await page.evaluate(async (origin) => {
      const styles = parity.pageStyles(origin)
      const css = () => styles.sheets().map((sheet) => sheet.css)
      let heard = 0
      const stop = styles.subscribe(() => heard++)
      const settle = () => new Promise((resolve) => setTimeout(resolve))

      const style = project.addStyle(".a { color: red; }")
      const rules = project.addRules([".b { color: blue; }", ".c { color: green; }"])
      await settle()
      const added = { css: css(), heard }
      style.textContent = ".a { color: purple; }"
      await settle()
      const changed = { css: css(), heard }
      style.remove()
      rules.remove()
      await settle()
      const removed = { css: css(), heard }
      stop()

      return { added, changed, removed }
    }, origin)

    expect(steps.added).toEqual({ css: [".a { color: red; }", ".b { color: blue; }\n.c { color: green; }"], heard: 1 })
    expect(steps.changed).toEqual({
      css: [".a { color: purple; }", ".b { color: blue; }\n.c { color: green; }"],
      heard: 2
    })
    expect(steps.removed).toEqual({ css: [], heard: 3 })
  })

  it("keeps rules its code inserts straight after setting its text, in the same task", async () => {
    const css = await page.evaluate(async (origin) => {
      project.addTextThenRules(".base { color: red; }", [".added { color: blue; }"])
      await new Promise((resolve) => setTimeout(resolve))

      return parity
        .pageStyles(origin)
        .sheets()
        .map((sheet) => sheet.css)
    }, origin)

    expect(css).toEqual([".base { color: red; }\n.added { color: blue; }"])
  })

  it("takes a move within the page as a new place in the cascade, telling listeners", async () => {
    const steps = await page.evaluate(async (origin) => {
      const styles = parity.pageStyles(origin)
      const css = () => styles.sheets().map((sheet) => sheet.css)
      const settle = () => new Promise((resolve) => setTimeout(resolve))
      const first = project.addStyle(".first {}")
      project.addStyle(".second {}")
      await settle()
      let heard = 0
      const stop = styles.subscribe(() => heard++)
      project.call(() => document.head.appendChild(first))
      await settle()
      stop()

      return { css: css(), heard }
    }, origin)

    expect(steps).toEqual({ css: [".second {}", ".first {}"], heard: 1 })
  })

  it("takes media its code sets to not all as the project's, leaving it off in frames too", async () => {
    const css = await page.evaluate(async (origin) => {
      const style = project.addStyle(".off { color: red; }")
      await new Promise((resolve) => setTimeout(resolve))
      style.media = "not all"
      await new Promise((resolve) => setTimeout(resolve))

      return parity.pageStyles(origin).sheets()[0]?.css
    }, origin)

    expect(css).toBe("@media not all {\n.off { color: red; }\n}")
  })

  it("takes the last of several media changes its code makes in one task", async () => {
    const steps = await page.evaluate(async (origin) => {
      const style = project.addStyle(".twice { color: red; }")
      await new Promise((resolve) => setTimeout(resolve))
      style.media = "screen"
      style.media = "print"
      await new Promise((resolve) => setTimeout(resolve))

      return { css: parity.pageStyles(origin).sheets()[0]?.css, media: style.getAttribute("media") }
    }, origin)

    expect(steps).toEqual({ css: "@media print {\n.twice { color: red; }\n}", media: "not all" })
  })

  it("lets go of a stylesheet taken out with the element around it, telling listeners", async () => {
    const steps = await page.evaluate(async (origin) => {
      const styles = parity.pageStyles(origin)
      const settle = () => new Promise((resolve) => setTimeout(resolve))
      const box = document.createElement("div")
      document.body.append(box)
      project.addInto(box, ".boxed {}")
      await settle()
      const before = styles.sheets().length
      let heard = 0
      const stop = styles.subscribe(() => heard++)
      box.remove()
      await settle()
      stop()

      return { before, after: styles.sheets().length, heard }
    }, origin)

    expect(steps).toEqual({ before: 1, after: 0, heard: 1 })
  })

  it("keeps the media the project gave it when its code takes it out and puts it back later", async () => {
    const steps = await page.evaluate(async (origin) => {
      const settle = () => new Promise((resolve) => setTimeout(resolve))
      const style = project.addStyle(".print { color: red; }", "print")
      await settle()
      style.remove()
      await settle()
      const away = style.getAttribute("media")
      project.call(() => document.head.appendChild(style))

      return { away, back: parity.pageStyles(origin).sheets()[0]?.css, media: style.getAttribute("media") }
    }, origin)

    expect(steps).toEqual({ away: "print", back: "@media print {\n.print { color: red; }\n}", media: "not all" })
  })

  it("keeps the media the project gave it for its frames, when it's given or changed", async () => {
    const steps = await page.evaluate((origin) => {
      const style = project.addStyle(".print { color: red; }", "print")
      const given = parity.pageStyles(origin).sheets()[0]?.css
      style.setAttribute("media", "screen")

      return new Promise<unknown>((resolve) =>
        setTimeout(() =>
          resolve({ given, changed: parity.pageStyles(origin).sheets()[0]?.css, media: style.getAttribute("media") })
        )
      )
    }, origin)

    expect(steps).toEqual({
      given: "@media print {\n.print { color: red; }\n}",
      changed: "@media screen {\n.print { color: red; }\n}",
      media: "not all"
    })
  })

  it("reads a linked stylesheet, whose url()s stay relative to it", async () => {
    const result = await page.evaluate(async (origin) => {
      const link = project.addLink("http://project.test/card.css")
      await parity.pageStyles(origin).settled()

      return { media: link.getAttribute("media"), sheets: parity.pageStyles(origin).sheets() }
    }, origin)

    expect(result).toEqual({
      media: "not all",
      sheets: [
        {
          css: ".card { color: rgb(255, 0, 0); background: url(http://project.test/card.png); }",
          baseUrl: "http://project.test/card.css"
        }
      ]
    })
  })

  it("is the project's when its code adds it from inside a call of Parity's", async () => {
    const media = await page.evaluate(() =>
      project.call(() => project.addStyle(".nested { color: red; }")).getAttribute("media")
    )

    expect(media).toBe("not all")
  })
})

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
      '.a { background: url("http://project.test/_next/static/media/a.png"); } @font-face { src: url(http://project.test/_next/static/css/f.woff2); } .b { background: url(/b.png), url(data:image/png;base64,x), url(#c), url(https://cdn.test/d.png); }'
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
