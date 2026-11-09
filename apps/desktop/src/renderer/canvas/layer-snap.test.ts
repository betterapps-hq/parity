import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// What a layer snaps to is measured in a real frame (`LayerSnapping.measure`), so this lays one out in Chrome: Node
// has no layout. It needs Chrome installed.
let browser: Browser
let page: Page

const entry = `export { LayerSnapping } from "./layer-snap.ts"
export { snapLayer } from "@parity-app/editor"`

/**
 * A design whose Events layout is placed absolutely, with a border, holding a Review slot; and two cards, components
 * each holding a badge placed absolutely in their slot. The Panel card draws with a transform, so its badge's insets
 * count from it. The Plain card isn't positioned, so its badge's insets count from the root.
 */
const badgeIn = (card: string) => ({
  type: "component",
  id: card,
  component: "Card",
  slots: {
    children: [
      { type: "text", id: `${card}-badge`, text: "New", style: { position: "absolute", top: 2, left: 2 } },
      { type: "text", id: `${card}-title`, text: "Title" }
    ]
  }
})

const container = {
  id: "day",
  name: "Day",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    children: [
      {
        type: "layout",
        id: "events",
        style: { position: "absolute", top: 50, left: 4 },
        children: [{ type: "text", id: "review", text: "Review", style: { position: "absolute", top: 10, left: 0 } }]
      },
      badgeIn("panel"),
      badgeIn("plain")
    ]
  },
  states: [{ id: "default", name: "Default" }]
}

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "snapping",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
  await page.setContent(
    `<body style="margin: 0"><div id="camera" style="transform-origin: 0 0; transform: scale(0.5)">
      <div id="host" style="width: 832px"></div></div></body>`
  )
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
  // A frame like the canvas's, drawn at half size: the layers in a shadow root, each marked with its id.
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#host")!

    const card = (id: string, look: string) => `<div data-canvas-node="${id}" style="margin: 40px 0 0 100px;
        width: 400px; height: 200px; border: 4px solid; ${look}">
        <div style="padding: 20px">
          <span data-canvas-node="${id}-badge" style="position: absolute; top: 8px; left: 8px; width: 60px;
            height: 20px"></span>
          <span data-canvas-node="${id}-title" style="display: block; width: 100px; height: 20px"></span>
        </div>
      </div>`

    host.attachShadow({ mode: "open" }).innerHTML = `<div data-canvas-node="root" style="position: relative;
      padding-top: 520px">
      <div data-canvas-node="events" style="position: absolute; top: 200px; left: 16px; width: 400px; height: 300px;
        border: 4px solid">
        <span data-canvas-node="review" style="position: absolute; top: 40px; left: 0; width: 120px; height: 20px"></span>
      </div>
      ${card("panel", "transform: translateZ(0)")}
      ${card("plain", "")}
    </div>`
  })
})

afterAll(async () => {
  await browser?.close()
})

/** Where a layer goes across, in frame pixels, moved `by` frame pixels from where it is, and whether it locked. */
function moved(layer: string, by: number) {
  return page.evaluate(
    ({ container, layer, by }) => {
      const host = document.querySelector<HTMLElement>("#host")!
      // @ts-expect-error The bundle's global.
      const measured = snapping.LayerSnapping.measure(undefined, host, container, layer, 0.5)
      const from = measured.box
      // @ts-expect-error The bundle's global.
      const snapped = snapping.snapLayer({ ...from, x: from.x + by }, measured.scene, 0.5)

      return { from: from.x, x: snapped.box.x, locked: snapped.locked.x }
    },
    { container, layer, by }
  )
}

describe("what a layer snaps to, measured in a frame", () => {
  it("snaps to the inside of its parent's border, in the frame's own pixels at any zoom", async () => {
    // Events starts at 16 with a 4px border, so its inside starts at 20, where Review is; 3px right of it snaps back.
    expect(await moved("review", 3)).toEqual({ from: 20, x: 20, locked: true })
  })

  it("snaps to the box its insets count from in a component's slot, a transformed component's own", async () => {
    // The Panel card starts at 100 with a 4px border and draws with a transform, so its badge's insets count from 104,
    // and 2px right of there snaps back to it.
    expect(await moved("panel-badge", -6)).toEqual({ from: 112, x: 104, locked: true })
  })

  it("snaps to the box its insets count from in a component's slot, further up than the component", async () => {
    // The Plain card isn't positioned, so its badge's insets count from the root, at 0: it's drawn at 8, and 3px from
    // there snaps to 0. The card's right edge, at 508, which its insets don't count from, isn't a line it snaps to:
    // the badge's right edge 2px from it stays.
    expect(await moved("plain-badge", -5)).toEqual({ from: 8, x: 0, locked: true })
    expect(await moved("plain-badge", 438)).toEqual({ from: 8, x: 446, locked: false })
  })
})
