import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// Frames are real DOM, so this lays them out and renders into them in Chrome: Node has no layout. It needs Chrome
// installed.
let browser: Browser
let page: Page
const errors: string[] = []

/**
 * What the test page loads: the frame code, a guest, and a component that asks the window its size the ways projects
 * do. It's served from the project's server, and the page from Parity's, as in the app.
 */
const entry = `
export { prepareFrame, setFrameViewport } from "./frame.ts"
export { prepareCanvasCss } from "@parity/core"
export { createGuest } from "@parity/renderer-react/guest"
import { createElement, useEffect, useState, useSyncExternalStore } from "react"

// shadcn's useIsMobile.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(undefined)
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)")
    const onChange = () => setIsMobile(window.innerWidth < 768)
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < 768)
    return () => mql.removeEventListener("change", onChange)
  }, [])
  return !!isMobile
}

// Asks on every render, as MUI's useMediaQuery does.
function useWide() {
  return useSyncExternalStore(
    (onChange) => {
      const mql = matchMedia("(min-width: 1024px)")
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => matchMedia("(min-width: 1024px)").matches
  )
}

function useResizes() {
  const [resizes, setResizes] = useState(0)
  useEffect(() => {
    const onResize = () => setResizes((count) => count + 1)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  return resizes
}

export function Probe() {
  const [clicks, setClicks] = useState(0)
  return createElement(
    "button",
    {
      "data-mobile": String(useIsMobile()),
      "data-wide": String(useWide()),
      "data-resizes": String(useResizes()),
      "data-width": String(window.innerWidth),
      "data-clicks": String(clicks),
      style: { minHeight: "10vh" },
      onClick: () => setClicks((count) => count + 1)
    },
    "Probe"
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
    globalName: "frame",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"', "import.meta.url": '"http://project.test/frame.js"' }
  })
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("http://project.test/frame.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0]!.text })
  )
  // Parity's own code, which asks the window its size as tldraw does.
  await page.route("http://parity.test/parity.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.parityAsks = () => ({ width: innerWidth, mobile: matchMedia("(max-width: 767px)").matches,
        client: document.documentElement.clientWidth })`
    })
  )
  // Inside the canvas, text is 12px with an 18px line height, in its own font and color scheme, and unselectable.
  await page.route("http://parity.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div style="font: 12px/18px monospace; letter-spacing: 1px; color: red; color-scheme: dark;
        user-select: none; pointer-events: none"><div id="host"></div></div><iframe></iframe><div id="frames"></div>
        <script src="http://project.test/frame.js"></script><script src="http://parity.test/parity.js"></script>`
    })
  )
  await page.goto("http://parity.test/")
  // @ts-expect-error The bundle's global.
  if (!(await page.evaluate(() => typeof frame === "object"))) throw new Error(`The page didn't load: ${errors}`)
}, 30_000)

afterAll(async () => {
  await browser?.close()
})

/** Prepares the frame at `#host` with a project's stylesheet, a 390 by 844 window, and HTML in place of a design. */
function frameWith(projectCss: string, html = "", hostStyle = "") {
  return page.evaluate(
    ({ projectCss, html, hostStyle }) => {
      const host = document.createElement("div")
      document.querySelector("#host")!.replaceWith(host)
      host.id = "host"
      host.style.cssText = `width: 390px; ${hostStyle}`
      const sheet = new CSSStyleSheet()
      // @ts-expect-error The bundle's global.
      sheet.replaceSync(frame.prepareCanvasCss(projectCss, { baseUrl: "http://project.test" }).scoped)
      // @ts-expect-error The bundle's global.
      const target = frame.prepareFrame(host, sheet, {
        classNames: [],
        attributes: {},
        viewport: { width: 390, height: 844 }
      }) as HTMLElement
      target.innerHTML = html
    },
    { projectCss, html, hostStyle }
  )
}

/** Text styles of a frame's body, with the project's stylesheet, next to a fresh page's body. */
async function inherited(projectCss: string) {
  await frameWith(projectCss)
  return page.evaluate(() => {
    const properties = ["font-size", "line-height", "font-family", "letter-spacing", "color", "color-scheme"]
    const read = (element: Element) =>
      Object.fromEntries(properties.map((name) => [name, getComputedStyle(element).getPropertyValue(name)]))
    const body = document.querySelector("#host")!.shadowRoot!.firstElementChild!
    return {
      frame: read(body),
      page: read(document.querySelector("iframe")!.contentDocument!.body),
      canvas: { pointerEvents: getComputedStyle(body).pointerEvents, userSelect: getComputedStyle(body).userSelect }
    }
  })
}

describe("a frame's root", () => {
  it("starts where a browser page's does, not from the canvas around it", async () => {
    const { frame, page } = await inherited("")
    expect(frame).toEqual(page)
    expect(frame["font-size"]).toBe("16px")
  })

  it("takes the project's own root styles, even from a layer", async () => {
    const { frame } = await inherited("@layer base { :host { line-height: 1.5; font-family: serif } }")
    expect(frame["line-height"]).toBe("24px")
    expect(frame["font-family"]).toBe("serif")
  })

  it("leaves pointer events and text selection to the canvas", async () => {
    expect((await inherited("")).canvas).toEqual({ pointerEvents: "none", userSelect: "none" })
  })
})

describe("a frame's body", () => {
  /** Where a heading's top is in a frame and on a fresh page, and the frame body's margin and height. */
  async function heading(projectCss: string, hostStyle = "") {
    await frameWith(projectCss, "<h1>Title</h1>", hostStyle)
    return page.evaluate(() => {
      const host = document.querySelector("#host")!
      const body = host.shadowRoot!.firstElementChild as HTMLElement
      // A project's page has a doctype: without one, a browser drops a body's first margin.
      const document_ = document.querySelector("iframe")!.contentDocument!
      document_.open()
      document_.write("<!doctype html><h1>Title</h1>")
      document_.close()
      const top = (element: Element, origin: Element) =>
        element.getBoundingClientRect().top - origin.getBoundingClientRect().top
      return {
        frame: top(host.shadowRoot!.querySelector("h1")!, host),
        page: top(document_.querySelector("h1")!, document_.documentElement),
        margin: getComputedStyle(body).margin,
        height: body.getBoundingClientRect().height
      }
    })
  }

  it("has a browser's margin, which the first heading's margin joins as on a page", async () => {
    const { frame, page, margin } = await heading("")
    expect(margin).toBe("8px")
    expect(frame).toBeCloseTo(page, 1)
    expect(frame).toBeGreaterThan(8)
  })

  it("takes the project's reset", async () => {
    expect((await heading("body { margin: 0 }")).margin).toBe("0px")
  })

  it("keeps its margin inside a frame with a fixed height", async () => {
    expect((await heading("", "height: 300px")).height).toBe(284)
    expect((await heading("body { margin: 0 }", "height: 300px")).height).toBe(300)
  })
})

describe("a frame's viewport", () => {
  it("answers the project's media queries for the frame's width", async () => {
    await frameWith(
      ".box { width: 10px } @media (max-width: 767px) { .box { width: 20px } }",
      '<div class="box"></div>'
    )
    const width = await page.evaluate(
      () => document.querySelector("#host")!.shadowRoot!.querySelector(".box")!.getBoundingClientRect().width
    )
    expect(width).toBe(20)
  })

  it("measures the project's viewport units, not Parity's window", async () => {
    await frameWith(".box { width: 50vw; height: 25dvh; min-height: 10vmax }", '<div class="box"></div>')
    const size = await page.evaluate(() => {
      const box = document.querySelector("#host")!.shadowRoot!.querySelector(".box")!.getBoundingClientRect()
      return { width: box.width, height: box.height }
    })
    expect(size).toEqual({ width: 195, height: 211 })
  })
})

describe("styles written while the project runs", () => {
  it("measure viewport units against the frame, however they're written", async () => {
    await frameWith("", '<div class="h-[100vh]"></div><div style="height: 20vh"></div>')
    const heights = await page.evaluate(async () => {
      const shadow = document.querySelector("#host")!.shadowRoot!
      const target = shadow.querySelector("[data-canvas-body] > div")!
      const [selector, markup] = [...target.children] as HTMLElement[]
      const add = (style: (element: HTMLElement) => void) => {
        const element = document.createElement("div")
        style(element)
        target.append(element)
        return element
      }
      const inline = {
        property: add((element) => (element.style.height = "50vh")),
        setProperty: add((element) => element.style.setProperty("height", "25dvh")),
        attribute: add((element) => element.setAttribute("style", "height: 10vh")),
        cssText: add((element) => (element.style.cssText = "height: 5vw")),
        markup: markup!,
        // As a re-render changes it.
        changed: add((element) => (element.style.height = "1vh"))
      }
      inline.changed.style.height = "45vh"
      // Rules CSS-in-JS adds: text in a <style>, as in development, and inserted rules, as in production.
      const text = document.createElement("style")
      text.textContent = ".text { height: 30vh } .h-\\[100vh\\] { height: 1vh }"
      shadow.append(text)
      text.append(document.createTextNode(".appended { height: 15vh }"))
      const inserted = document.createElement("style")
      shadow.append(inserted)
      inserted.sheet!.insertRule(".inserted { height: 40vh }")
      const constructed = new CSSStyleSheet()
      constructed.replaceSync(".constructed { height: 35vh }")
      shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, constructed]
      const rules = Object.fromEntries(
        ["text", "appended", "inserted", "constructed"].map((name) => [
          name,
          add((element) => element.classList.add(name))
        ])
      )
      await new Promise((resolve) => setTimeout(resolve))
      const height = (element: Element) => Math.round(element.getBoundingClientRect().height * 10) / 10
      return Object.fromEntries(
        Object.entries({ ...inline, ...rules, selector: selector! }).map(([name, element]) => [name, height(element)])
      )
    })
    expect(heights).toEqual({
      property: 422,
      setProperty: 211,
      attribute: 84.4,
      cssText: 19.5,
      markup: 168.8,
      changed: 379.8,
      text: 253.2,
      appended: 126.6,
      inserted: 337.6,
      constructed: 295.4,
      selector: 8.4
    })
  })

  it("leave Parity's own styles measuring Parity's window", async () => {
    const heights = await page.evaluate(() => {
      const element = document.createElement("div")
      element.style.height = "50vh"
      const other = document.createElement("div")
      other.setAttribute("style", "height: 10vh")
      document.body.append(element, other)
      const height = (element: Element) => element.getBoundingClientRect().height
      return [height(element), height(other)]
    })
    expect(heights).toEqual([350, 70])
  })
})

describe("a frame's window", () => {
  type Viewport = { width: number; height: number }

  /** Mounts frames together, as the canvas does in one commit. */
  function mount(frames: Record<string, Viewport>) {
    return page.evaluate((frames) => {
      // @ts-expect-error The bundle's global.
      const guest = frame.createGuest({ components: { Probe: frame.Probe }, css: "" })
      const handles = ((window as unknown as { handles?: Record<string, unknown> }).handles ??= {})
      for (const [id, viewport] of Object.entries(frames)) {
        const host = document.createElement("div")
        host.id = id
        host.style.width = `${viewport.width}px`
        document.querySelector("#frames")!.append(host)
        // @ts-expect-error The bundle's global.
        const target = frame.prepareFrame(host, new CSSStyleSheet(), { classNames: [], attributes: {}, viewport })
        handles[id] = guest.mount(
          target,
          [{ kind: "component", component: "Probe", nodeId: id, props: {}, slots: {} }],
          { viewport }
        )
      }
    }, frames)
  }

  /** What the frame's component saw, once its renders have settled. */
  async function probe(id: string) {
    await page.waitForTimeout(50)
    return page.evaluate((id) => {
      const button = document.querySelector(`#${id}`)!.shadowRoot!.querySelector("button")!
      return { ...button.dataset, height: String(Math.round(button.getBoundingClientRect().height * 10) / 10) }
    }, id)
  }

  it("answers each frame's size questions for it", async () => {
    await mount({ phone: { width: 390, height: 844 }, laptop: { width: 1280, height: 800 } })
    expect(await probe("phone")).toMatchObject({ mobile: "true", wide: "false", width: "390", height: "84.4" })
    expect(await probe("laptop")).toMatchObject({ mobile: "false", wide: "true", width: "1280", height: "80" })
    expect(errors).toEqual([])
  })

  it("leaves Parity's window to Parity's code", async () => {
    // @ts-expect-error The Parity script's global.
    expect(await page.evaluate(() => parityAsks())).toEqual({ width: 1000, mobile: false, client: 1000 })
  })

  it("keeps answering for a frame its user acts in", async () => {
    await page.click("#phone button")
    expect(await probe("phone")).toMatchObject({ clicks: "1", wide: "false", width: "390" })
    await page.click("#laptop button")
    expect(await probe("laptop")).toMatchObject({ clicks: "1", wide: "true", width: "1280" })
    // @ts-expect-error The Parity script's global.
    expect(await page.evaluate(() => parityAsks())).toEqual({ width: 1000, mobile: false, client: 1000 })
  })

  it("leaves Parity's window to code evaluated without a source, as in DevTools", async () => {
    await page.click("#phone button")
    expect(
      await page.evaluate(() => ({
        width: innerWidth,
        mobile: matchMedia("(max-width: 767px)").matches,
        client: document.documentElement.clientWidth
      }))
    ).toEqual({ width: 1000, mobile: false, client: 1000 })
  })

  it("tells a frame's media queries and resize listeners when its window resizes", async () => {
    await page.evaluate(() => {
      const handles = (window as unknown as { handles: Record<string, { resize(viewport: Viewport): void }> }).handles
      const viewport = { width: 1280, height: 800 }
      // As ModeView does.
      // @ts-expect-error The bundle's global.
      frame.setFrameViewport(document.querySelector("#phone"), viewport)
      handles.phone!.resize(viewport)
    })
    expect(await probe("phone")).toMatchObject({
      mobile: "false",
      wide: "true",
      resizes: "1",
      width: "1280",
      height: "80"
    })
    expect(await probe("laptop")).toMatchObject({ mobile: "false", wide: "true", resizes: "0" })
    expect(errors).toEqual([])
  })
})
