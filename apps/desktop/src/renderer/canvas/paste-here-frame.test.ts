import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test"

// Paste here measures the layout under the pointer in a real frame (`measureHere`), so this lays one out in Chrome:
// Node has no layout. It needs Chrome installed.
let browser: Browser
let page: Page

const entry = `export { pasteHere } from "@parity-app/editor"
export { HereMeasures, measureHere } from "./paste-here.ts"`

/**
 * The dashboard's stat cards in a four-column grid, a day of a calendar whose Events layout is placed absolutely and
 * has a border, a hidden card, and a code component, a card that draws a title of its own above the layers in its
 * default slot and those in its footer.
 */
const container = {
  id: "dashboard",
  name: "Dashboard",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    children: [
      {
        type: "layout",
        id: "stats",
        style: { display: "grid", columns: 4 },
        children: ["revenue", "users", "hidden", "issues", "uptime"].map((id) => ({ type: "text", id, text: id }))
      },
      {
        type: "layout",
        id: "events",
        style: { position: "absolute", top: 50, left: 4 },
        children: [{ type: "text", id: "review", text: "Review" }]
      },
      {
        type: "component",
        id: "plan",
        component: "ui/Card",
        slots: {
          children: ["price", "seats"].map((id) => ({ type: "text", id, text: id })),
          footer: [{ type: "text", id: "buy", text: "Buy" }]
        }
      }
    ]
  },
  states: [{ id: "default", name: "Default" }]
}

const card = { type: "text", id: "pasted", text: "Pasted" }

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "here",
    platform: "browser"
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
  await page.setContent(
    `<body style="margin: 0"><div id="camera" style="transform-origin: 0 0"><div id="host"></div></div></body>`
  )
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
})

afterAll(async () => {
  await browser?.close()
})

beforeEach(async () => {
  // A frame like the canvas's, 832px wide, drawn at half size: the layers in a shadow root, each marked with its id.
  await page.evaluate(() => {
    const camera = document.querySelector<HTMLElement>("#camera")!
    camera.style.transform = "scale(0.5)"
    const host = document.querySelector<HTMLElement>("#host")!
    host.style.width = "832px"
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" })

    const cell = (id: string, hidden = false) =>
      `<span data-canvas-node="${id}" style="height: 100px; ${hidden ? "display: none" : ""}">${id}</span>`

    shadow.innerHTML = `<div data-canvas-node="root" style="position: relative; height: 600px">
      <div data-canvas-node="stats" style="display: grid; grid-template-columns: repeat(4, 200px); gap: 16px">
        ${cell("revenue")}${cell("users")}${cell("hidden", true)}${cell("issues")}${cell("uptime")}
      </div>
      <div data-canvas-node="events" style="position: absolute; top: 200px; left: 16px; width: 400px; height: 300px;
        border: 4px solid">
        ${cell("review")}
      </div>
      <div data-canvas-node="plan" style="position: absolute; top: 200px; left: 480px; width: 320px; padding: 20px">
        <div style="height: 40px">Pro</div>
        <div style="display: flex; gap: 20px; height: 100px">
          <div style="display: contents">${cell("price")}${cell("seats")}</div>
        </div>
        <footer style="height: 60px">${cell("buy")}</footer>
      </div>
    </div>`
  })
})

/** Measures the layout under a point, given as frame pixels, and pastes a card there. */
function pasteAt(chain: string[], point: { x: number; y: number }) {
  return page.evaluate(
    ({ container, chain, point, card }) => {
      type Node = { id: string; style?: unknown; children?: Node[]; slots?: Record<string, Node[]> }

      const host = document.querySelector<HTMLElement>("#host")!
      const inside = (node: Node) => [...(node.children ?? []), ...Object.values(node.slots ?? {}).flat()]

      const find = (node: Node, id: string): Node | undefined =>
        node.id === id
          ? node
          : inside(node).reduce<Node | undefined>((found, child) => found ?? find(child, id), undefined)

      const hit = {
        entry: { key: "app.par#dashboard", path: "app.par", container },
        host,
        mode: "desktop",
        state: "default",
        chain: chain.map((id) => find(container.root, id)),
        path: chain
      }

      // Frame pixels to the screen's, at the camera's half size.
      const screen = { x: point.x / 2, y: point.y / 2 }
      // @ts-expect-error The bundle's global.
      const measured = here.measureHere(hit, screen, 4)
      // @ts-expect-error The bundle's global.
      const pasted = here.pasteHere(container, [card], measured, container.states[0])
      const parent = find(pasted.container.root, measured.layout)
      const siblings = (measured.slot ? parent?.slots?.[measured.slot] : parent?.children) ?? []

      return {
        layout: measured.layout,
        slot: measured.slot,
        scale: measured.scale,
        order: siblings.map((child) => (child.id === pasted.copies[0] ? "pasted" : child.id)),
        style: siblings.find((child) => child.id === pasted.copies[0])?.style
      }
    },
    { container, chain, point, card }
  )
}

describe("paste here, measured in a frame", () => {
  it("finds the slot under the pointer in a grid drawn at half size", async () => {
    // Past the middle of Users (216 to 416), short of Issues's: after Users, and after the hidden card beside it.
    const result = await pasteAt(["root", "stats"], { x: 330, y: 50 })
    expect(result.scale).toBeCloseTo(0.5)
    expect(result.order).toEqual(["revenue", "users", "hidden", "pasted", "issues", "uptime"])
    expect(result.style).toBeUndefined()
  })

  it("goes before the first card, and after the last on the next line", async () => {
    expect((await pasteAt(["root", "stats"], { x: 40, y: 50 })).order[0]).toBe("pasted")
    expect((await pasteAt(["root", "stats"], { x: 800, y: 50 })).order.at(-1)).toBe("pasted")
  })

  it("places it at the pointer in an absolutely placed layout, from inside its border", async () => {
    // 96px right of Events's left edge and 64px below its top, less its 4px border: 92 and 60 frame pixels, which are
    // 23 and 15 steps of 4px.
    const result = await pasteAt(["root", "events"], { x: 16 + 96, y: 200 + 64 })
    expect(result.layout).toBe("events")
    expect(result.order).toEqual(["review", "pasted"])
    expect(result.style).toEqual({ position: "absolute", left: 23, top: 15 })
  })

  it("measures the deepest of the design's own layouts under the pointer", async () => {
    const result = await pasteAt(["root", "stats", "users"], { x: 330, y: 50 })
    expect(result.layout).toBe("stats")
  })

  it("finds a component's slot under the pointer, by the element its layers are drawn in", async () => {
    // Plan's layers start 20px inside it, at 500: just inside Price, before its middle, it goes first.
    const first = await pasteAt(["root", "plan", "price"], { x: 502, y: 300 })
    expect(first).toMatchObject({ layout: "plan", slot: "children", order: ["pasted", "price", "seats"] })
    // Over the row past Seats, though not over a layer: after Seats.
    const after = await pasteAt(["root", "plan"], { x: 790, y: 300 })
    expect(after).toMatchObject({ layout: "plan", slot: "children", order: ["price", "seats", "pasted"] })
    // In the footer, the other slot.
    const footer = await pasteAt(["root", "plan"], { x: 700, y: 400 })
    expect(footer).toMatchObject({ layout: "plan", slot: "footer", order: ["buy", "pasted"] })
  })

  it("measures the layout under a drag once while the pointer stays over it", async () => {
    const counts = await page.evaluate((container) => {
      const host = document.querySelector<HTMLElement>("#host")!
      const camera = document.querySelector<HTMLElement>("#camera")!
      const stats = container.root.children[0]!

      const hit = {
        entry: { key: "app.par#dashboard", path: "app.par", container },
        host,
        mode: "desktop",
        state: "default",
        chain: [container.root, stats],
        path: ["root", "stats"]
      }

      // @ts-expect-error The bundle's global.
      const measures = new here.HereMeasures()
      // @ts-expect-error The bundle's global.
      const children = (x: number) => here.measureHere(hit, { x, y: 25 }, 4, measures).children.length

      const hide = (id: string) => {
        const cell = host.shadowRoot!.querySelector<HTMLElement>(`[data-canvas-node="${id}"]`)!
        cell.style.display = "none"
      }

      const first = children(100)
      // Hidden after it was measured: the drag goes on with what was measured, at another point in the same grid.
      hide("revenue")
      const kept = children(160)
      // Panned, so the frame is somewhere else on screen: measured again.
      camera.style.transform = "translate(10px, 0) scale(0.5)"
      const panned = children(170)

      return { first, kept, panned }
    }, container)

    expect(counts).toEqual({ first: 4, kept: 4, panned: 3 })
  })

  it("goes to the layout around a component where none of its slots is under the pointer", async () => {
    // Over the title the card draws itself.
    const result = await pasteAt(["root", "plan"], { x: 600, y: 240 })
    expect(result.layout).toBe("root")
    expect(result.slot).toBeUndefined()
  })
})
