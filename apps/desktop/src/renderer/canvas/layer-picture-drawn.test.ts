import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// A picture's copies are styled by the frame's stylesheets, which only a browser applies, so this draws one in Chrome. It
// needs Chrome installed. The card is drawn by the frame's own rules, written against its node as a frame writes them
// (`nodeSelector`), with nothing inline: a picture that dropped the attribute those rules match would carry it bare.
let browser: Browser
let page: Page

const entry = `export { layerPicture } from "./layer-picture.ts"`

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "pictures",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  await page.setContent(
    `<body style="margin: 0"><div id="host" data-frame style="width: 600px; height: 400px"></div></body>`
  )
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>("#host")!.attachShadow({ mode: "open" })
    const rules = new CSSStyleSheet()
    rules.replaceSync(`
      [data-canvas-node="card"] { position: absolute; left: 40px; top: 60px; width: 200px; height: 120px;
        background: rgb(0, 128, 0); border: 3px solid rgb(0, 0, 255) }
      [data-canvas-node="card"] > [data-canvas-node="title"] { color: rgb(255, 0, 0) }
      [data-canvas-node="badge"] { position: absolute; left: 300px; top: 200px; width: 80px; height: 40px;
        background: rgb(255, 165, 0); scale: 1.5; rotate: 30deg; translate: 10px 6px; transition: scale 1s, rotate 1s }`)
    frame.adoptedStyleSheets = [rules]
    frame.innerHTML = `<div data-canvas-body><div data-canvas-node="card"><p data-canvas-node="title">Plans</p></div>
      <div data-canvas-node="badge"></div></div>`
  })
})

afterAll(async () => {
  await browser?.close()
})

describe("a picture of a layer the frame's rules draw", () => {
  let drawn: { background: string; border: string; title: string; layers: number; found: number }

  beforeAll(async () => {
    drawn = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const card = host.shadowRoot!.querySelector('[data-canvas-node="card"]')!

      // SAFETY: the bundle's global is layer-picture.ts's exports, whose layerPicture returns this.
      // @ts-expect-error The bundle's global.
      const picture = pictures.layerPicture(host, [card], 1) as HTMLElement
      document.body.append(picture)

      // The card's copy is the first thing the body's stand-in holds, in the layer's place.
      const copied = picture.querySelector("div")!.shadowRoot!.querySelector("[data-canvas-body] > * > *")!
      const copy = getComputedStyle(copied)
      const title = getComputedStyle(copied.firstElementChild!)

      return {
        background: copy.backgroundColor,
        border: copy.borderTopColor,
        title: title.color,
        // What the canvas finds layers by: the frames' shadow roots, never the page itself.
        layers: [...document.querySelectorAll("[data-frame]")].flatMap((frame) => [
          ...frame.shadowRoot!.querySelectorAll("[data-canvas-node]")
        ]).length,
        found: document.querySelectorAll("[data-canvas-node]").length
      }
    })
  })

  it("draws the copy as the frame's rules draw the layer", () => {
    expect(drawn.background).toBe("rgb(0, 128, 0)")
    expect(drawn.border).toBe("rgb(0, 0, 255)")
  })

  it("draws what's inside it by the rules about its parent too", () => {
    expect(drawn.title).toBe("rgb(255, 0, 0)")
  })

  it("adds no layers where the canvas looks for them", () => {
    expect(drawn.layers).toBe(3)
    expect(drawn.found).toBe(0)
  })
})

describe("a picture of a layer scaled, turned and moved by its own transforms", () => {
  let drawn: { layer: Box; copy: Box; picture: Box; animating: number; after: Box }

  beforeAll(async () => {
    drawn = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const badge = host.shadowRoot!.querySelector<HTMLElement>('[data-canvas-node="badge"]')!
      const box = ({ left, top, width, height }: DOMRect) => ({ left, top, width, height })
      const layer = box(badge.getBoundingClientRect())

      // SAFETY: as above.
      // @ts-expect-error The bundle's global.
      const picture = pictures.layerPicture(host, [badge], 1) as HTMLElement
      document.body.append(picture)
      const copied = picture.querySelector("div")!.shadowRoot!.querySelector("[data-canvas-body] > * > *")!

      return {
        layer,
        copy: box(copied.getBoundingClientRect()),
        picture: box(picture.getBoundingClientRect()),
        // Measuring it without its transforms doesn't set off its own transition.
        animating: badge.getAnimations().length,
        after: box(badge.getBoundingClientRect())
      }
    })
  })

  it("draws the copy just as the layer is drawn, transformed once", () => {
    // The picture is the layer's box on screen, so the copy fills it from its top-left.
    expect(drawn.copy.left - drawn.picture.left).toBeCloseTo(0, 1)
    expect(drawn.copy.top - drawn.picture.top).toBeCloseTo(0, 1)
    expect(drawn.copy.width).toBeCloseTo(drawn.layer.width, 1)
    expect(drawn.copy.height).toBeCloseTo(drawn.layer.height, 1)
  })

  it("leaves the layer as it was drawn, with nothing animating", () => {
    expect(drawn.animating).toBe(0)
    expect(drawn.after).toEqual(drawn.layer)
  })
})

interface Box {
  left: number
  top: number
  width: number
  height: number
}
