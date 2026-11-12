import { fileURLToPath } from "node:url"
import type { ContainerSpec, NodeStyle } from "@parity-app/core"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test"
import { cssName } from "./style-preview.ts"

// The preview lays rules over frames already drawn, so it runs in Chrome, where the cascade is real. It needs Chrome
// installed.
let browser: Browser
let page: Page
const errors: string[] = []

/**
 * A design with a column holding a 32px mark, a text and a button; its Wide state widens the mark on its own. Lengths
 * are steps of a 4px spacing scale.
 */
const design: ContainerSpec = {
  id: "card",
  name: "Card",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    style: { gap: 2, padding: 4 },
    children: [
      { type: "layout", id: "mark", style: { width: 8, height: 8, background: "primary" }, children: [] },
      { type: "text", id: "title", text: "Plans" },
      { type: "component", id: "button", component: "Button", style: { width: 20 } }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "wide", name: "Wide", overrides: { mark: { style: { width: 20 } } } }
  ]
}

/**
 * What the page loads: the preview, and a stand-in for the canvas that draws a design's frames, one per state, as a
 * guest would: elements from their frame's rules, or from classes when `classed` is set, as in a Tailwind project, and
 * a component as a div with its `style` prop inline.
 */
const entry = `
export { StylePreview } from "./style-preview.ts"
import { boardRoot, editNode, frameRules, previewRules, resolveDesign, withClasses } from "@parity-app/core"
import { prepareFrame, registerFrame, showFrameRules } from "../frame.ts"
export { editNode }

let unregister = []
let layer = {}
const project = new CSSStyleSheet()
project.replaceSync("@layer base, utilities; :host { --spacing: 4px }")

export function draw(design, classed) {
  document.querySelector("#frames").replaceChildren()
  for (const stop of unregister) stop()
  unregister = []
  layer = classed ? { layer: "utilities" } : {}
  // One class for each list of declarations, in the layer a project's utility classes are in.
  const written = new Map()
  const className = (declarations) => {
    const css = declarations.map(({ property, value }) => property + ":" + value).join(";")
    if (!written.has(css)) written.set(css, "c" + written.size)
    return [written.get(css)]
  }
  const sheet = new CSSStyleSheet()
  for (const state of design.states) {
    const host = document.createElement("div")
    Object.assign(host.dataset, { frame: "", design: "app.par#card", state: state.id, viewport: "desktop" })
    host.style.width = "600px"
    document.querySelector("#frames").append(host)
    // The preview finds the design's frames from the index ModeView registers them in.
    unregister.push(registerFrame(host, "app.par#card"))
    const target = prepareFrame(host, project, { classNames: [], attributes: {}, sheets: [sheet] })
    const render = (node) => {
      if (node.kind === "text") return document.createTextNode(node.text)
      const element = document.createElement(node.kind === "element" ? node.tag : "div")
      element.dataset.canvasNode = node.nodeId
      if (node.kind === "component") Object.assign(element.style, node.props.style ?? {})
      if (node.classes) element.className = node.classes.join(" ")
      for (const child of node.kind === "element" ? node.children : []) element.append(render(child))
      return element
    }
    const resolved = resolveDesign(boardRoot(design), state, "desktop")
    const tree = classed ? withClasses(resolved, className) : resolved
    showFrameRules(host, frameRules(tree, layer))
    for (const node of tree) target.append(render(node))
  }
  const rules = [...written].map(([css, name]) => "." + name + "{" + css + "}").join("")
  sheet.replaceSync("@layer utilities {" + rules + "}")
}

/** Draws the design's change in its frames, as they do once it's made: their rules are the changed tree's. */
export function redraw(design) {
  for (const host of document.querySelectorAll("[data-frame]")) {
    const state = design.states.find((candidate) => candidate.id === host.dataset.state)
    showFrameRules(host, frameRules(resolveDesign(boardRoot(design), state, "desktop"), layer))
  }
}

/** A session holding the design, as the store would, with a guest that writes its frames' rules. */
export function session(design) {
  return {
    store: { getEntry: () => ({ key: "app.par#card", path: "app.par", container: design }), getLibrary: () => new Map() },
    loaded: { previewRules: (drawn, next) => previewRules(drawn, next, layer) },
    info: { guestUrl: "http://parity.test/guest.js" }
  }
}
`

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "tsx", sourcefile: "entry.tsx" },
    bundle: true,
    // frame.ts reads scrollbars.css as text, as Vite's `?raw` gives it.
    loader: { ".css": "text" },
    write: false,
    format: "iife",
    globalName: "preview",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("http://parity.test/preview.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0]!.text })
  )
  await page.route("http://parity.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="frames"></div><script src="http://parity.test/preview.js"></script>`
    })
  )
  await page.goto("http://parity.test/")

  // @ts-expect-error The bundle's global.
  if (!(await page.evaluate(() => globalThis.preview !== undefined))) {
    throw new Error(`The page didn't load: ${errors.join(",")}`)
  }
})

afterAll(async () => {
  await browser?.close()
})

/** Draws the design's frames, from classes when `classed`, and starts a preview of it. */
function start(classed = false) {
  return page.evaluate(
    ({ design, classed }) => {
      // @ts-expect-error The bundle's global.
      preview.draw(design, classed)
      // @ts-expect-error The bundle's global.
      window.shown = new preview.StylePreview(preview.session(design), "app.par#card")
    },
    { design, classed }
  )
}

beforeEach(() => start())

/** A style edit, where null takes a property off. */
type Edit = Record<string, NodeStyle[keyof NodeStyle] | null>

/** Previews a style edit of a node in the base design, as the inspector's fields do. */
function show(nodeId: string, style: Edit) {
  return page.evaluate(
    ({ nodeId, style }) => {
      // Null stands for undefined, which doesn't survive the trip into the page: the edit takes the property off.
      for (const [name, value] of Object.entries(style)) {
        if (value === null) {
          style[name] = undefined
        }
      }

      // @ts-expect-error The bundle's globals.
      window.shown.show((container) => preview.editNode(container, "default", nodeId, { style }))
    },
    { nodeId, style }
  )
}

function act(method: "cancel" | "release") {
  // @ts-expect-error The bundle's global.
  return page.evaluate((method) => window.shown[method](), method)
}

/** How a node is drawn in a frame, and what's written inline on its element. */
interface Drawn {
  width: number
  height: number
  gap: string
  padding: string
  inline: string
}

/** How a node is drawn in each state's frame. */
function drawn(nodeId: string) {
  return page.evaluate((nodeId) => {
    const out: Record<string, Drawn> = {}

    for (const host of document.querySelectorAll<HTMLElement>("[data-frame]")) {
      const element = host.shadowRoot!.querySelector<HTMLElement>(`[data-canvas-node="${nodeId}"]`)!
      const box = element.getBoundingClientRect()
      const { gap, padding } = getComputedStyle(element)

      out[host.dataset.state!] = { width: box.width, height: box.height, gap, padding, inline: element.style.cssText }
    }

    return out
  }, nodeId)
}

describe("previewing a style edit", () => {
  it("shows it on the elements already drawn, in the next frame, in each state that has it", async () => {
    const before = await drawn("mark")
    expect(before.default!.width).toBe(32)
    await show("mark", { width: 80 })
    const after = await drawn("mark")
    expect(after.default!.width).toBe(320)
    // An element's edit is a rule over its frame's, never an inline style.
    expect(after.default!.inline).toBe("")
    // Wide sets its own width, which a base edit doesn't change.
    expect(after.wide).toEqual(before.wide)
  })

  it("replaces the last preview, putting back what the new one doesn't change", async () => {
    const before = await drawn("mark")
    await show("mark", { width: 80 })
    await show("mark", { height: 2 })
    const after = await drawn("mark")
    expect(after.default).toMatchObject({ width: 32, height: 8 })
    await act("cancel")
    expect(await drawn("mark")).toEqual(before)
  })

  it("takes it back exactly, properties it took off included", async () => {
    const before = await drawn("root")
    expect(before.default).toMatchObject({ gap: "8px", padding: "16px" })
    await show("root", { gap: null, padding: 10 })
    expect((await drawn("root")).default).toMatchObject({ gap: "normal", padding: "40px" })
    await act("cancel")
    expect(await drawn("root")).toEqual(before)
  })

  it("takes a property off an element its classes draw, as in a Tailwind project", async () => {
    await start(true)
    const before = await drawn("mark")
    expect(before.default).toMatchObject({ width: 32, height: 32 })
    await show("mark", { width: null, height: 2 })
    const after = await drawn("mark")
    // Without a width, the mark stretches across its column, though its class still sets one.
    expect(after.default!.width).toBeGreaterThan(320)
    expect(after.default!.height).toBe(8)
    await act("cancel")
    expect(await drawn("mark")).toEqual(before)
  })

  it("writes a component's edit onto its element, since its style is its own prop", async () => {
    const before = await drawn("button")
    expect(before.default!.width).toBe(80)
    await show("button", { width: 40 })
    expect((await drawn("button")).default).toMatchObject({ width: 160, inline: "width: calc(var(--spacing) * 40);" })
    await act("cancel")
    expect(await drawn("button")).toEqual(before)
  })

  it("leaves what it shows for the change to draw over once released", async () => {
    await show("mark", { width: 80 })
    await act("release")
    await act("cancel")
    expect((await drawn("mark")).default!.width).toBe(320)
    // The frame draws the change, and takes the preview's rule away as it does.
    await page.evaluate((design) => {
      // @ts-expect-error The bundle's global.
      preview.redraw(preview.editNode(design, "default", "mark", { style: { width: 60 } }))
    }, design)
    expect((await drawn("mark")).default!.width).toBe(240)
  })

  it("shows nothing for an edit that changes nothing", async () => {
    const before = await drawn("mark")
    await show("mark", { width: 8 })
    expect(await drawn("mark")).toEqual(before)
    // @ts-expect-error The bundle's global.
    expect(await page.evaluate(() => window.shown.active)).toBe(false)
    expect(errors).toEqual([])
  })
})

describe("cssName", () => {
  it("names React's style properties as CSS does", () => {
    expect(cssName("minWidth")).toBe("min-width")
    expect(cssName("WebkitLineClamp")).toBe("-webkit-line-clamp")
    expect(cssName("--spacing")).toBe("--spacing")
    expect(cssName("gap")).toBe("gap")
  })
})
