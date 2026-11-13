import { fileURLToPath } from "node:url"
import type { DrawnBox } from "@parity-app/editor"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// A skeleton is measured from where the browser draws the frame, so this lays one out in Chrome: Node has no layout. It
// needs Chrome installed. The frame is drawn as the canvas draws one: inside a layer the camera transforms, as tldraw's
// is, and scaled by its own `zoom`, as ModeView scales a companion mode's frame.
let browser: Browser
let page: Page

const entry = `export { measureFrame } from "./frame-skeletons.ts"`

/** The camera's zooms, from as far out as the canvas goes to 100%, and a frame's own scales. */
const zooms = [0.05, 0.1, 0.37, 1]
const frameScales = [1, 0.5]
const drawnAt = zooms.flatMap((zoom) => frameScales.map((own) => ({ zoom, own })))

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    // frame.ts reads scrollbars.css as text, as Vite's `?raw` gives it.
    loader: { ".css": "text" },
    write: false,
    format: "iife",
    globalName: "skeletons",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  await page.setContent(
    `<body style="margin: 0"><div id="area" style="position: absolute; left: 240px; top: 48px; width: 900px;
      height: 800px; overflow: hidden"><div id="camera" style="position: absolute; transform-origin: 0 0">
      <div id="host" data-frame style="width: 832px"></div></div></div></body>`
  )
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
  // A page with a background, a card with a border all round holding a picture and a line of text, and a box that's
  // hidden, which draws nothing.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("#host")!.attachShadow({ mode: "open" }).innerHTML = `
      <div data-canvas-node="root" style="position: relative; height: 900px; background: rgb(250, 250, 250)">
        <div data-canvas-node="card" style="position: absolute; top: 200px; left: 16px; width: 400px; height: 300px;
          box-sizing: border-box; border: 4px solid rgb(0, 0, 255); border-radius: 12px">
          <img data-canvas-node="picture" style="position: absolute; top: 20px; left: 20px; width: 120px;
            height: 80px" alt="">
          <p style="position: absolute; top: 140px; left: 20px; margin: 0; font: 16px/20px monospace;
            color: rgb(20, 20, 20)">Label</p>
        </div>
        <div data-canvas-node="hidden" style="position: absolute; top: 600px; left: 16px; width: 100px;
          height: 100px; background: red; visibility: hidden"></div>
      </div>`
  })
})

afterAll(async () => {
  await browser?.close()
})

/** Draws the frame with the camera at `zoom`, panned a little, and the frame at its own scale `own`, then measures it. */
async function measure({ zoom, own }: { zoom: number; own: number }) {
  return page.evaluate(
    ({ zoom, own }) => {
      // tldraw writes the camera as a scale then a translate, in the page's units.
      document.querySelector<HTMLElement>("#camera")!.style.transform = `scale(${zoom}) translate(37px, 21px)`
      const host = document.querySelector<HTMLElement>("#host")!
      host.style.zoom = String(own)

      // SAFETY: the bundle's global is frame-skeletons.ts's exports, whose measureFrame returns this.
      // @ts-expect-error The bundle's global.
      return skeletons.measureFrame(host) as { height: number; drawn: DrawnBox[] } | undefined
    },
    { zoom, own }
  )
}

/**
 * Each number to within a hundredth of a pixel of the design. The browser gives boxes as 32-bit floats, which at 2.5%
 * leaves a frame's pixels known to about a thousandth.
 */
const near = (box: { x: number; y: number; width: number; height: number }) =>
  Object.fromEntries(Object.entries(box).map(([key, value]) => [key, expect.closeTo(value, 2)]))

describe.each(drawnAt)("a frame drawn with the camera at $zoom and its own scale at $own", ({ zoom, own }) => {
  let measured: Awaited<ReturnType<typeof measure>>
  let text: DrawnBox[]

  beforeAll(async () => {
    measured = await measure({ zoom, own })
    text = measured?.drawn.filter((box) => box.kind === "text") ?? []
  })

  it("is as tall as the design, in its own pixels", () => {
    expect(measured?.height).toBeCloseTo(900, 2)
  })

  it("gives what it draws in the design's pixels, in the order it draws it", () => {
    expect(measured?.drawn.map((box) => box.kind)).toEqual(["surface", "surface", "media", "text"])

    const [page, card, picture] = measured!.drawn

    expect(page).toMatchObject({ ...near({ x: 0, y: 0, width: 832, height: 900 }), color: "rgb(250, 250, 250)" })
    expect(card).toMatchObject({ ...near({ x: 16, y: 200, width: 400, height: 300 }), border: "rgb(0, 0, 255)" })
    expect(card?.radius).toBe(12)
    expect(picture).toMatchObject(near({ x: 40, y: 224, width: 120, height: 80 }))
  })

  it("puts a line of text where it's laid out", () => {
    // Inside the card's border, 20 by 140 in. The glyphs' box is the font's, inside its 20 pixel line, which a frame's own
    // zoom can round, so it's checked to within half a pixel.
    expect(text).toHaveLength(1)
    expect(text[0]!.x).toBeCloseTo(40, 0)
    expect(text[0]!.y).toBeGreaterThan(343.5)
    expect(text[0]!.y + text[0]!.height).toBeLessThan(364.5)
    expect(text[0]!.color).toBe("rgb(20, 20, 20)")
  })
})

describe("a frame with nothing to measure", () => {
  it("has no skeleton before it draws its design", async () => {
    const drawn = await page.evaluate(() => {
      const empty = document.createElement("div")
      empty.style.width = "832px"
      empty.attachShadow({ mode: "open" }).innerHTML = "<div>Loading</div>"
      document.querySelector("#camera")!.append(empty)

      // @ts-expect-error The bundle's global.
      const measured = skeletons.measureFrame(empty)
      empty.remove()

      return measured
    })

    expect(drawn).toBeUndefined()
  })

  it("has no skeleton while it isn't drawn", async () => {
    const drawn = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      host.style.display = "none"

      // @ts-expect-error The bundle's global.
      const measured = skeletons.measureFrame(host)
      host.style.display = ""

      return measured
    })

    expect(drawn).toBeUndefined()
  })
})
