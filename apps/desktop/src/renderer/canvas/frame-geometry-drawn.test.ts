import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// A frame's geometry is read from where the browser draws it (`frameGeometry`), so this lays one out in Chrome: Node
// has no layout. It needs Chrome installed. The frame is drawn as the canvas draws one: inside a layer the camera
// transforms, as tldraw's is, and scaled by its own `zoom`, as ModeView scales a companion mode's frame. Every answer
// is checked across the camera's zoom, the frame's scale and a transform in the design, since each of the three used
// to be worked out its own way.
let browser: Browser
let page: Page

const entry = `export { areaSpace, frameGeometry, frameSize, toFrame, toScreen } from "./frame-geometry.ts"`

/**
 * The camera's zooms, from as far out as the canvas goes to well in, and a frame's own scales. Half size is one the
 * browser lays out exactly; see the last suite for one it can't.
 */
const zooms = [0.05, 0.1, 0.37, 1, 2.6]
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
    globalName: "geometry",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  // The canvas area sits in from the window's corner, as it does beside the panels; the camera's layer is inside it.
  await page.setContent(
    `<body style="margin: 0"><div id="area" style="position: absolute; left: 240px; top: 48px; width: 900px;
      height: 800px; overflow: hidden"><div id="camera" style="position: absolute; transform-origin: 0 0">
      <div id="host" style="width: 832px"></div></div></div></body>`
  )
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
  // The layers in a shadow root, each marked with its id. Events is a layout with a border and padding, holding a
  // layer placed absolutely. Card is drawn a quarter bigger by a transform, so its badge's insets count from it, in its
  // own pixels. Turned is on its side. Label is text in a line, which has no width of its own to compute.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("#host")!.attachShadow({ mode: "open" }).innerHTML = `
      <div data-canvas-node="root" style="position: relative; height: 900px">
        <div data-canvas-node="events" style="position: absolute; top: 200px; left: 16px; width: 400px; height: 300px;
          box-sizing: border-box; border: 4px solid; padding: 12px 20px 8px 16px">
          <span data-canvas-node="review" style="position: absolute; top: 40px; left: 10px; width: 120px;
            height: 20.5px"></span>
        </div>
        <div data-canvas-node="card" style="position: absolute; top: 560px; left: 100px; width: 200px;
          height: 100px; border: 2px solid; padding: 10px; transform-origin: 0 0; transform: scale(1.25)">
          <span data-canvas-node="badge" style="position: absolute; top: 8px; left: 6px; width: 40px;
            height: 16px"></span>
        </div>
        <div data-canvas-node="turned" style="position: absolute; top: 20px; left: 500px; width: 200px;
          height: 40px; padding: 4px; transform: rotate(90deg)"></div>
        <p style="position: absolute; top: 760px; left: 16px; margin: 0; font: 16px/20px monospace">
          <span data-canvas-node="label">Label</span>
        </p>
      </div>`
  })
})

afterAll(async () => {
  await browser?.close()
})

/** Draws the frame with the camera at `zoom`, panned a little, and the frame at its own scale `own`. */
async function draw({ zoom, own }: { zoom: number; own: number }): Promise<void> {
  await page.evaluate(
    ({ zoom, own }) => {
      // tldraw writes the camera as a scale then a translate, in the page's units.
      document.querySelector<HTMLElement>("#camera")!.style.transform = `scale(${zoom}) translate(37px, 21px)`
      document.querySelector<HTMLElement>("#host")!.style.zoom = String(own)
    },
    { zoom, own }
  )
}

/** What the module answers for the frame as it's drawn now, in the frame's own pixels wherever it says screen. */
function read() {
  return page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#host")!
    // @ts-expect-error The bundle's global.
    const { areaSpace, frameGeometry, frameSize, toFrame, toScreen } = geometry
    const frame = frameGeometry(host)
    const drawn = { rect: frame.rect, scale: frame.scale }
    const node = (id: string) => frame.node(id)
    const box = (id: string) => toFrame(drawn, node(id).box)
    const corner = toScreen(drawn, { x: 16, y: 200 })
    const events = host.shadowRoot!.querySelector("[data-canvas-node=events]")!.getBoundingClientRect()

    return {
      scale: frame.scale,
      frame: toFrame(drawn, frame.rect),
      inArea: areaSpace(document.querySelector("#area")!).box(frame.rect),
      events: {
        box: box("events"),
        size: frameSize(drawn, node("events").box),
        scale: node("events").scale,
        border: node("events").border,
        padding: node("events").padding,
        paddingBox: toFrame(drawn, node("events").paddingBox),
        contentBox: toFrame(drawn, node("events").contentBox),
        // Where the frame's own pixel (16, 200) is on screen, against where the browser drew Events' corner.
        cornerOff: Math.hypot(corner.x - events.left, corner.y - events.top)
      },
      review: {
        box: box("review"),
        parentContentBox: toFrame(drawn, node("review").parentContentBox),
        offsetBox: toFrame(drawn, node("review").offsetBox),
        insets: node("review").insets
      },
      card: { scale: node("card").scale, contentBox: toFrame(drawn, node("card").contentBox) },
      badge: {
        scale: node("badge").scale,
        insets: node("badge").insets,
        offsetBox: toFrame(drawn, node("badge").offsetBox)
      },
      turned: { scale: node("turned").scale },
      label: { scale: node("label").scale },
      missing: node("missing") === undefined
    }
  })
}

type Numbers = { [key: string]: number }

/**
 * Each number to within a hundredth of a pixel of the design. The browser gives boxes as 32-bit floats, which at 2.5%
 * leaves a frame's pixels known to about a thousandth.
 */
const near = <T extends Numbers>(numbers: T) =>
  Object.fromEntries(Object.entries(numbers).map(([key, value]) => [key, expect.closeTo(value, 2)]))

describe.each(drawnAt)("a frame drawn with the camera at $zoom and its own scale at $own", ({ zoom, own }) => {
  let drawn: Awaited<ReturnType<typeof read>>

  beforeAll(async () => {
    await draw({ zoom, own })
    drawn = await read()
  })

  it("has one scale: the camera's zoom times its own", () => {
    expect(drawn.scale / (zoom * own)).toBeCloseTo(1, 4)
  })

  it("is 832 of its own pixels wide from its own corner, and counted from the area's corner on the overlay", () => {
    expect(drawn.frame).toEqual(near({ x: 0, y: 0, w: 832, h: 900 }))
    // The camera's layer starts at the area's corner, and is panned 37 by 21 of the page's units.
    expect(drawn.inArea).toEqual(near({ x: 37 * zoom, y: 21 * zoom, w: 832 * zoom * own, h: 900 * zoom * own }))
  })

  it("gives a node's box and size in the design's pixels", () => {
    expect(drawn.events.box).toEqual(near({ x: 16, y: 200, w: 400, h: 300 }))
    expect(drawn.events.size).toEqual(near({ width: 400, height: 300 }))
    expect(drawn.review.box).toEqual(near({ x: 30, y: 244, w: 120, h: 20.5 }))
    expect(drawn.events.cornerOff).toBeLessThan(0.01)
  })

  it("gives a node's own scale as the frame's, with nothing transforming it", () => {
    expect(drawn.events.scale / drawn.scale).toBeCloseTo(1, 4)
  })

  it("gives the boxes inside a node's border and padding", () => {
    expect(drawn.events.border).toEqual({ left: 4, top: 4, right: 4, bottom: 4 })
    expect(drawn.events.padding).toEqual({ left: 16, top: 12, right: 20, bottom: 8 })
    expect(drawn.events.paddingBox).toEqual(near({ x: 20, y: 204, w: 392, h: 292 }))
    expect(drawn.events.contentBox).toEqual(near({ x: 36, y: 216, w: 356, h: 272 }))
  })

  it("gives the content box of what a node is laid out in, and the box its insets count from", () => {
    expect(drawn.review.parentContentBox).toEqual(drawn.events.contentBox)
    expect(drawn.review.offsetBox).toEqual(drawn.events.paddingBox)
  })

  it("gives an absolutely placed node's insets as the design writes them", () => {
    expect(drawn.review.insets).toEqual(near({ left: 10, top: 40, right: 262, bottom: 231.5 }))
  })

  it("scales a transformed node's own sides by the frame's scale times its transform", () => {
    expect(drawn.card.scale / drawn.scale).toBeCloseTo(1.25, 3)
    // 224 by 124 laid out, drawn a quarter bigger from its corner; its content starts 12 of its own pixels in.
    expect(drawn.card.contentBox).toEqual(near({ x: 115, y: 575, w: 250, h: 125 }))
  })

  it("counts insets from a transformed containing block in that block's own pixels", () => {
    expect(drawn.badge.scale / drawn.scale).toBeCloseTo(1.25, 2)
    expect(drawn.badge.offsetBox).toEqual(near({ x: 102.5, y: 562.5, w: 275, h: 150 }))
    expect(drawn.badge.insets).toEqual(near({ left: 6, top: 8, right: 174, bottom: 96 }))
  })

  it("stands the frame's scale in for a node turned on its side, which has no one scale", () => {
    expect(drawn.turned.scale).toBe(drawn.scale)
  })

  it("reads the scale of text in a line from its offset size", () => {
    // Its offset size is rounded to the pixel, so it's close rather than exact.
    expect(drawn.label.scale / drawn.scale).toBeCloseTo(1, 1)
  })

  it("has nothing for a node the frame doesn't draw", () => {
    expect(drawn.missing).toBe(true)
  })
})

describe("a frame's geometry as the camera moves", () => {
  it("is read again each time it's asked, so nothing is left from before the camera moved", async () => {
    await draw({ zoom: 1, own: 1 })

    const scales = await page.evaluate(() => {
      // @ts-expect-error The bundle's global.
      const frame = geometry.frameGeometry(document.querySelector<HTMLElement>("#host")!)
      const review = frame.node("review")
      const before = { scale: frame.scale, left: review.box.left }
      document.querySelector<HTMLElement>("#camera")!.style.transform = "scale(0.5) translate(37px, 21px)"

      return { before, after: { scale: frame.scale, left: frame.node("review").box.left } }
    })

    expect(scales.before.scale).toBeCloseTo(1, 5)
    expect(scales.after.scale).toBeCloseTo(0.5, 5)
    // 240 for the area, then 37 of pan and 30 into the frame, at each zoom.
    expect(scales.before.left).toBeCloseTo(240 + 67, 3)
    expect(scales.after.left).toBeCloseTo(240 + 33.5, 3)
  })

  it("answers what a scaled frame draws, where the browser rounds a border to whole pixels of the screen", async () => {
    // At two fifths, a 4px border is 1.6px on screen, which Chrome draws as 1: two and a half of the design's pixels.
    // Events' inside is then 3px wider and taller than the design says, and what's placed in it sits where that puts
    // it, so its insets are read from what's drawn rather than worked out from the design.
    await draw({ zoom: 1, own: 0.4 })
    const drawn = await read()

    expect(drawn.scale).toBeCloseTo(0.4, 4)
    expect(drawn.events.border).toEqual({ left: 2.5, top: 2.5, right: 2.5, bottom: 2.5 })
    expect(drawn.review.insets!.left).toBeCloseTo(10, 1)
    expect(drawn.review.insets!.right).toBeCloseTo(265, 1)
  })

  it("has a scale of 1 standing in for a frame that isn't drawn", async () => {
    const scale = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      host.style.display = "none"
      // @ts-expect-error The bundle's global.
      const { scale } = geometry.frameGeometry(host)
      host.style.display = ""

      return scale
    })

    expect(scale).toBe(1)
  })
})
