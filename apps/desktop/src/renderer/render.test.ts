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

// A guest whose component portals its popup out of the frame, as a dialog does: a backdrop over the page and the popup
// placed by a positioning library, hidden until it has a place and sized shorter than what's in it, with the frame's
// root drawing only its trigger.
const portalGuest = `
export default {
  renderer: "test",
  components: [],
  hasComponent: () => false,
  css: ".trigger { display: block; height: 30px } .popup { position: fixed; top: 50%; left: 50%; width: 200px; height: 40px } .popup p { margin: 0; height: 100px }",
  mount(target, tree) {
    const root = document.createElement("div")
    root.setAttribute("data-canvas-node", tree[0].nodeId)
    root.style.width = "max-content"
    root.innerHTML = '<button class="trigger">Delete chat</button>'
    target.append(root)
    const portal = document.createElement("div")
    portal.innerHTML =
      '<div class="backdrop" style="position: fixed; inset: 0"></div>' +
      '<div class="positioner" style="position: absolute; left: 900px; top: 700px; opacity: 0">' +
      '<div class="popup"><p>Delete this chat?</p></div></div>'
    document.body.append(portal)
    return { update() {}, unmount() { root.remove(); portal.remove() } }
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
  await page.route("http://parity.test/portal-guest.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: portalGuest })
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

  if (!(await page.evaluate(() => "canvasRender" in window))) {
    throw new Error(`The page didn't load: ${errors.join(",")}`)
  }
})

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
      mountedIn: "mountedIn" in window ? window.mountedIn : undefined,
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

/** Draws the portal guest's component as a preview job does, or as any other job when `inline` is off. */
async function renderPortal(inline: boolean) {
  const job: RenderJob = {
    projectId: "portals",
    guestUrl: "http://parity.test/portal-guest.js",
    theme: [],
    tree: [{ kind: "element", nodeId: "preview", tag: "div", style: {}, children: [] }],
    mode: { width: 656, viewport: { width: 1280, height: 800 }, classNames: [], attributes: {} },
    scale: 1
  }

  if (inline) {
    job.inlinePortals = true
  }

  return page.evaluate(async (job) => {
    const frame: RenderedFrame = await window.canvasRender(job)
    const shadow = document.querySelector("div")!.shadowRoot!
    const inFrame = (selector: string) => shadow.querySelector<HTMLElement>(selector)
    const popup = inFrame(".popup") ?? document.querySelector<HTMLElement>(".popup")!
    const box = popup.getBoundingClientRect()

    return {
      frame,
      inFrame: inFrame(".popup") !== null,
      popup: { top: box.top, opacity: getComputedStyle(popup.parentElement!).opacity },
      backdrop: getComputedStyle(inFrame(".backdrop") ?? document.querySelector(".backdrop")!).display,
      trigger: inFrame(".trigger")!.getBoundingClientRect().bottom
    }
  }, job)
}

describe("a preview's portals", () => {
  it("are drawn inside the frame, in the flow under what's there, shown and with their backdrop left out", async () => {
    const { frame, inFrame, popup, backdrop, trigger } = await renderPortal(true)
    expect(frame.error).toBeUndefined()
    expect(inFrame).toBe(true)
    expect(popup).toEqual({ top: trigger, opacity: "1" })
    expect(backdrop).toBe("none")
    // The preview's box, which its picture is cropped to, holds the trigger and the whole popup.
    expect(frame.nodes.find((node) => node.id === "preview")).toMatchObject({ height: 130 })
  })

  it("stay where their library put them for any other job, and after a preview", async () => {
    await renderPortal(true)
    const { inFrame, backdrop } = await renderPortal(false)
    expect(inFrame).toBe(false)
    expect(backdrop).toBe("block")
  })
})
