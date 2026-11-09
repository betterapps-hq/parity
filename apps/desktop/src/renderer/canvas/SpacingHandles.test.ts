import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { contrastRatio, type Rgba } from "@parity-app/tokens"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test"

// The handles hatch what they change while the pointer is on them, and their colors are the app's custom properties, so
// this renders them in Chrome with the canvas colors from styles.css. It needs Chrome installed.
let browser: Browser
let page: Page
const errors: string[] = []

const entry = `
import { createElement } from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { spacingHandles } from "@parity-app/editor"
import { chipColors } from "./kinds.tsx"
import { SpacingHandles } from "./SpacingHandles.tsx"
import { spacingChip, spacingColors, spacingHatch } from "./spacing-colors.ts"

const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height })

// The dashboard's stats row, 100px in from the page's corner: padding 16 and 24, three cards 112 by 56, 12 apart.
const handles = spacingHandles({
  rect: rect(100, 100, 408, 88),
  border: { top: 0, right: 0, bottom: 0, left: 0 },
  padding: { top: 16, right: 24, bottom: 16, left: 24 },
  children: [rect(124, 116, 112, 56), rect(248, 116, 112, 56), rect(372, 116, 112, 56)],
  direction: "row",
  oneLine: true
})

export const hatches = { padding: spacingHatch(spacingColors.padding), gap: spacingHatch(spacingColors.gap) }
export const chips = { padding: spacingChip("padding"), gap: spacingChip("gap"), ...chipColors }

let root
export function mount(dragging) {
  root?.unmount()
  root = createRoot(document.querySelector("#overlay"))
  root.render(
    createElement(
      TooltipProvider,
      null,
      createElement(SpacingHandles, {
        handles,
        unit: 4,
        tokens: [],
        valueOf: (handle) => ({ px: handle.kind === "gap" ? 12 : ["top", "bottom"].includes(handle.side) ? 16 : 24 }),
        dragging,
        onPress: () => undefined,
        onType: () => undefined,
        onPick: () => undefined,
        onStep: () => undefined
      })
    )
  )
}
`

/** The canvas's colors, as styles.css declares them, so the chips and hatching resolve as they do in the app. */
function canvasColors(): string {
  const styles = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8")

  return [...styles.matchAll(/^\s*(--canvas-[\w-]+):\s*([^;]+);/gm)]
    .map(([, name, value]) => `${name}: ${value};`)
    .join("")
}

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "tsx", sourcefile: "entry.tsx" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "spacing",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text())
    }
  })
  page.on("pageerror", (error) => errors.push(error.message))
  // The few Tailwind classes the handles are placed with.
  await page.setContent(`<style>:root { color-scheme: light; ${canvasColors()} }
    .absolute { position: absolute } .pointer-events-none { pointer-events: none }</style>
    <body style="margin: 0"><div id="overlay" style="position: relative; height: 600px"></div></body>`)
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
})

afterAll(async () => {
  await browser?.close()
})

async function mount(dragging?: { key: string; px: number; sides?: string[] }) {
  // @ts-expect-error The bundle's global.
  await page.evaluate((dragging) => spacing.mount(dragging), dragging)
  // React draws the handles in a task of its own after `mount` returns, so wait for the last of the six.
  await page.locator(".spacing-handle").nth(5).waitFor()
}

beforeEach(async () => {
  errors.length = 0
  await page.mouse.move(700, 550)
  await mount()
})

interface Hatched {
  /** Where the hatched shape sits on the page. */
  box: { x: number; y: number; w: number; h: number }
  /** The areas it's clipped to, inside it: x, y, width and height. */
  areas: number[][]
  /** Its background, as Chrome reads it back. */
  background: string
}

/** Padding's or gaps' hatching, as Chrome reads it back from a style. */
function hatchOf(spacing: "padding" | "gap"): Promise<string> {
  return page.evaluate((spacing) => {
    const probe = document.createElement("div")
    // @ts-expect-error The bundle's global.
    probe.style.background = window.spacing.hatches[spacing]

    return probe.style.background
  }, spacing)
}

/** The hatched shapes drawn now. */
function hatched(): Promise<Hatched[]> {
  return page.locator("[data-spacing-hatch]").evaluateAll((elements: HTMLElement[]) =>
    elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      const { style } = element
      // Each area is drawn as `M x y h w v h h -w z`.
      const numbers = (style.clipPath.match(/-?[\d.]+/g) ?? []).map(Number)
      const areas = []

      for (let index = 0; index + 4 < numbers.length; index += 5) {
        areas.push(numbers.slice(index, index + 4))
      }

      return { box: { x, y, w: width, h: height }, areas, background: style.background }
    })
  )
}

describe("hatching a layout's padding and gaps", { timeout: 20_000 }, () => {
  it("hatches nothing while no handle is in use", async () => {
    expect(await hatched()).toEqual([])
    expect(errors).toEqual([])
  })

  it("hatches a padding side from corner to corner while the pointer is on its handle, then nothing", async () => {
    await page.mouse.move(114, 144)

    const background = await hatchOf("padding")
    await expect.poll(hatched).toEqual([{ box: { x: 100, y: 100, w: 24, h: 88 }, areas: [[0, 0, 24, 88]], background }])

    await page.mouse.move(700, 550)
    await expect.poll(hatched).toEqual([])
  })

  it("hatches every gap together while the pointer is on one", async () => {
    await page.mouse.move(242, 144)

    await expect.poll(hatched).toEqual([
      {
        box: { x: 236, y: 116, w: 136, h: 56 },
        areas: [
          [0, 0, 12, 56],
          [124, 0, 12, 56]
        ],
        background: await hatchOf("gap")
      }
    ])
  })

  it("hatches every side a drag changes as one shape, so each corner is hatched once", async () => {
    await mount({ key: "padding:left", px: 24, sides: ["top", "right", "bottom", "left"] })

    expect(await hatched()).toEqual([
      {
        box: { x: 100, y: 100, w: 408, h: 88 },
        areas: [
          [0, 0, 408, 16],
          [384, 0, 24, 88],
          [0, 72, 408, 16],
          [0, 0, 24, 88]
        ],
        background: await hatchOf("padding")
      }
    ])
  })
})

/** A CSS color as Chrome draws it, as sRGB channels from 0 to 1. */
function drawn(color: string): Promise<Rgba> {
  return page.evaluate((color) => {
    const context = new OffscreenCanvas(1, 1).getContext("2d")!
    const probe = document.createElement("div")
    probe.style.color = color
    document.body.append(probe)
    context.fillStyle = getComputedStyle(probe).color
    probe.remove()
    context.fillRect(0, 0, 1, 1)
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data

    return { r: r! / 255, g: g! / 255, b: b! / 255, a: 1 }
  }, color)
}

describe("a spacing value's chip", { timeout: 20_000 }, () => {
  it("shows beside a hovered handle in the handle's chip colors", async () => {
    await page.mouse.move(114, 144)
    // The value and its step of the scale, with a margin between them.
    const chip = page.getByText(/^24\s*spacing-6$/)
    await chip.waitFor()

    const colors = await chip.evaluate((element) => {
      const style = getComputedStyle(element)

      return { background: style.backgroundColor, color: style.color }
    })

    // @ts-expect-error The bundle's global.
    const expected = await page.evaluate(() => spacing.chips.padding)
    expect(await drawn(colors.background)).toEqual(await drawn(expected.background))
    expect(await drawn(colors.color)).toEqual(await drawn(expected.color))
  })

  it("keeps its text 4.5:1 or better on its fill, as every chip over the canvas does", async () => {
    // @ts-expect-error The bundle's global.
    const chips: Record<string, { background: string; color: string }> = await page.evaluate(() => spacing.chips)
    const ratios: Record<string, number> = {}

    for (const [name, chip] of Object.entries(chips)) {
      ratios[name] = contrastRatio(await drawn(chip.color), await drawn(chip.background))
    }

    expect(Object.entries(ratios).filter(([, ratio]) => ratio < 4.5)).toEqual([])
    expect(Object.keys(ratios)).toEqual(expect.arrayContaining(["padding", "gap"]))
  })
})
