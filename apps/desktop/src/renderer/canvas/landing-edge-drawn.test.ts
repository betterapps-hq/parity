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
    </div>
    <div id="scaled-row" style="display: flex; gap: 20px; padding: 40px">
      <div id="scaled-first" style="width: 80px; height: 40px"></div>
      <div id="scaled" style="width: 60px; height: 40px; scale: 2"></div>
    </div>
    <div style="margin: 60px; rotate: 20deg; scale: 1.5; width: 400px">
      <div id="turned-row" style="display: flex; gap: 20px">
        <div id="turned-first" style="width: 80px; height: 40px"></div>
        <div id="turned" style="width: 60px; height: 40px"></div>
      </div>
    </div>
    <div id="nest-column" style="display: flex; flex-direction: column; width: 300px">
      <div id="nest-gone" style="height: 100px"></div>
      <div id="nest" style="display: flex; gap: 10px; height: 40px">
        <div id="nest-first" style="width: 50px; height: 40px"></div>
        <div id="nest-second" style="width: 50px; height: 40px"></div>
      </div>
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

describe("a slide of something scaled, or in something turned", () => {
  /** Moves the element with `id` to the start of its row and says where it's drawn, before and as its slide starts. */
  async function slideToStart(id: string) {
    return page.evaluate((id) => {
      const element = document.getElementById(id)!
      const row = element.parentElement!
      const box = ({ left, top }: DOMRect) => ({ left, top })
      // SAFETY: as above.
      // @ts-expect-error The bundle's global.
      const { slideElements } = edges
      const was = box(element.getBoundingClientRect())
      slideElements([...row.children], () => row.prepend(element), false)

      return { was, sliding: box(element.getBoundingClientRect()) }
    }, id)
  }

  it("starts from where an element with a scale of its own was drawn", async () => {
    const { was, sliding } = await slideToStart("scaled")

    expect(Math.abs(sliding.left - was.left)).toBeLessThan(0.25)
    expect(Math.abs(sliding.top - was.top)).toBeLessThan(0.25)
  })

  it("starts from where an element in something scaled and turned was drawn", async () => {
    const { was, sliding } = await slideToStart("turned")

    expect(Math.abs(sliding.left - was.left)).toBeLessThan(0.25)
    expect(Math.abs(sliding.top - was.top)).toBeLessThan(0.25)
  })
})

describe("a slide of a layout and what's in it", () => {
  let drawn: { was: Corner[]; sliding: Corner[]; ended: Corner[] }

  beforeAll(async () => {
    drawn = await page.evaluate(() => {
      const column = document.getElementById("nest-column")!
      const nest = document.getElementById("nest")!
      const gone = document.getElementById("nest-gone")!
      const watched = [nest, ...nest.children]
      const corner = ({ left, top }: DOMRect) => ({ left, top })
      const corners = () => watched.map((element) => corner(element.getBoundingClientRect()))
      // SAFETY: as above.
      // @ts-expect-error The bundle's global.
      const { endSlides, slideElements } = edges
      const was = corners()

      // As a drop preview does: what's above the layout is hidden, so the layout moves up, and a copy goes in at its
      // start, so what's in it moves along.
      slideElements(
        [...column.children, ...nest.children],
        () => {
          gone.style.display = "none"
          const copy = document.createElement("div")
          copy.style.cssText = "width: 30px; height: 40px; flex: none"
          nest.prepend(copy)
        },
        false
      )

      const sliding = corners()
      endSlides(watched)

      return { was, sliding, ended: corners() }
    })
  })

  it("starts the layout and what's in it from where they were drawn", () => {
    drawn.sliding.forEach((box, index) => {
      expect(Math.abs(box.left - drawn.was[index]!.left)).toBeLessThan(0.25)
      expect(Math.abs(box.top - drawn.was[index]!.top)).toBeLessThan(0.25)
    })
  })

  it("ends them where they're laid out", () => {
    // Up by what was hidden, and what's in it along by the copy and its gap.
    expect(drawn.ended[0]!.top - drawn.was[0]!.top).toBeCloseTo(-100, 1)
    expect(drawn.ended[1]!.left - drawn.was[1]!.left).toBeCloseTo(40, 1)
    expect(drawn.ended[1]!.top - drawn.was[1]!.top).toBeCloseTo(-100, 1)
  })
})

/** Where an element's drawn from, its top-left on screen. */
interface Corner {
  left: number
  top: number
}
