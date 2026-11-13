import { fileURLToPath } from "node:url"
import type { RenderNode } from "@parity-app/core"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test"
import type * as hostModule from "./frame-host.ts"
import type * as frameModule from "./frame.ts"

// A frame is a shadow root with real DOM, so this mounts one in Chrome. It needs Chrome installed. The guest is a small
// one of the test's own, which draws each node of its tree as a `div` and says where it drew them, as the React guest
// does, so what's checked is what the host module does around it.
let browser: Browser
let page: Page

const entry = `
export { mountFrame, watchFrame, frameBody, frameContent, frameDrawsDesign, blurFrame } from "./frame-host.ts"
export { drawnNodeIds, findNodeElement } from "./frame.ts"
`

beforeAll(async () => {
  const renderer = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: renderer, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    // frame.ts reads scrollbars.css as text, as Vite's `?raw` gives it.
    loader: { ".css": "text" },
    write: false,
    format: "iife",
    globalName: "frames",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage()
  await page.setContent(`<body><div id="area"></div></body>`)
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
  await page.evaluate(() => {
    /** What the guest did, in order, for the tests to read. */
    const log: string[] = []

    const guest = {
      mount(target: HTMLElement, tree: { nodeId: string }[], options: { globals?: Record<string, string> }) {
        let drawn: HTMLElement[] = []

        const draw = (nodes: { nodeId: string }[]) => {
          drawn = nodes.map(({ nodeId }) => {
            const element = document.createElement("div")
            // No `data-canvas-node`: a component that ignores its props is found only through what the guest says.
            element.dataset.drawn = nodeId
            element.tabIndex = 0

            return element
          })

          target.replaceChildren(...drawn)
        }

        draw(tree)
        log.push(`mount ${tree.length} ${JSON.stringify(options.globals ?? {})}`)

        return {
          update: (next: { nodeId: string }[]) => draw(next),
          resize: (viewport: { width: number }) => log.push(`resize ${viewport.width}`),
          unmount: () => log.push("unmount"),
          drawnNodes: () => ({
            ids: drawn.map((element) => element.dataset.drawn!),
            elements: (id: string) => drawn.filter((element) => element.dataset.drawn === id),
            texts: () => [],
            parent: () => undefined,
            nodeOf: (element: Element) => element.getAttribute("data-drawn") ?? undefined
          })
        }
      }
    }

    const sheet = new CSSStyleSheet()
    sheet.replaceSync(".dark { color: rgb(255, 255, 255) }")

    Object.assign(window, {
      log,
      // A tree as the test's guest reads it: each node's id.
      nodes: (...ids: string[]) => ids.map((nodeId) => ({ nodeId })),
      loaded: {
        guest,
        sheet,
        themeAttributes: { dark: { "data-theme": "dark" } },
        rules: (tree: { nodeId: string }[]) =>
          tree.map(({ nodeId }) => `[data-drawn="${nodeId}"] { order: 1 }`).join("")
      },
      mode: { classNames: ["dark"], attributes: {}, viewport: { width: 390, height: 844 }, globals: { theme: "dark" } }
    })
  })
})

afterAll(async () => {
  await browser?.close()
})

beforeEach(async () => {
  await page.evaluate(() => {
    log.length = 0
    const host = document.createElement("div")
    host.id = "host"
    document.querySelector("#area")!.replaceChildren(host)
  })
})

/** The bundle's global in the page, as `entry` exports it, and what the page set up beside it. */
declare const frames: typeof hostModule & Pick<typeof frameModule, "drawnNodeIds" | "findNodeElement">
declare const log: string[]
declare const nodes: (...ids: string[]) => RenderNode[]
declare const loaded: hostModule.FrameMount["loaded"]
declare const mode: hostModule.FrameMount["mode"]

describe("mountFrame", () => {
  it("draws the tree in a body set up for the mode, and finds its nodes through the guest", async () => {
    const mounted = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const tree = nodes("a", "b")
      const frame = frames.mountFrame(host, { loaded, mode, tree })
      const body = frames.frameBody(host)!

      return {
        log: [...log],
        classes: [...body.classList],
        theme: body.getAttribute("data-theme"),
        targetInBody: body.contains(frame.target),
        ids: frames.drawnNodeIds(host),
        found: frames.findNodeElement(host, "b")?.dataset.drawn
      }
    })

    expect(mounted.log).toEqual(['mount 2 {"theme":"dark"}'])
    expect(mounted.classes).toEqual(["dark"])
    expect(mounted.theme).toBe("dark")
    expect(mounted.targetInBody).toBe(true)
    expect(mounted.ids).toEqual(["a", "b"])
    expect(mounted.found).toBe("b")
  })

  it("draws an update in place, and resizes the window it stands for", async () => {
    const after = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const frame = frames.mountFrame(host, { loaded, mode })
      frame.update(nodes("c"))
      frame.resize({ width: 768, height: 1024 })

      return { log: [...log], ids: frames.drawnNodeIds(host) }
    })

    expect(after.log).toEqual(['mount 0 {"theme":"dark"}', "resize 768"])
    expect(after.ids).toEqual(["c"])
  })

  it("empties the frame when it's taken apart, and its lookups stop going through the guest", async () => {
    const after = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const frame = frames.mountFrame(host, { loaded, mode, tree: nodes("a") })
      frame.unmount()

      return { log: [...log], children: frames.frameContent(host)!.childNodes.length, ids: frames.drawnNodeIds(host) }
    })

    expect(after.log).toEqual(['mount 1 {"theme":"dark"}', "unmount"])
    expect(after.children).toBe(0)
    expect(after.ids).toEqual([])
  })

  it("lets the guest go after the caller's task when asked to, with the frame emptied at once", async () => {
    const after = await page.evaluate(async () => {
      const host = document.querySelector<HTMLElement>("#host")!
      const frame = frames.mountFrame(host, { loaded, mode })
      frame.unmount({ soon: true })
      const straightAway = { log: [...log], children: frames.frameContent(host)!.childNodes.length }
      await Promise.resolve()

      return { straightAway, later: [...log] }
    })

    expect(after.straightAway).toEqual({ log: ['mount 0 {"theme":"dark"}'], children: 0 })
    expect(after.later).toEqual(['mount 0 {"theme":"dark"}', "unmount"])
  })

  it("leaves a newer mount alone when an older one is taken apart after it", async () => {
    const after = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const older = frames.mountFrame(host, { loaded, mode, tree: nodes("old") })
      frames.mountFrame(host, { loaded, mode, tree: nodes("new") })
      older.unmount()

      return { ids: frames.drawnNodeIds(host), log: [...log] }
    })

    expect(after.ids).toEqual(["new"])
    expect(after.log.at(-1)).toBe("unmount")
  })
})

describe("watchFrame", () => {
  it("hears what a frame draws from when it's mounted, when asked before", async () => {
    const heard = await page.evaluate(async () => {
      const host = document.querySelector<HTMLElement>("#host")!
      let changes = 0
      frames.watchFrame(host, () => changes++)
      frames.mountFrame(host, { loaded, mode }).update(nodes("a"))
      await Promise.resolve()

      return changes
    })

    expect(heard).toBeGreaterThan(0)
  })

  it("hears nothing once stopped, even for a frame mounted after", async () => {
    const heard = await page.evaluate(async () => {
      const host = document.querySelector<HTMLElement>("#host")!
      let changes = 0
      const stop = frames.watchFrame(host, () => changes++)
      stop()
      frames.mountFrame(host, { loaded, mode }).update(nodes("a"))
      await Promise.resolve()

      return changes
    })

    expect(heard).toBe(0)
  })

  it("hears the attributes it's asked for, and only those", async () => {
    const heard = await page.evaluate(async () => {
      const host = document.querySelector<HTMLElement>("#host")!
      const frame = frames.mountFrame(host, { loaded, mode, tree: nodes("a") })
      const element = frame.target.querySelector("div")!
      let changes = 0
      frames.watchFrame(host, () => changes++, { attributes: ["data-parity-source"] })
      element.setAttribute("title", "Not watched")
      await Promise.resolve()
      const before = changes
      element.setAttribute("data-parity-source", "src/App.tsx:1:1")
      await Promise.resolve()

      return { before, after: changes }
    })

    expect(heard).toEqual({ before: 0, after: 1 })
  })
})

describe("a frame's content", () => {
  it("has nothing before the frame is mounted", async () => {
    const empty = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!

      return { body: frames.frameBody(host) ?? null, content: frames.frameContent(host) ?? null }
    })

    expect(empty).toEqual({ body: null, content: null })
  })

  it("draws its design once one of its nodes carries its attribute", async () => {
    const drawn = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const frame = frames.mountFrame(host, { loaded, mode, tree: nodes("a") })
      const before = frames.frameDrawsDesign(host)
      frame.target.firstElementChild!.setAttribute("data-canvas-node", "a")

      return { before, after: frames.frameDrawsDesign(host) }
    })

    expect(drawn).toEqual({ before: false, after: true })
  })

  it("lets go of focus inside it", async () => {
    const focused = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>("#host")!
      const frame = frames.mountFrame(host, { loaded, mode, tree: nodes("a") })
      const element = frame.target.querySelector("div")!
      element.focus()
      const before = frames.frameContent(host) instanceof ShadowRoot && host.shadowRoot!.activeElement === element
      frames.blurFrame(host)

      return { before, after: host.shadowRoot!.activeElement === element }
    })

    expect(focused).toEqual({ before: true, after: false })
  })
})
