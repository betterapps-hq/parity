import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test"

// Selecting inside a board with the real pointer (PAR-163): the canvas's overlay over two frames of a dashboard, drawn
// by ModeView and the React guest, in Chrome. tldraw isn't there; an element under the frames stands in for its canvas,
// so a press the overlay leaves to tldraw reaches it. It needs Chrome installed.
let browser: Browser
let page: Page
const errors: string[] = []

const entry = `
import { createElement as h, Fragment } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { boardRoot, defaultModeSettings, frameViewport, resolveDesign, resolveModes } from "@parity-app/core"
import { createGuest } from "@parity-app/renderer-react/guest"
import { ModeView } from "../ModeView.tsx"
import { DesignStore } from "../design-store.ts"
import { SelectionStore } from "../selection.ts"
import { CanvasOverlay } from "./CanvasOverlay.tsx"
import { ProjectContext } from "./context.ts"
export { boxAround, findNodeElements, nodeBox } from "../frame.ts"

// Draws its control and, beside it, a hidden input for forms, a pixel square clipped to nothing at the corner of what
// it's fixed to, as Base UI's checkbox does.
function Checkbox() {
  return h(Fragment, null,
    h("span", { className: "control", style: { display: "inline-block", width: "16px", height: "16px", border: "1px solid" } }),
    h("input", { type: "checkbox", "aria-hidden": true, tabIndex: -1, style: { position: "fixed", top: 0, left: 0,
      width: 1, height: 1, margin: -1, padding: 0, border: 0, overflow: "hidden", clip: "rect(0 0 0 0)" } }))
}

const sheet = new CSSStyleSheet()
sheet.replaceSync(":host { --spacing: 4px }")
const loaded = { guest: createGuest({ components: { Checkbox }, css: "" }), sheet, tokens: [] }
const mode = resolveModes(defaultModeSettings)[0]
let root

/** Shows every state of the dashboard side by side on a board, with the overlay over them, as the canvas does. */
export function mount(containers) {
  const store = new DesignStore(
    [{ path: "app.par", document: { version: 3, containers } }],
    defaultModeSettings,
    "app.par",
    { saveDocument: async () => undefined, autosave: () => false }
  )
  const selection = new SelectionStore()
  const session = { id: "app", store, selection, loaded, tokens: { get: () => [] }, errors: [] }
  window.session = session
  const draw = () => {
    const entry = store.getEntry("app.par#dash")
    const frames = entry.container.states.map((state) =>
      h(ModeView, {
        key: state.id,
        loaded,
        tree: resolveDesign(boardRoot(entry.container), state, mode.viewport, store.getLibrary(entry.key)),
        mode,
        frame: { width: 400, viewport: frameViewport({ width: 400 }, mode) },
        design: entry.key,
        state: state.id,
        primary: state.id === "default"
      })
    )
    flushSync(() =>
      root.render(
        h(ProjectContext.Provider, { value: session },
          h("div", { id: "tldraw", style: { position: "absolute", inset: 0 } }),
          h("div", { className: "board", style: { position: "absolute", left: 40, top: 40, padding: 32, display: "flex", gap: 32, pointerEvents: "none" } }, frames),
          h(CanvasOverlay))
      )
    )
  }
  root ??= createRoot(document.querySelector("#area"))
  draw()
  store.subscribe(draw)
  return mode.id
}
`

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))
  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "tsx", sourcefile: "entry.tsx" },
    bundle: true,
    write: false,
    outfile: "app.js",
    format: "iife",
    globalName: "app",
    platform: "browser",
    jsx: "automatic",
    logLevel: "silent",
    define: {
      "process.env.NODE_ENV": '"development"',
      "import.meta.url": '"http://parity.test/app.js"',
      "import.meta.env": "{}"
    }
  })
  const script = bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.text
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("http://parity.test/app.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: script })
  )
  await page.route("http://parity.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<body style="margin: 0"><div id="area" class="canvas-area" style="position: relative; width: 1100px; height: 800px"></div>
        <script src="http://parity.test/app.js"></script></body>`
    })
  )
  await page.goto("http://parity.test/")
  // @ts-expect-error The bundle's global.
  if (!(await page.evaluate(() => typeof app === "object")))
    throw new Error(`The page didn't load: ${errors.join(",")}`)
}, 60_000)

afterAll(async () => {
  await browser?.close()
})

const text = (id: string, value: string) => ({ type: "text", id, text: value })
const stat = (id: string) => ({ type: "instance", id, design: "stat" })
const dashboard = {
  id: "dash",
  name: "Dashboard",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "app",
    style: { padding: 6, gap: 6 },
    children: [
      { type: "layout", id: "header", style: { direction: "row", gap: 2 }, children: [text("title", "Dashboard")] },
      { type: "layout", id: "stats", style: { direction: "row", gap: 4 }, children: [stat("revenue"), stat("users")] },
      {
        type: "layout",
        id: "chart",
        style: { height: 20, padding: 2 },
        children: [text("chart-title", "Revenue"), { type: "component", id: "remember", component: "Checkbox" }]
      }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "loading", name: "Loading" }
  ]
}
const statCard = {
  id: "stat",
  name: "Stat card",
  kind: "component",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "card",
    style: { padding: 4, gap: 1, width: 30 },
    children: [text("label", "Revenue"), text("value", "$45,231")]
  },
  states: [{ id: "default", name: "Default" }]
}
const design = "app.par#dash"
let mode = ""

beforeEach(async () => {
  // @ts-expect-error The bundle's global.
  mode = await page.evaluate((containers) => app.mount(containers), [dashboard, statCard])
  await page.waitForTimeout(50)
  await page.evaluate(() => {
    const stand = document.querySelector<HTMLElement>("#tldraw")!
    stand.dataset.pressed = ""
    stand.onpointerdown = () => (stand.dataset.pressed = "true")
  })
})

/** The middle of a layer's box in a frame, or a point inside its top left corner. */
async function at(node: string, state = "default", corner = false) {
  return page.evaluate(
    ({ node, state, corner }) => {
      const host = document.querySelector(`[data-frame][data-state="${state}"]`)!
      const element = host.shadowRoot!.querySelector(`[data-canvas-node="${node}"]`)!
      const rect = element.getBoundingClientRect()
      return corner
        ? { x: rect.left + 4, y: rect.top + 4 }
        : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    },
    { node, state, corner }
  )
}

function selected() {
  // @ts-expect-error The page's session.
  return page.evaluate(() => window.session.selection.get())
}

function hovered() {
  // @ts-expect-error The page's session.
  return page.evaluate(() => window.session.selection.getHover())
}

/** Whether the last press reached tldraw's stand-in, as one the overlay leaves to the canvas does. */
function reachedTldraw() {
  return page.evaluate(() => document.querySelector<HTMLElement>("#tldraw")!.dataset.pressed === "true")
}

function order() {
  // @ts-expect-error The page's session.
  return page.evaluate(() => window.session.store.getEntry("app.par#dash").container.root.children.map((n) => n.id))
}

describe("a click inside a board", () => {
  it("selects the top-level layer under the pointer, with nothing selected, and keeps it from tldraw", async () => {
    const value = await at("revenue/value")
    await page.mouse.click(value.x, value.y)
    expect(await selected()).toEqual({ design, node: "stats", mode, state: "default" })
    expect(await reachedTldraw()).toBe(false)
  })

  it("selects the board on its frame's background", async () => {
    const background = await at("app", "default", true)
    await page.mouse.click(background.x, background.y)
    expect(await selected()).toEqual({ design })
    expect(await reachedTldraw()).toBe(false)
  })

  it("isn't thrown by a checkbox's hidden input, which would stretch the checkbox over the background", async () => {
    const background = await at("app", "default", true)
    const boxes = await page.evaluate((point) => {
      const host = document.querySelector('[data-frame][data-state="default"]')!
      const holds = (rect: DOMRect | undefined) =>
        !!rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
      // @ts-expect-error The bundle's global.
      const elements: HTMLElement[] = app.findNodeElements(host, "remember")
      return {
        elements: elements.map((element) => element.localName),
        // Every element's box, as the canvas measured them before: the input's pixel counts as drawn.
        // @ts-expect-error The bundle's global.
        raw: holds(app.boxAround(elements.map((element) => element.getBoundingClientRect()))),
        // @ts-expect-error The bundle's global.
        box: holds(app.nodeBox(host, "remember"))
      }
    }, background)
    expect(boxes).toEqual({ elements: ["span", "input"], raw: true, box: false })
    await page.mouse.move(background.x, background.y)
    expect(await hovered()).toBeUndefined()
    await page.mouse.click(background.x, background.y)
    expect(await selected()).toEqual({ design })
  })

  it("leaves the board's own background, around its frames, to tldraw", async () => {
    await page.mouse.click(50, 50)
    expect(await selected()).toEqual({})
    expect(await reachedTldraw()).toBe(true)
  })

  it("goes one level deeper with each double-click", async () => {
    const value = await at("revenue/value")
    await page.mouse.dblclick(value.x, value.y)
    expect(await selected()).toMatchObject({ design, node: "revenue" })
    await page.mouse.dblclick(value.x, value.y)
    expect(await selected()).toMatchObject({ design, node: "revenue/value" })
  })

  it("goes to the deepest layer with Ctrl", async () => {
    const value = await at("revenue/value", "loading")
    await page.keyboard.down("Control")
    await page.mouse.click(value.x, value.y)
    await page.keyboard.up("Control")
    expect(await selected()).toEqual({ design, node: "revenue/value", mode, state: "loading" })
  })

  it("adds the layer under the pointer with Shift", async () => {
    const value = await at("revenue/value")
    await page.mouse.click(value.x, value.y)
    const chart = await at("chart")
    await page.keyboard.down("Shift")
    await page.mouse.click(chart.x, chart.y)
    await page.keyboard.up("Shift")
    expect(await selected()).toEqual({ design, node: "chart", nodes: ["stats", "chart"], mode, state: "default" })
  })
})

describe("dragging a layer that isn't selected", () => {
  it("moves the layer, not the board", async () => {
    const chart = await at("chart")
    const header = await at("header", "default", true)
    await page.mouse.move(chart.x, chart.y)
    await page.mouse.down()
    await page.mouse.move(chart.x, chart.y - 20, { steps: 4 })
    await page.mouse.move(header.x, header.y, { steps: 8 })
    await page.mouse.up()
    expect(await order()).toEqual(["chart", "header", "stats"])
    expect(await selected()).toMatchObject({ design, node: "chart" })
    expect(await reachedTldraw()).toBe(false)
  })
})

describe("a box drawn from a frame's background", () => {
  it("selects the top-level layers it touches, in that frame", async () => {
    const start = await at("app", "loading", true)
    const users = await at("users", "loading")
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(users.x, users.y, { steps: 6 })
    expect(await selected()).toEqual({ design, node: "stats", nodes: ["header", "stats"], mode, state: "loading" })
    await page.mouse.up()
    expect(await selected()).toEqual({ design, node: "stats", nodes: ["header", "stats"], mode, state: "loading" })
    expect(await order()).toEqual(["header", "stats", "chart"])
    expect(await reachedTldraw()).toBe(false)
  })

  it("puts the selection back on Escape", async () => {
    const chart = await at("chart")
    await page.mouse.click(chart.x, chart.y)
    const start = await at("app", "default", true)
    const title = await at("title")
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(title.x, title.y, { steps: 4 })
    expect(await selected()).toMatchObject({ node: "header" })
    await page.keyboard.press("Escape")
    await page.mouse.up()
    expect(await selected()).toEqual({ design, node: "chart", mode, state: "default" })
  })
})

describe("hovering", () => {
  it("outlines what a click would select, in the frame under the pointer", async () => {
    const value = await at("revenue/value", "loading")
    await page.mouse.move(value.x, value.y)
    expect(await hovered()).toEqual({ design, node: "stats", mode, state: "loading" })
    // With a card selected in one frame, hovering its neighbour in the other outlines the neighbour there.
    const revenue = await at("revenue/value")
    await page.mouse.click(revenue.x, revenue.y)
    await page.mouse.dblclick(revenue.x, revenue.y)
    expect(await selected()).toMatchObject({ node: "revenue", state: "default" })
    const users = await at("users", "loading")
    await page.mouse.move(users.x, users.y)
    expect(await hovered()).toEqual({ design, node: "users", mode, state: "loading" })
  })

  it("outlines no layer over a frame's background, where a click selects the board", async () => {
    const background = await at("app", "loading", true)
    await page.mouse.move(background.x, background.y)
    expect(await hovered()).toBeUndefined()
    expect(errors).toEqual([])
  })
})
