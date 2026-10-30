import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test"

// Drop targets are measured from real layout, so this lays a grid out in Chrome: Node has no layout. It needs Chrome
// installed.
let browser: Browser
let page: Page

const entry = `export { DragLayouts, dropInFrame } from "./drop-target.ts"`

/**
 * The dashboard's stats: four cards in a four-column grid. They're instances of a stat card there; as layouts, each
 * could take a drop itself.
 */
const cards = ["revenue", "users", "issues", "uptime"]
function board(kind: "instance" | "layout") {
  const card = (id: string) =>
    kind === "instance"
      ? { type: "instance", id, design: "stat-card" }
      : { type: "layout", id, children: [{ type: "text", id: `${id}-label`, text: id }] }
  return {
    key: "board",
    path: "board.par",
    container: {
      id: "board",
      name: "Board",
      root: {
        type: "layout",
        id: "root",
        children: [
          { type: "layout", id: "stats", style: { display: "grid", columns: 4 }, children: cards.map(card) },
          { type: "layout", id: "panel", children: [{ type: "text", id: "panel-label", text: "Panel" }] }
        ]
      }
    }
  }
}
type Board = ReturnType<typeof board>

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))
  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "drop",
    platform: "browser"
  })
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(
    `<body style="margin: 0"><div id="camera" style="transform-origin: 0 0"><div id="host"></div></div></body>`
  )
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
}, 30_000)

afterAll(async () => {
  await browser?.close()
})

beforeEach(async () => {
  // A frame like the canvas's: the layers in a shadow root, each marked with its node's id.
  await page.evaluate((cards) => {
    const camera = document.querySelector<HTMLElement>("#camera")!
    camera.style.transform = ""
    const host = document.querySelector<HTMLElement>("#host")!
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" })
    shadow.innerHTML = `<div data-canvas-node="root" style="width: 832px; padding: 16px">
      <div data-canvas-node="stats" style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px">
        ${cards
          .map(
            (id) => `<div data-canvas-node="${id}" style="display: flex; flex-direction: column; height: 100px;
              padding: 12px; border: 1px solid"><span data-canvas-node="${id}-label">${id}</span></div>`
          )
          .join("")}
      </div>
      <div data-canvas-node="panel" style="display: flex; height: 80px; margin-top: 16px; border: 1px solid">
        <span data-canvas-node="panel-label">Panel</span>
      </div>
    </div>`
  }, cards)
})

type Box = { left: number; top: number; width: number; height: number }

/** Where each card is drawn now, by id. */
function boxes(): Promise<Record<string, Box>> {
  return page.evaluate(() => {
    const shadow = document.querySelector("#host")!.shadowRoot!
    return Object.fromEntries(
      [...shadow.querySelectorAll<HTMLElement>("[data-canvas-node]")].map((element) => {
        const { left, top, width, height } = element.getBoundingClientRect()
        return [element.dataset.canvasNode!, { left, top, width, height }]
      })
    )
  })
}

/**
 * Starts dragging a card: measures the frame, then hides the card where it was and shows a copy of it before `before`,
 * as the canvas's preview does. With `late`, the frame is measured after that instead, as it was before CAN-47.
 */
function startDrag(design: Board, card: string, before: string | null, late = false) {
  return page.evaluate(
    ({ design, card, before, late }) => {
      const host = document.querySelector<HTMLElement>("#host")!
      const shadow = host.shadowRoot!
      // @ts-expect-error The bundle's global.
      const layouts = new drop.DragLayouts()
      if (!late) layouts.measure(host, design.container.root)
      const original = shadow.querySelector<HTMLElement>(`[data-canvas-node="${card}"]`)!
      const copy = original.cloneNode(true) as HTMLElement
      for (const element of [copy, ...copy.querySelectorAll("[data-canvas-node]")]) {
        element.removeAttribute("data-canvas-node")
      }
      original.style.setProperty("display", "none", "important")
      const stats = shadow.querySelector('[data-canvas-node="stats"]')!
      stats.insertBefore(copy, before ? shadow.querySelector(`[data-canvas-node="${before}"]`) : null)
      if (late) layouts.measure(host, design.container.root)
      ;(window as unknown as { layouts: unknown }).layouts = layouts
    },
    { design, card, before, late }
  )
}

/** Where the dragged card would land with the pointer at a point. */
function dropAt(design: Board, card: string, point: { x: number; y: number }) {
  return page.evaluate(
    ({ design, card, point }) => {
      const host = document.querySelector<HTMLElement>("#host")!
      const layouts = (window as unknown as { layouts: unknown }).layouts
      // @ts-expect-error The bundle's global.
      const found = drop.dropInFrame(layouts, design, host, point, "board", [card])
      return found && { parent: found.target.parent, index: found.target.index, line: found.line }
    },
    { design, card, point }
  )
}

describe("reordering stat cards in a grid", () => {
  const design = board("instance")

  it("lands a card dragged right past the middle of the next but one after it", async () => {
    const issues = (await boxes()).issues!
    // Users, dragged right past the middle of Open issues, a little above the cards' middle.
    const point = { x: issues.left + issues.width * 0.8, y: issues.top + 30 }
    await startDrag(design, "users", "uptime")
    // Index 3 is before Uptime: Revenue, Issues, Users, Uptime.
    expect(await dropAt(design, "users", point)).toMatchObject({ parent: "stats", index: 3 })
  })

  it("lands a card dragged left past the middle of the first before it", async () => {
    const revenue = (await boxes()).revenue!
    await startDrag(design, "issues", "revenue")
    const point = { x: revenue.left + revenue.width * 0.3, y: revenue.top + revenue.height - 10 }
    expect(await dropAt(design, "issues", point)).toMatchObject({ parent: "stats", index: 0 })
  })

  it("marks the slot where the layout was, and follows the camera", async () => {
    const at = await boxes()
    const uptime = at.uptime!
    const point = { x: at.issues!.left + at.issues!.width * 0.8, y: at.issues!.top + 30 }
    await startDrag(design, "users", "uptime")
    expect((await dropAt(design, "users", point))?.line).toEqual({
      x: uptime.left - 2,
      y: uptime.top,
      w: 2,
      h: uptime.height
    })
    // The camera zooms out to half and pans: the same place in the frame is the same slot.
    await page.evaluate(() => {
      document.querySelector<HTMLElement>("#camera")!.style.transform = "translate(40px, 25px) scale(0.5)"
    })
    const moved = { x: 40 + point.x / 2, y: 25 + point.y / 2 }
    const found = await dropAt(design, "users", moved)
    expect(found).toMatchObject({ parent: "stats", index: 3 })
    expect(found?.line.x).toBeCloseTo(40 + (uptime.left - 2) / 2, 5)
    expect(found?.line.h).toBeCloseTo(uptime.height / 2, 5)
  })
})

describe("dragging a card beside cards that are layouts", () => {
  const design = board("layout")

  it("stays in its own slot until the pointer leaves it, though a neighbour slid there", async () => {
    const users = (await boxes()).users!
    // A little right of where Users' middle was: Open issues' middle, once it slid into Users' place.
    const point = { x: users.left + users.width / 2 + 10, y: users.top + users.height / 2 }
    await startDrag(design, "users", "issues")
    expect(await dropAt(design, "users", point)).toMatchObject({ parent: "stats", index: 2 })
  })

  it("would have jumped past that neighbour measured after the card was hidden, as before", async () => {
    const users = (await boxes()).users!
    const point = { x: users.left + users.width / 2 + 10, y: users.top + users.height / 2 }
    await startDrag(design, "users", null, true)
    expect(await dropAt(design, "users", point)).toMatchObject({ parent: "stats", index: 3 })
  })

  it("changes places with a neighbour it's dragged over, rather than going into it", async () => {
    const issues = (await boxes()).issues!
    await startDrag(design, "users", "uptime")
    expect(await dropAt(design, "users", { x: issues.left + issues.width * 0.8, y: issues.top + 50 })).toMatchObject({
      parent: "stats",
      index: 3
    })
    // Over the text inside it, too.
    expect(await dropAt(design, "users", { x: issues.left + 20, y: issues.top + 20 })).toMatchObject({
      parent: "stats",
      index: 2
    })
  })

  it("still goes into a layout outside its own", async () => {
    const panel = (await boxes()).panel!
    await startDrag(design, "users", "uptime")
    const point = { x: panel.left + panel.width / 2, y: panel.top + panel.height / 2 }
    expect(await dropAt(design, "users", point)).toMatchObject({ parent: "panel" })
  })
})
