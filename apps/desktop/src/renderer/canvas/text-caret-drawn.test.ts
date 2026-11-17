import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import type { caretLine as CaretLine } from "./text-caret.ts"

declare global {
  interface Window {
    /** The bundle below's exports. */
    caret: { caretLine: typeof CaretLine }
  }
}

// Where someone else's caret is drawn in a live room depends on how the text is laid out, which only a browser does:
// this draws text in Chrome, as a frame draws a heading, and asks where a caret at each place stands. It needs Chrome.
let browser: Browser
let page: Page

const entry = `export { caretLine, drawnText } from "./text-caret.ts"`

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "caret",
    platform: "browser"
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  // A heading in two text nodes, as React can draw it, wrapping onto a second line at 200px.
  await page.setContent(
    `<body style="margin: 0"><h1 id="title" style="width: 200px; margin: 0; font: 20px/30px monospace">Plans that <span>grow with your team</span></h1></body>`
  )
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
})

afterAll(async () => {
  await browser?.close()
})

/** Where a caret at `offset` stands, and where the character there is drawn, to compare. */
function caretAt(offset: number) {
  return page.evaluate((offset) => {
    const { caretLine } = window.caret

    return caretLine(document.querySelector("#title")!, offset)
  }, offset)
}

describe("where someone else's caret is drawn", () => {
  it("stands at the left of the character it's before, across text nodes and lines", async () => {
    const first = await caretAt(0)
    const sixth = await caretAt(6)
    // As tall as the characters on the first 30px line, not the whole line.
    expect(first!.x).toBe(0)
    expect(first!.top).toBeGreaterThanOrEqual(0)
    expect(first!.bottom).toBeLessThanOrEqual(30)
    expect(first!.bottom - first!.top).toBeGreaterThan(15)
    // Monospace at 20px: each character is the same width, so the seventh starts six of them along.
    expect(sixth!.x).toBeCloseTo(first!.x + 6 * (await charWidth()), 0)

    // "grow" is in the span, on the first line; "team" wraps onto a later one.
    const grow = await caretAt("Plans that ".length)
    expect(grow!.top).toBe(first!.top)
    const team = await caretAt("Plans that grow with your ".length)
    expect(team!.top).toBeGreaterThanOrEqual(first!.top + 30)
  })

  it("stands after the last character at the end, and past the end", async () => {
    const end = await caretAt("Plans that grow with your team".length)
    const past = await caretAt(500)
    const last = await caretAt("Plans that grow with your tea".length)
    expect(end).toEqual(past)
    expect(end!.x).toBeCloseTo(last!.x + (await charWidth()), 0)
    expect(end!.top).toBe(last!.top)
  })

  it("has none in an element without text", async () => {
    expect(
      await page.evaluate(() => {
        const { caretLine } = window.caret
        const empty = document.createElement("p")
        document.body.append(empty)

        return caretLine(empty, 0) ?? null
      })
    ).toBeNull()
  })
})

/** How wide a monospace character is drawn. */
function charWidth() {
  return page.evaluate(() => {
    const range = document.createRange()
    const text = document.querySelector("#title")!.firstChild!
    range.setStart(text, 0)
    range.setEnd(text, 1)

    return range.getBoundingClientRect().width
  })
}
