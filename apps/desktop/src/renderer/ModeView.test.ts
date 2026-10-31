import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// Focus, Tab and inertness are the browser's, so this renders frames in Chrome as the canvas does: ModeView, a project's
// components through the React guest, and the canvas's own readers of a frame. It needs Chrome installed.
let browser: Browser
let page: Page
const errors: string[] = []

const entry = `
import { createElement, useEffect, useRef } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { defaultModeSettings, frameViewport, resolveDesign, resolveModes } from "@parity-app/core"
import { createGuest } from "@parity-app/renderer-react/guest"
import { ModeView } from "./ModeView.tsx"
export { hitInFrame } from "./canvas/hit.ts"
export { tabOrder } from "./canvas/tab-order.ts"
export { frameDrawn } from "./canvas/nudge.ts"

// A form whose field asks for focus as it mounts, as autoFocus and dialogs do, and asks again in an effect.
function Field() {
  const ref = useRef(null)
  useEffect(() => ref.current?.focus(), [])
  return createElement(
    "form",
    null,
    createElement("input", { ref, autoFocus: true, "aria-label": "Name" }),
    createElement("button", { type: "button" }, "Go")
  )
}

const sheet = new CSSStyleSheet()
sheet.replaceSync(":host { --spacing: 4px; --header: 40px }")
// A component that throws, until it's found in another file.
function Broken() {
  throw new Error("Not built yet")
}

const loaded = { guest: createGuest({ components: { Field, Broken }, css: "" }), sheet, tokens: [] }
const mode = resolveModes(defaultModeSettings)[0]
let root

/** Gives the guest components from other files, as the type checker does once it finds them. */
export function addComponents(sources) {
  loaded.guest.addComponents(sources)
}

/** Shows a design in one frame, as the canvas does, interactive or not, or asleep; \`shows\` keys what it renders. */
export function show(container, { interactive = false, scale = 1, asleep = false, shows } = {}) {
  root ??= createRoot(document.querySelector("#area"))
  const tree = resolveDesign(container.root, container.states[0], mode.viewport, new Map())
  flushSync(() =>
    root.render(
      createElement(ModeView, { loaded, tree, mode, frame: { width: 390, viewport: frameViewport({ width: 390 }, mode) }, design: container.id, state: "default", primary: true, scale, interactive, asleep, shows })
    )
  )
}
`

beforeAll(async () => {
  const renderer = fileURLToPath(new URL(".", import.meta.url))
  const bundle = await build({
    stdin: { contents: entry, resolveDir: renderer, loader: "tsx", sourcefile: "entry.tsx" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "app",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"', "import.meta.url": '"http://parity.test/app.js"' }
  })
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(error.message))
  // A file a component moves to, as the project's dev server would build it: a component drawing plain text.
  await page.route("http://parity.test/src/fixed.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: 'export function Broken() { return "Fixed" }' })
  )
  await page.route("http://parity.test/src/moved.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: 'export function Field() { return "Moved" }' })
  )
  await page.route("http://parity.test/app.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0]!.text })
  )
  // The canvas takes focus to run its shortcuts; the frames sit in it, and the app's panels come after.
  await page.route("http://parity.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="canvas" tabindex="0">Canvas</div><div id="area" class="canvas-area"></div>
        <button id="after">After</button><script src="http://parity.test/app.js"></script>`
    })
  )
  await page.goto("http://parity.test/")
  // @ts-expect-error The bundle's global.
  if (!(await page.evaluate(() => typeof app === "object")))
    throw new Error(`The page didn't load: ${errors.join(",")}`)
}, 30_000)

afterAll(async () => {
  await browser?.close()
})

const form = {
  id: "form",
  name: "Form",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", children: [{ type: "component", id: "field", component: "Field" }] },
  states: [{ id: "default", name: "Default" }]
}

/** Shows a design and lets its effects run. */
async function show(
  container: unknown,
  options: { interactive?: boolean; scale?: number; asleep?: boolean; shows?: string } = {}
) {
  // @ts-expect-error The bundle's global.
  await page.evaluate(({ container, options }) => app.show(container, options), { container, options })
  await page.waitForTimeout(50)
}

/** What has focus: the canvas, a panel, a design's control, or nothing. */
function focused() {
  return page.evaluate(() => {
    const host = document.querySelector("[data-frame]")!
    const inside = host.shadowRoot!.activeElement
    if (inside) return `frame ${inside.localName}`
    return document.activeElement === document.body ? "nothing" : `#${document.activeElement!.id}`
  })
}

describe("a frame outside Interact", () => {
  it("is inert, so a design asking for focus as it mounts doesn't take it", async () => {
    await show(form)
    expect(await page.evaluate(() => document.querySelector("[data-frame]")!.hasAttribute("inert"))).toBe(true)
    expect(await focused()).toBe("nothing")
  })

  it("leaves Tab from the canvas to go past the design's fields", async () => {
    await page.focus("#canvas")
    await page.keyboard.press("Tab")
    expect(await focused()).toBe("#after")
  })

  it("can't be focused by a component's own code either", async () => {
    await page.focus("#canvas")
    await page.evaluate(() =>
      document.querySelector("[data-frame]")!.shadowRoot!.querySelector<HTMLInputElement>("input")!.focus()
    )
    expect(await focused()).toBe("#canvas")
  })
})

describe("a frame in Interact", () => {
  it("takes Tab and typing as a browser page does", async () => {
    await show(form, { interactive: true })
    await page.focus("#canvas")
    await page.keyboard.press("Tab")
    expect(await focused()).toBe("frame input")
    await page.keyboard.type("Ada")
    expect(
      await page.evaluate(
        () => document.querySelector("[data-frame]")!.shadowRoot!.querySelector<HTMLInputElement>("input")!.value
      )
    ).toBe("Ada")
  })

  it("lets go of focus when interacting stops", async () => {
    expect(await focused()).toBe("frame input")
    await show(form, { interactive: false })
    expect(await focused()).toBe("nothing")
    expect(errors).toEqual([])
  })
})

/** A card with a row of buttons, a grid and a badge placed absolutely: one top inset a token, the left one a step. */
const card = {
  id: "card",
  name: "Card",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "root",
    style: { padding: 4, gap: 2 },
    children: [
      {
        type: "layout",
        id: "actions",
        style: { direction: "row", gap: 2 },
        children: [
          { type: "text", id: "save", text: "Save" },
          { type: "text", id: "cancel", text: "Cancel" }
        ]
      },
      {
        type: "layout",
        id: "tiles",
        style: { display: "grid", columns: 3, gap: 1 },
        children: ["one", "two", "three", "four"].map((id) => ({ type: "text", id, text: id }))
      },
      {
        type: "text",
        id: "badge",
        text: "New",
        style: { position: "absolute", top: "header", left: 2, width: 20, height: 5 }
      },
      { type: "component", id: "field", component: "Field" }
    ]
  },
  states: [{ id: "default", name: "Default" }]
}

describe("a frame asleep", () => {
  /** The frame's host, what it holds, and how tall the frame is laid out. */
  const frame = () =>
    page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("[data-frame]")!
      return {
        design: host.dataset.design,
        elements: host.shadowRoot?.querySelectorAll("*").length ?? 0,
        field: !!host.shadowRoot?.querySelector("input"),
        height: document.querySelector<HTMLElement>(".mode-frame")!.offsetHeight
      }
    })

  it("lets go of its design and keeps its host and height, and draws it again when it wakes", async () => {
    await show(form)
    const awake = await frame()
    expect(awake.field).toBe(true)
    expect(awake.height).toBeGreaterThan(0)

    await show(form, { asleep: true })
    expect(await frame()).toEqual({ design: "form", elements: 0, field: false, height: awake.height })

    await show(form)
    expect(await frame()).toEqual(awake)
  })
})

describe("what the canvas reads from an inert frame", () => {
  it("still finds the layers under the pointer, by their boxes", async () => {
    await show(card)
    const path = await page.evaluate((container) => {
      const host = document.querySelector<HTMLElement>("[data-frame]")!
      const box = host.shadowRoot!.querySelector("[data-canvas-node='cancel']")!.getBoundingClientRect()
      // @ts-expect-error The bundle's global.
      return app.hitInFrame({ key: "card.par#card", path: "card.par", container }, host, {
        x: box.left + 2,
        y: box.top + 2
      }).path
    }, card)
    expect(path).toEqual(["root", "actions", "cancel"])
  })

  it("still lists the design's tab order, for the tab order overlay", async () => {
    const order = await page.evaluate(() =>
      // @ts-expect-error The bundle's global.
      (app.tabOrder(document.querySelector("[data-frame]")) as HTMLElement[]).map((element) => element.localName)
    )
    expect(order).toEqual(["input", "button"])
  })

  it("gives nudging each layout's direction as drawn: a row, a column, and a grid's rows", async () => {
    const flows = await page.evaluate(() => {
      // @ts-expect-error The bundle's global.
      const drawn = app.frameDrawn(document.querySelector("#area"), "card", {}, 4)
      return { save: drawn.flow("save"), actions: drawn.flow("actions"), two: drawn.flow("two") }
    })
    expect(flows).toEqual({
      save: { axis: "row", reversed: false },
      actions: { axis: "column", reversed: false },
      two: { axis: "row", reversed: false, stride: 3 }
    })
  })

  it("gives nudging where an absolutely placed layer is drawn, in steps, at any scale", async () => {
    const insets = async () =>
      page.evaluate(() =>
        // @ts-expect-error The bundle's global.
        app.frameDrawn(document.querySelector("#area"), "card", {}, 4).insets("badge")
      )
    // The card is 374px wide, inside the frame body's margins: 93.5 steps, less the badge's 20 and its left inset of 2.
    const expected = { top: 10, left: 2, right: 71.5, bottom: expect.any(Number) }
    expect(await insets()).toEqual(expected)
    await show(card, { scale: 0.5 })
    expect(await insets()).toEqual(expected)
    expect(errors).toEqual([])
  })
})

describe("a component moved to another file", () => {
  it("is drawn from there once what the frame renders is keyed again", async () => {
    const drawn = () => page.evaluate(() => document.querySelector("[data-frame]")!.shadowRoot!.textContent)
    await show(form, { shows: "before" })
    expect(
      await page.evaluate(() => !!document.querySelector("[data-frame]")!.shadowRoot!.querySelector("input"))
    ).toBe(true)
    // @ts-expect-error The bundle's global.
    await page.evaluate(() => app.addComponents({ Field: { path: "src/moved.js", export: "Field" } }))
    // The same key draws nothing new: the frame doesn't know the code changed.
    await show(form, { shows: "before" })
    expect(await drawn()).not.toContain("Moved")
    await show(form, { shows: "after" })
    await expect.poll(drawn).toContain("Moved")
    expect(errors).toEqual([])
  })
})

describe("a component that failed, moved to another file", () => {
  it("draws from there instead of its error", async () => {
    const broken = {
      id: "broken",
      name: "Broken",
      position: { x: 0, y: 0 },
      root: { type: "layout", id: "root", children: [{ type: "component", id: "broken", component: "Broken" }] },
      states: [{ id: "default", name: "Default" }]
    }
    const drawn = () => page.evaluate(() => document.querySelector("[data-frame]")!.shadowRoot!.textContent)
    await show(broken, { shows: "failing" })
    await expect.poll(drawn).toContain("Broken: Not built yet")
    // @ts-expect-error The bundle's global.
    await page.evaluate(() => app.addComponents({ Broken: { path: "src/fixed.js", export: "Broken" } }))
    await show(broken, { shows: "fixed" })
    await expect.poll(drawn).toContain("Fixed")
    expect(await drawn()).not.toContain("Not built yet")
  })
})
