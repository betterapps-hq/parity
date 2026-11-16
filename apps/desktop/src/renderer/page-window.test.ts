import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test"

// docs/editor.md, A project's code can't reload Parity's window or change its root (PAR-1207). The boundary wraps the
// page's own methods and tells code apart by where it was served from, so this runs in Chrome, with Parity's page and a
// project's code served from two origins.
let browser: Browser
let page: Page
let bundle = ""

/** The project's side: what a development client, a theme toggle or a scroll lock does to the page. */
const projectScript = `
window.project = {
  reload() {
    location.reload()
  },
  setTheme() {
    const root = document.documentElement
    root.classList.add("dark")
    root.classList.remove("light")
    root.setAttribute("data-theme", "dark")
    root.style.colorScheme = "dark"
    document.body.style.setProperty("overflow", "hidden")
    document.body.className = "project"

    return { toggled: root.classList.toggle("contrast"), attribute: root.toggleAttribute("data-dim") }
  },
  styleOwn(element) {
    element.classList.add("dark")
    element.setAttribute("data-theme", "dark")
    element.style.colorScheme = "dark"
  }
}
`

/** Parity's error reporting wraps every listener the page adds, as Sentry does, so its code calls the guard's. */
const wrapListeners = `
const addEventListener = EventTarget.prototype.addEventListener
EventTarget.prototype.addEventListener = function (type, listener, options) {
  const wrapped = function (event) { return listener.call(this, event) }
  return addEventListener.call(this, type, wrapped, options)
}
`

beforeAll(async () => {
  const renderer = fileURLToPath(new URL(".", import.meta.url))

  const built = await build({
    stdin: { contents: 'export { guardWindow } from "./page-window.ts"', resolveDir: renderer, loader: "ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "parity",
    platform: "browser"
  })

  bundle = built.outputFiles[0]!.text
  browser = await chromium.launch({ channel: "chrome", headless: true })
})

afterAll(async () => {
  await browser?.close()
})

beforeEach(async () => {
  await page?.close()
  page = await browser.newPage()
  await page.route("http://parity.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: [
        '<html class="light"><body>',
        '<script src="http://parity.test/parity.js"></script>',
        '<script src="http://project.test/project.js"></script>',
        "<script>window.loads = (Number(sessionStorage.loads) || 0) + 1; sessionStorage.loads = loads</script>",
        "</body></html>"
      ].join("")
    })
  )
  await page.route("http://parity.test/parity.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: `${wrapListeners}\n${bundle}\nparity.guardWindow()` })
  )
  await page.route("http://project.test/project.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: projectScript })
  )
  await page.goto("http://parity.test/")
})

declare const project: {
  reload(): void
  setTheme(): { toggled: boolean; attribute: boolean }
  styleOwn(element: Element): void
}

declare const loads: number

describe("a project's code in Parity's window", () => {
  it("can't reload it, and says which origin tried, while Parity's own code can", async () => {
    // Chrome only lets a page stay when it's been used, and asks first, which this answers by staying. Electron stays
    // without asking.
    const seen: string[] = []

    page.on("dialog", (dialog) => {
      seen.push(`asked: ${dialog.type()}`)
      void dialog.dismiss()
    })
    page.on("console", (message) => seen.push(message.text()))
    await page.click("body")
    await page.evaluate(() => project.reload())
    await page.waitForTimeout(300)
    const afterProject = await page.evaluate(() => loads)

    const reloaded = page.waitForEvent("load")
    await page.evaluate(() => location.reload())
    await reloaded

    expect({ afterProject, afterParity: await page.evaluate(() => loads), seen }).toEqual({
      afterProject: 1,
      afterParity: 2,
      seen: [
        "[window] Kept Parity's window open: code from http://project.test tried to reload or leave it.",
        "asked: beforeunload"
      ]
    })
  })

  it("can't change its <html> or <body>, which answer as if it had", async () => {
    const result = await page.evaluate(() => {
      const answers = project.setTheme()
      const root = document.documentElement

      return {
        answers,
        root: root.outerHTML.slice(0, root.outerHTML.indexOf(">") + 1),
        body: document.body.getAttribute("style") ?? "",
        bodyClass: document.body.className
      }
    })

    expect(result).toEqual({
      answers: { toggled: true, attribute: true },
      root: '<html class="light">',
      body: "",
      bodyClass: ""
    })
  })

  it("leaves Parity's own changes to them, and the project's to its own elements", async () => {
    const result = await page.evaluate(() => {
      const root = document.documentElement
      root.classList.replace("light", "dark")
      document.body.style.overflow = "hidden"

      const own = document.createElement("div")
      project.styleOwn(own)

      return {
        root: root.className,
        body: document.body.getAttribute("style"),
        own: own.outerHTML
      }
    })

    expect(result).toEqual({
      root: "dark",
      body: "overflow: hidden;",
      own: '<div class="dark" data-theme="dark" style="color-scheme: dark;"></div>'
    })
  })
})
