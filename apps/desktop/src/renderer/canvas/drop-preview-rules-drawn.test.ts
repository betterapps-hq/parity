import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// A drop preview's copy holds its layer's place in a layout, so it has to be laid out as its layer is, which only a
// browser does: this draws a frame in Chrome. It needs Chrome installed. The card has no classes, so, as a frame draws
// such a layer, everything about it comes from the frame's rules about its node, inside a cascade layer as a project
// with layered styles has them.
let browser: Browser
let page: Page

const entry = `export { dropPreviewSheet, markPreviewCopy } from "./drop-preview-rules.ts"`

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "previews",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  await page.setContent(`<body style="margin: 0"><div id="host" data-frame style="width: 900px"></div></body>`)
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>("#host")!.attachShadow({ mode: "open" })
    const rules = new CSSStyleSheet()
    rules.replaceSync(`@layer utilities {
      [data-canvas-node="row"] { display: flex; align-items: flex-start; gap: 16px }
      [data-canvas-node="card"] { width: 200px; padding: 12px; box-sizing: border-box }
      [data-canvas-node="card"] > [data-canvas-node="title"] { margin: 0; font: 20px/30px sans-serif }
    }`)
    frame.adoptedStyleSheets = [rules]
    frame.innerHTML = `<div data-canvas-body><div data-canvas-node="row">
      <div data-canvas-node="card"><p data-canvas-node="title">Plans</p></div></div></div>`
  })
})

afterAll(async () => {
  await browser?.close()
})

describe("a drop preview's copy of a layer drawn by the frame's rules", () => {
  let drawn: {
    layer: { width: number; height: number }
    bare: { width: number; height: number }
    copy: { width: number; height: number }
    title: string
    layers: number
  }

  beforeAll(async () => {
    drawn = await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>("#host")!.shadowRoot!
      const row = frame.querySelector('[data-canvas-node="row"]')!
      const card = frame.querySelector<HTMLElement>('[data-canvas-node="card"]')!
      const size = (element: HTMLElement) => ({ width: element.offsetWidth, height: element.offsetHeight })

      // SAFETY: the bundle's global is drop-preview-rules.ts's exports.
      // @ts-expect-error The bundle's global.
      const { dropPreviewSheet, markPreviewCopy } = previews
      // SAFETY: a deep clone of an element is an element of the same kind.
      const copy = card.cloneNode(true) as HTMLElement
      markPreviewCopy(copy)
      row.append(copy)

      // Without the preview's rules, as the copy was drawn before.
      const bare = size(copy)
      frame.adoptedStyleSheets = [...frame.adoptedStyleSheets, dropPreviewSheet(frame.adoptedStyleSheets)]

      return {
        layer: size(card),
        bare,
        copy: size(copy),
        title: getComputedStyle(copy.firstElementChild!).fontSize,
        layers: frame.querySelectorAll("[data-canvas-node]").length
      }
    })
  })

  it("lost its layer's size without the preview's rules", () => {
    expect(drawn.bare).not.toEqual(drawn.layer)
  })

  it("is laid out at its layer's size with them", () => {
    expect(drawn.copy).toEqual(drawn.layer)
  })

  it("draws what's inside it by the rules about its parent too", () => {
    expect(drawn.title).toBe("20px")
  })

  it("is never found where the frame looks for its layers", () => {
    // The row, the card and its title, and nothing of the copy.
    expect(drawn.layers).toBe(3)
  })
})
