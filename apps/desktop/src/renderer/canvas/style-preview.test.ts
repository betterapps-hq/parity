import { fileURLToPath } from "node:url"
import type { ContainerSpec } from "@parity/core"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { cssName } from "./style-preview.ts"

// The preview writes onto elements already drawn, so it runs in Chrome, where styles are real. It needs Chrome installed.
let browser: Browser
let page: Page
const errors: string[] = []

/**
 * A design with a column holding a 32px mark and a text; its Wide state widens the mark on its own. Lengths are steps
 * of a 4px spacing scale.
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
      { type: "text", id: "title", text: "Plans" }
    ]
  },
  states: [
    { id: "default", name: "Default" },
    { id: "wide", name: "Wide", overrides: { mark: { style: { width: 20 } } } }
  ]
}

/**
 * What the page loads: the preview, and a stand-in for the canvas that draws a design's frames, one per state, as plain
 * elements with the inline styles a guest would give them.
 */
const entry = `
export { StylePreview } from "./style-preview.ts"
import { boardRoot, editNode, resolveDesign } from "@parity/core"
export { editNode }

export function draw(design) {
  document.body.style.setProperty("--spacing", "4px")
  document.querySelector("#frames").replaceChildren()
  for (const state of design.states) {
    const host = document.createElement("div")
    Object.assign(host.dataset, { frame: "", design: "app.par#card", state: state.id, viewport: "desktop" })
    host.style.width = "600px"
    document.querySelector("#frames").append(host)
    const shadow = host.attachShadow({ mode: "open" })
    const render = (node) => {
      if (node.kind === "text") return document.createTextNode(node.text)
      const element = document.createElement(node.kind === "element" ? node.tag : "div")
      element.dataset.canvasNode = node.nodeId
      Object.assign(element.style, node.kind === "element" ? node.style : (node.props.style ?? {}))
      for (const child of node.kind === "element" ? node.children : []) element.append(render(child))
      return element
    }
    for (const node of resolveDesign(boardRoot(design), state, "desktop")) shadow.append(render(node))
  }
}

/** A session holding the design, as the store would. */
export function session(design) {
  return { store: { getEntry: () => ({ key: "app.par#card", path: "app.par", container: design }), getLibrary: () => new Map() } }
}
`

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))
  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "tsx", sourcefile: "entry.tsx" },
    bundle: true,
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
  if (!(await page.evaluate(() => typeof preview === "object"))) throw new Error(`The page didn't load: ${errors}`)
}, 30_000)

afterAll(async () => {
  await browser?.close()
})

beforeEach(async () => {
  await page.evaluate((design) => {
    // @ts-expect-error The bundle's global.
    preview.draw(design)
    // @ts-expect-error The bundle's global.
    window.shown = new preview.StylePreview(preview.session(design), "app.par#card")
  }, design)
})

type Edit = Record<string, unknown>

/** Previews a style edit of a node in the base design, as the inspector's fields do. */
function show(nodeId: string, style: Edit) {
  return page.evaluate(
    ({ nodeId, style }) => {
      // Null stands for undefined, which doesn't survive the trip into the page: the edit takes the property off.
      for (const [name, value] of Object.entries(style)) if (value === null) style[name] = undefined
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

/** A node's drawn width and inline style in each state's frame. */
function drawn(nodeId: string) {
  return page.evaluate((nodeId) => {
    const out: Record<string, { width: number; style: string }> = {}
    for (const host of document.querySelectorAll<HTMLElement>("[data-frame]")) {
      const element = host.shadowRoot!.querySelector<HTMLElement>(`[data-canvas-node="${nodeId}"]`)!
      // In order, since putting a property back can move it to the end.
      const style = element.style.cssText
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .sort()
        .join("; ")
      out[host.dataset.state!] = { width: element.getBoundingClientRect().width, style }
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
    // Wide sets its own width, which a base edit doesn't change.
    expect(after.wide).toEqual(before.wide)
  })

  it("replaces the last preview, putting back what the new one doesn't change", async () => {
    const before = await drawn("mark")
    await show("mark", { width: 80 })
    await show("mark", { height: 2 })
    const after = await drawn("mark")
    expect(after.default!.width).toBe(32)
    expect(after.default!.style).toContain("height: calc(var(--spacing) * 2)")
    await act("cancel")
    expect(await drawn("mark")).toEqual(before)
  })

  it("takes it back exactly, properties it took off included", async () => {
    const before = await drawn("root")
    await show("root", { gap: null, padding: 10 })
    expect((await drawn("root")).default!.style).not.toContain("gap")
    await act("cancel")
    expect(await drawn("root")).toEqual(before)
  })

  it("leaves what it shows for the change to draw over once released", async () => {
    await show("mark", { width: 80 })
    await act("release")
    await act("cancel")
    expect((await drawn("mark")).default!.width).toBe(320)
  })

  it("writes nothing for an edit that changes nothing", async () => {
    const before = await drawn("mark")
    await show("mark", { width: 8 })
    expect(await drawn("mark")).toEqual(before)
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
