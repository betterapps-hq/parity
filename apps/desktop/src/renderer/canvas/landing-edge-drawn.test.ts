import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// Where a landing outline is drawn and where a sliding copy is measured both come from layout, which only a browser
// does, so this draws a layout in Chrome. It needs Chrome installed. The row holds copies as a drag's preview puts them
// in a layout: a box, a box that clips what overflows it, and an image, which can't draw what it holds.
let browser: Browser
let page: Page

const entry = `export { drawLandingEdge } from "./landing-edge.ts"
export { endSlides, slideElements } from "./make-room.ts"`

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "edges",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  await page.setContent(`<body style="margin: 0">
    <div id="row" style="position: relative; display: flex; gap: 20px; padding: 40px">
      <div id="first" style="width: 80px; height: 60px"></div>
      <div id="box" style="position: relative; width: 120px; height: 60px"></div>
      <div id="clips" style="position: relative; width: 120px; height: 60px; overflow: hidden"></div>
      <img id="image" alt="" style="position: relative; width: 100px; height: 60px"
        src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
    </div></body>`)
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
})

afterAll(async () => {
  await browser?.close()
})

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Draws an outline round the element with `id` and gives where it is beside the element's own box, and what holds it. */
async function outline(id: string, clips = false) {
  return page.evaluate(
    ({ id, clips }) => {
      const copy = document.getElementById(id)!
      // The same outline each time, as a preview keeps one for each copy.
      const edge = document.getElementById(`${id}-edge`) ?? document.createElement("span")
      edge.id = `${id}-edge`
      // SAFETY: the bundle's global is landing-edge.ts's and make-room.ts's exports.
      // @ts-expect-error The bundle's global.
      edges.drawLandingEdge(copy, edge, { color: "red", scale: 1, radius: 0, clips })

      const box = ({ left, top, right, bottom }: DOMRect) => ({ left, top, right, bottom })

      return {
        copy: box(copy.getBoundingClientRect()),
        edge: box(edge.getBoundingClientRect()),
        inside: edge.parentElement === copy
      }
    },
    { id, clips }
  )
}

/** A box grown by `by` on every side. */
const grown = ({ left, top, right, bottom }: Box, by: number): Box => ({
  left: left - by,
  top: top - by,
  right: right + by,
  bottom: bottom + by
})

describe("a landing outline", () => {
  it("is drawn inside a copy, 2.5px out round it: the 1.5px line and its 1px gap", async () => {
    const { copy, edge, inside } = await outline("box")

    expect(inside).toBe(true)
    expect(edge).toEqual(grown(copy, 2.5))
  })

  it("is drawn just inside a copy that clips what overflows it, where it's seen", async () => {
    const { copy, edge, inside } = await outline("clips", true)

    expect(inside).toBe(true)
    expect(edge).toEqual(copy)
  })

  it("is drawn beside an image, which can't draw what it holds, pinned round it just as far out", async () => {
    const { copy, edge, inside } = await outline("image")

    expect(inside).toBe(false)
    expect(edge).toEqual(grown(copy, 2.5))
  })

  it("follows the image when it's put somewhere else", async () => {
    await page.evaluate(() => {
      const row = document.getElementById("row")!
      row.insertBefore(document.getElementById("image")!, row.firstElementChild)
    })

    const { copy, edge, inside } = await outline("image")

    expect(inside).toBe(false)
    expect(edge).toEqual(grown(copy, 2.5))
    // It's first in the row now, past the row's 40px padding.
    expect(copy.left).toBe(40)
  })
})

describe("a copy still sliding into place", () => {
  it("is measured where it's laid out once its slide is ended", async () => {
    const at = await page.evaluate(() => {
      const row = document.getElementById("row")!
      const box = document.getElementById("box")!
      // SAFETY: as above.
      // @ts-expect-error The bundle's global.
      const { endSlides, slideElements } = edges
      const was = box.getBoundingClientRect().left

      // Moved past the box after it, it slides there from where it was.
      slideElements([...row.children], () => row.append(box), false)
      const sliding = box.getBoundingClientRect().left
      endSlides([box])

      return { was, sliding, ended: box.getBoundingClientRect().left }
    })

    expect(at.sliding).toBe(at.was)
    // Past the 120px box and the row's 20px gap.
    expect(at.ended).toBe(at.was + 140)
  })
})
