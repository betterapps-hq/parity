import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import type { RenderedFrame, RenderJob } from "../shared/protocol.ts"

// The offscreen render window's page, in Chrome, as the main process drives it: `canvasRender` draws a job with a guest
// that stands in for a project's, whose stylesheet makes an element as tall as the window (`100vh`) and which notes
// the window it's mounted in. Given a tree, the guest draws each node as a part 1px high holding its id as text, which
// reaches past the part, as a Separator labelled with its name does. It needs Chrome installed.
let browser: Browser
let page: Page
const errors: string[] = []

const guest = `
export default {
  renderer: "test",
  components: [],
  hasComponent: () => false,
  css: ".tall { height: 100vh } .line { height: 1px }",
  mount(target, tree, options) {
    window.mountedIn = options.viewport
    const element = (className, text) => Object.assign(document.createElement("div"), { className, textContent: text })
    const drawn = tree.length === 0 ? [element("tall", "")] : tree.map((node) => element("line", node.nodeId))
    target.append(...drawn)
    return { update() {}, unmount() { for (const part of drawn) part.remove() } }
  }
}
`

beforeAll(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("render.ts", import.meta.url))],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"production"' }
  })
  // Headless Chrome hides scrollbars unless asked not to; the offscreen window draws them.
  browser = await chromium.launch({ channel: "chrome", headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] })
  // Shorter than the frame's window, so a height that came from this window rather than the job's would show.
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("http://parity.test/guest.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: guest })
  )
  await page.route("http://parity.test/render.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0]!.text })
  )
  await page.route("http://parity.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<body style="margin: 0"><script src="http://parity.test/render.js"></script></body>`
    })
  )
  await page.goto("http://parity.test/")
  if (!(await page.evaluate(() => typeof window.canvasRender === "function")))
    throw new Error(`The page didn't load: ${errors.join(",")}`)
}, 30_000)

afterAll(async () => {
  await browser?.close()
})

/** Draws a job as the main process does: the frame, the window the guest was mounted in, and how tall `100vh` is. */
async function render(mode: Pick<RenderJob["mode"], "width" | "height" | "viewport">, tree: unknown[] = []) {
  const job: RenderJob = {
    projectId: "app",
    guestUrl: "http://parity.test/guest.js",
    theme: [],
    tree,
    mode: { ...mode, classNames: [], attributes: {} },
    scale: 1
  }
  return page.evaluate(async (job) => {
    const frame: RenderedFrame = await window.canvasRender(job)
    const tall = document.querySelector("div")?.shadowRoot?.querySelector(".tall")
    return {
      frame,
      mountedIn: (window as unknown as { mountedIn: unknown }).mountedIn,
      vh: tall?.getBoundingClientRect().height
    }
  }, job)
}

describe("canvasRender", () => {
  it("draws a frame that grows in the job's window, not one worked out from its width", async () => {
    const { frame, mountedIn, vh } = await render({ width: 1280, viewport: { width: 1280, height: 1234 } })
    expect(frame.error).toBeUndefined()
    expect(mountedIn).toEqual({ width: 1280, height: 1234 })
    // `100vh` is the job's 1234, not 800 for 1280 or this window's, and the frame grows past it, with the body's margin.
    expect(vh).toBe(1234)
    expect(frame.width).toBe(1280)
    expect(frame.height).toBeGreaterThanOrEqual(1234)
  })

  it("clips a frame at its fixed height, apart from its window", async () => {
    const { frame, mountedIn, vh } = await render({ width: 1280, height: 600, viewport: { width: 1280, height: 1234 } })
    expect(mountedIn).toEqual({ width: 1280, height: 1234 })
    expect(vh).toBe(1234)
    expect(frame).toMatchObject({ width: 1280, height: 600 })
  })

  it("never scrolls, so text reaching past the frame puts no scrollbar in its capture (PAR-520)", async () => {
    const separator = { kind: "element", nodeId: "Separator", tag: "div", style: {}, children: [] }
    const { frame } = await render({ width: 400, viewport: { width: 400, height: 800 } }, [separator])
    // The frame is the part and the body's margin; the part's name runs below it.
    expect(frame.height).toBeLessThan(20)
    // As the main process sizes the window for a capture: as wide and as tall as the frame.
    await page.setViewportSize({ width: frame.width, height: frame.height })
    try {
      const scrollbars = await page.evaluate(async () => {
        await window.canvasSettle()
        const root = document.documentElement
        return { vertical: innerWidth - root.clientWidth, horizontal: innerHeight - root.clientHeight }
      })
      expect(scrollbars).toEqual({ vertical: 0, horizontal: 0 })
    } finally {
      await page.setViewportSize({ width: 1280, height: 800 })
    }
  })
})
