import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// Where a lifted element is drawn comes from the browser's transforms, so this lifts elements in Chrome. It needs Chrome
// installed. Each is an absolutely placed layer with a scale, a rotation and a translate of its own, which turn about
// its transform origin, and a mark where it's grabbed, to see whether that point stays under the pointer.
let browser: Browser
let page: Page

const entry = `export { liftElements } from "./element-lift.ts"`

const layer = (id: string, top: number) =>
  `<div id="${id}" style="position: absolute; left: 200px; top: ${top}px; width: 160px; height: 80px;
    background: rgb(0, 128, 0); scale: 1.25; rotate: 20deg; translate: 12px 4px">
    <div class="mark" style="position: absolute; left: 119px; top: 49px; width: 2px; height: 2px"></div></div>`

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "lifts",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  await page.setContent(`<body style="margin: 0">${layer("moving", 150)}${layer("still", 450)}</body>`)
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
})

afterAll(async () => {
  await browser?.close()
})

interface Lifted {
  /** Where the mark was, where it was grabbed, before and once the lift has eased in. */
  mark: { x: number; y: number }
  markLifted: { x: number; y: number }
  width: number
  widthLifted: number
  origin: string
  originLifted: string
}

/** Lifts the element with `id` by its mark, lets the lift ease all the way in, and says where things are. */
async function liftByMark(id: string): Promise<Lifted> {
  return page.evaluate((id) => {
    const element = document.getElementById(id)!
    const mark = element.querySelector(".mark")!

    const centre = () => {
      const { left, top, width, height } = mark.getBoundingClientRect()

      return { x: left + width / 2, y: top + height / 2 }
    }

    const before = { mark: centre(), width: element.getBoundingClientRect().width }
    const origin = getComputedStyle(element).transformOrigin

    // SAFETY: the bundle's global is element-lift.ts's exports.
    // @ts-expect-error The bundle's global.
    lifts.liftElements([element], { origin: before.mark, scale: 1 })

    for (const animation of element.getAnimations()) {
      animation.finish()
    }

    return {
      mark: before.mark,
      markLifted: centre(),
      width: before.width,
      widthLifted: element.getBoundingClientRect().width,
      origin,
      originLifted: getComputedStyle(element).transformOrigin
    }
  }, id)
}

describe("an element with transforms of its own, lifted", () => {
  let lifted: Lifted

  beforeAll(async () => {
    lifted = await liftByMark("moving")
  })

  it("grows 3%", () => {
    expect(lifted.widthLifted / lifted.width).toBeCloseTo(1.03, 3)
  })

  it("keeps where it was grabbed under the pointer", () => {
    // To within a quarter of a pixel, as the browser measures transformed boxes.
    expect(Math.abs(lifted.markLifted.x - lifted.mark.x)).toBeLessThan(0.25)
    expect(Math.abs(lifted.markLifted.y - lifted.mark.y)).toBeLessThan(0.25)
  })

  it("keeps its transform origin, which its own scale and rotation turn about", () => {
    expect(lifted.originLifted).toBe(lifted.origin)
  })
})

describe("an element with transforms of its own, lifted with reduced motion", () => {
  let lifted: Lifted

  beforeAll(async () => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    lifted = await liftByMark("still")
  })

  afterAll(async () => {
    await page.emulateMedia({ reducedMotion: null })
  })

  it("doesn't grow or move at all", () => {
    expect(lifted.widthLifted).toBe(lifted.width)
    expect(lifted.markLifted).toEqual(lifted.mark)
    expect(lifted.originLifted).toBe(lifted.origin)
  })
})
