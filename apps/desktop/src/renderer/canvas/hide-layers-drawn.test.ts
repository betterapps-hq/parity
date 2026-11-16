import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// What a hidden layer still shows, and the room it takes, come from the cascade and layout, which only a browser does,
// so this draws a layer in Chrome. It needs Chrome installed. The layer holds a line that makes itself visible, which
// inherits nothing from a hidden layer, and a table with a collapsed row, which takes no room.
let browser: Browser
let page: Page

const entry = `export { hideLayers } from "./hide-layers.ts"`

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "hiding",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  await page.setContent(`<body style="margin: 0">
    <div id="layer" style="width: 200px; font: 14px/20px sans-serif">
      <p class="shown" style="visibility: visible; margin: 0">Shown</p>
      <table style="border-spacing: 0"><tr class="collapsed" style="visibility: collapse"><td>Gone</td></tr>
        <tr><td>Kept</td></tr></table>
    </div></body>`)
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
})

afterAll(async () => {
  await browser?.close()
})

/** Each part of the element with `id`, or of its copy, as it's drawn. */
function drawnParts(id: string) {
  return page.evaluate((id) => {
    const element = document.getElementById(id)!
    const look = (selector: string) => getComputedStyle(element.querySelector(selector)!).visibility

    return {
      layer: getComputedStyle(element).visibility,
      shown: look(".shown"),
      collapsed: look(".collapsed"),
      kept: look("tr:not(.collapsed)"),
      height: element.offsetHeight
    }
  }, id)
}

describe("a layer hidden where it landed", () => {
  let before: Awaited<ReturnType<typeof drawnParts>>
  let hidden: Awaited<ReturnType<typeof drawnParts>>
  let shownAgain: Awaited<ReturnType<typeof drawnParts>>

  beforeAll(async () => {
    before = await drawnParts("layer")
    await page.evaluate(() => {
      // SAFETY: the bundle's global is hide-layers.ts's exports.
      // @ts-expect-error The bundle's global.
      const { hideLayers } = hiding
      // @ts-expect-error A global for the test to show the layer again.
      window.showLayer = hideLayers([document.getElementById("layer")!])
    })
    hidden = await drawnParts("layer")
    // @ts-expect-error The global set above.
    await page.evaluate(() => window.showLayer())
    shownAgain = await drawnParts("layer")
  })

  it("hides what's inside that makes itself visible", () => {
    expect(hidden.layer).toBe("hidden")
    expect(hidden.shown).toBe("hidden")
    expect(hidden.kept).toBe("hidden")
  })

  it("leaves a collapsed row collapsed, so the layer takes the room it did", () => {
    expect(hidden.collapsed).toBe("collapse")
    expect(hidden.height).toBe(before.height)
  })

  it("shows it all again as it was", () => {
    expect(shownAgain).toEqual(before)
  })
})

describe("a drop preview's copy of a layer", () => {
  let copy: Awaited<ReturnType<typeof drawnParts>>
  let edge: string

  beforeAll(async () => {
    edge = await page.evaluate(() => {
      const layer = document.getElementById("layer")!
      // SAFETY: a deep clone of an element is an element of the same kind.
      const copied = layer.cloneNode(true) as HTMLElement
      copied.id = "copy"
      // SAFETY: as above.
      // @ts-expect-error The bundle's global.
      const { hideLayers } = hiding
      // Hidden before it's put anywhere, from how its layer is drawn.
      hideLayers([copied], [layer])
      document.body.append(copied)

      // The landing outline goes inside the copy and shows itself.
      const outline = document.createElement("span")
      outline.style.setProperty("visibility", "visible", "important")
      copied.append(outline)

      return getComputedStyle(outline).visibility
    })
    copy = await drawnParts("copy")
  })

  it("shows nothing of what's in it, and takes its layer's room", async () => {
    expect(copy.layer).toBe("hidden")
    expect(copy.shown).toBe("hidden")
    expect(copy.collapsed).toBe("collapse")
    expect(copy.height).toBe((await drawnParts("layer")).height)
  })

  it("still shows its landing outline", () => {
    expect(edge).toBe("visible")
  })
})
