import { join, resolve } from "node:path"
import type { Guest, RenderNode } from "@parity-app/core"
import { type Browser, chromium, type Page } from "playwright-core"
import { build, type Plugin, type Rolldown } from "vite"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { exampleProject } from "./example-project.ts"

// `storybook build` has no dev server to serve the example's guest module from, so the plugin builds it as a chunk of
// its own. This builds the stand-in service's view of the example with the app's Vite config, as Storybook does, serves
// the output as a static site would, and loads the guest in Chrome from where the project says it is. It needs Chrome
// installed.
const desktop = resolve(import.meta.dirname, "..")
const site = "http://storybook.test/"
let files: Map<string, Rolldown.OutputAsset | Rolldown.OutputChunk>
let browser: Browser
let page: Page
const errors: string[] = []

/** What stories import, as `host.ts` does, left on the window for the page to read. */
const story: Plugin = {
  name: "test:story",
  resolveId: (id) => (id === "story" ? "\0story" : undefined),
  load: (id) =>
    id === "\0story" ? `import project from "virtual:parity/example-project"\nwindow.example = project` : undefined
}

beforeAll(async () => {
  // Kept in memory, so the app's own build in its output folder is left alone.
  const output = (await build({
    configFile: join(desktop, "vite.config.ts"),
    root: desktop,
    base: "./",
    logLevel: "silent",
    plugins: [exampleProject(), story],
    build: { write: false, emptyOutDir: false, rolldownOptions: { input: { story: "story" } } }
  })) as Rolldown.RolldownOutput
  files = new Map(output.output.map((file) => [file.fileName, file]))
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage()
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(error.message))
  const entry = [...files.values()].find((file) => file.type === "chunk" && file.name === "story")
  await page.route(`${site}**`, (route) => {
    const path = new URL(route.request().url()).pathname.slice(1)
    // The page imports the guest as the canvas does, by URL.
    if (path === "") {
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><script type="module" src="./${entry?.fileName}"></script>
          <script type="module">window.importGuest = (url) => import(url)</script>`
      })
    }
    const file = files.get(path)
    if (!file) {
      errors.push(`404 ${path}`)
      return route.fulfill({ status: 404 })
    }
    let type: string | undefined
    if (path.endsWith(".js")) type = "text/javascript"
    else if (path.endsWith(".css")) type = "text/css"
    return route.fulfill({
      ...(type ? { contentType: type } : {}),
      body: file.type === "chunk" ? file.code : Buffer.from(file.source)
    })
  })
  await page.goto(site)
  await page.waitForFunction(() => "example" in window && "importGuest" in window, undefined, { timeout: 10_000 })
}, 120_000)

afterAll(async () => {
  await browser?.close()
})

describe("the example project in a Storybook build", () => {
  it("builds the guest module as a chunk of its own and points the project at it", async () => {
    const guest = [...files.values()].find((file) => file.type === "chunk" && file.name === "example-guest")
    expect(guest?.type === "chunk" && guest.exports).toEqual(["default"])
    const guestUrl = await page.evaluate(() => (window as unknown as StoryWindow).example.info.guestUrl)
    expect(guestUrl).toBe(new URL(guest!.fileName, site).href)
  })

  it("loads the guest from there and draws the example's components", async () => {
    const drawn = await page.evaluate(async () => {
      const { example, importGuest } = window as unknown as StoryWindow
      const guest = (await importGuest(example.info.guestUrl)).default
      const target = document.createElement("div")
      document.body.append(target)
      const save: RenderNode = {
        kind: "component",
        nodeId: "save",
        component: "Button",
        props: {},
        slots: { children: [{ kind: "text", text: "Save" }] }
      }
      guest.mount(target, [save])
      await new Promise((settle) => setTimeout(settle, 200))
      return {
        components: guest.components.length,
        button: target.querySelector("button")?.textContent,
        styled: guest.css.includes("--primary")
      }
    })
    expect(drawn.components).toBeGreaterThan(10)
    expect(drawn.button).toBe("Save")
    expect(drawn.styled).toBe(true)
    expect(errors).toEqual([])
  })
})

/** What the test page leaves on its window: the project as stories see it, and the canvas's way of loading guests. */
type StoryWindow = {
  example: { info: { guestUrl: string } }
  importGuest(url: string): Promise<{ default: Guest }>
}
