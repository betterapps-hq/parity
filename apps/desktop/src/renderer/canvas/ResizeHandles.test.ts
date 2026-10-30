import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test"

// The handles' hints are Radix tooltips, which open and close on real pointer events, so this renders them in Chrome. It
// needs Chrome installed.
let browser: Browser
let page: Page
const errors: string[] = []

const entry = `
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ResizeHandles } from "./ResizeHandles.tsx"

let root
export const calls = []
export function mount() {
  root?.unmount()
  calls.length = 0
  root = createRoot(document.querySelector("#overlay"))
  root.render(
    createElement(
      TooltipProvider,
      null,
      createElement(ResizeHandles, {
        handles: { kind: "node", box: { x: 100, y: 200, w: 300, h: 100 }, color: "blue", edges: ["n", "e", "s", "w", "ne", "se", "sw", "nw"] },
        onStart: (edge) => calls.push("start " + edge),
        onReset: (edge) => calls.push("reset " + edge)
      })
    )
  )
}
`

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))
  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "tsx", sourcefile: "entry.tsx" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "handles",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' }
  })
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(error.message))
  // The few Tailwind classes the handles are placed with.
  await page.setContent(`<style>.absolute { position: absolute } .z-10 { z-index: 10 }</style>
    <body style="margin: 0"><div id="overlay" style="position: relative; height: 600px"></div></body>`)
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
}, 30_000)

afterAll(async () => {
  await browser?.close()
})

/** The eight handles, in the order of the `edges` the page passes them: n, e, s, w, then the corners. */
const handleElements = () => page.locator(".resize-handle")

beforeEach(async () => {
  errors.length = 0
  await page.mouse.move(700, 550)
  // @ts-expect-error The bundle's global.
  await page.evaluate(() => handles.mount())
  // React draws the handles in a task of its own after `mount` returns, and a busy Chrome runs input ahead of that task,
  // so a pointer that moved or clicked straight away could find nothing there yet. They're all drawn at once.
  await handleElements().last().waitFor()
})

const hints = () => page.locator("[data-slot=tooltip-content]").count()
// @ts-expect-error The bundle's global.
const calls = () => page.evaluate(() => handles.calls)

/** Rests the pointer on a point long enough for a hint to open. */
async function hover(x: number, y: number) {
  await page.mouse.move(x - 2, y)
  await page.mouse.move(x, y)
  await page.waitForTimeout(700)
}

// Hints wait half a second to open, so these take a few seconds each, longer while other tests run.
describe("a resize handle's hint", { timeout: 20_000 }, () => {
  it("opens after a moment's hover", async () => {
    await hover(250, 200)
    await expect.poll(hints, { timeout: 5_000 }).toBe(1)
    expect(errors).toEqual([])
  })

  it("closes when the handle is pressed, and stays closed through the drag and after it", async () => {
    // The top handle, dragged up towards its own hint, which used to keep it open over the resize.
    await hover(250, 200)
    await page.mouse.down()
    expect(await hints()).toBe(0)
    // Over the hint itself.
    for (const y of [195, 185]) await page.mouse.move(250, y)
    expect(await hints()).toBe(0)
    for (const y of [170, 160]) await page.mouse.move(250, y)
    await page.waitForTimeout(700)
    expect(await hints()).toBe(0)
    await page.mouse.up()
    await page.waitForTimeout(700)
    expect(await hints()).toBe(0)
    expect(await calls()).toEqual(["start n"])
  })

  it("opens again on the next hover", async () => {
    await hover(250, 200)
    await page.mouse.down()
    await page.mouse.move(250, 180)
    await page.mouse.up()
    await page.mouse.move(700, 550)
    await hover(400, 250)
    await expect.poll(hints, { timeout: 5_000 }).toBe(1)
  })
})

describe("a resize handle", { timeout: 20_000 }, () => {
  it("resets on a double-click", async () => {
    await handleElements().nth(1).dblclick()
    await expect.poll(calls).toEqual(["start e", "start e", "reset e"])
  })
})
