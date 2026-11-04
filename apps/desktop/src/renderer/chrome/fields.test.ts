import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test"

// Focus, selection, keys and dragging are the browser's, so the number field runs in Chrome. It needs Chrome installed.
let browser: Browser
let page: Page
const errors: string[] = []

/**
 * What the page loads: a Width row holding 8 steps (32px) of a 4px spacing scale, and a Mixed row standing for two
 * selected layers of 8 and 75 steps. What the fields ask for is logged; commits change the values, as the store would.
 * The project's store gives the fields their gestures, logged as they begin and end, with the gesture of each commit.
 * What the fields edit can change under them, as the selection does in the inspector.
 */
const entry = `
import { createElement as h, useState } from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ProjectContext } from "../canvas/context.ts"
import { Field, FieldTarget, NumberField } from "./fields.tsx"

const rules = { kind: "length", unit: 4, min: 0, label: "Width" }
window.log = []
window.gestures = []
let gestures = 0
const store = {
  beginGesture: () => {
    gestures += 1
    window.gestures.push(["begin", "g" + gestures])
    return "g" + gestures
  },
  endGesture: (gesture) => window.gestures.push(["end", gesture])
}

function Harness() {
  const [value, setValue] = useState(8)
  const [layers, setLayers] = useState([8, 75])
  const [target, setTarget] = useState("first layer")
  window.setOutside = setValue
  window.setTarget = setTarget
  window.layers = layers
  return h(ProjectContext.Provider, { value: { store } }, h(FieldTarget.Provider, { value: target }, h(TooltipProvider, null,
    h(Field, { label: "Width" }, h(NumberField, {
      value, rules, title: "Width", blank: () => 0,
      onPreview: (update) => window.log.push(["preview", update(value)]),
      onCancel: () => window.log.push(["cancel"]),
      onCommit: (update, gesture) => {
        const next = update(value)
        window.log.push(["commit", next])
        window.gestures.push(["commit", gesture ?? null])
        setValue(next)
      }
    })),
    h(Field, { label: "Both", mixed: true }, h(NumberField, {
      value: undefined, rules, title: "Both", blank: () => 0,
      onCommit: (update) => setLayers(layers.map((layer) => update(layer)))
    }))
  )))
}

export function start() {
  createRoot(document.getElementById("root")).render(h(Harness))
}
`

beforeAll(async () => {
  const renderer = fileURLToPath(new URL("..", import.meta.url))
  const chrome = fileURLToPath(new URL(".", import.meta.url))
  const bundle = await build({
    stdin: { contents: entry, resolveDir: chrome, loader: "tsx", sourcefile: "entry.tsx" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "fields",
    platform: "browser",
    jsx: "automatic",
    alias: { "@": renderer.replace(/[\\/]$/, "") },
    define: { "process.env.NODE_ENV": '"development"' }
  })
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 600, height: 400 } })
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.route("http://parity.test/fields.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0]!.text })
  )
  await page.route("http://parity.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="root" style="width: 320px"></div><script src="http://parity.test/fields.js"></script>`
    })
  )
  await page.goto("http://parity.test/")
}, 30_000)

afterAll(async () => {
  await browser?.close()
})

beforeEach(async () => {
  await page.reload()
  // @ts-expect-error The bundle's global.
  await page.evaluate(() => fields.start())
  await page.getByRole("textbox", { name: "Width" }).waitFor()
})

const width = () => page.getByRole("textbox", { name: "Width" })
// @ts-expect-error The page's log.
const log = () => page.evaluate(() => window.log as unknown[][])
// @ts-expect-error The page's gestures.
const gestures = () => page.evaluate(() => window.gestures as unknown[][])
const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? null)

async function typeInto(name: string, text: string) {
  const input = page.getByRole("textbox", { name })
  await input.click()
  // Command+A on macOS, where Control+A moves to the start of the line instead.
  await input.press("ControlOrMeta+a")
  await input.pressSequentially(text)
}

describe("typing", () => {
  it("reads 320 as pixels, previewing each step as it's typed", async () => {
    await typeInto("Width", "320")
    // 3px isn't on the scale, so it previews the step it lands on.
    expect(await log()).toEqual([
      ["preview", 1],
      ["preview", 8],
      ["preview", 80]
    ])
  })

  it("commits on Enter, keeping the field with its text selected", async () => {
    await typeInto("Width", "320")
    await width().press("Enter")
    expect((await log()).at(-1)).toEqual(["commit", 80])
    expect(await width().inputValue()).toBe("320")
    expect(await focused()).toBe("Width")
    expect(await width().evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([
      0, 3
    ])
  })

  it("keeps input it can't read, with the reason, and takes the preview back", async () => {
    await typeInto("Width", "16")
    await width().pressSequentially("em")
    await width().press("Enter")
    expect(await width().inputValue()).toBe("16em")
    expect(await width().getAttribute("aria-invalid")).toBe("true")
    expect(await page.getByRole("alert").textContent()).toBe(
      `"em" isn't a unit Width takes: type a number, px, rem or %`
    )
    // 1px lands on 2px, the nearest half step; 16e and 16em can't be read, so they keep the last preview.
    expect(await log()).toEqual([["preview", 0.5], ["preview", 4], ["cancel"]])
    // Leaving the field keeps it too.
    await page.mouse.click(500, 350)
    expect(await width().inputValue()).toBe("16em")
  })

  it("keeps what's typed when the value changes underneath, until Escape puts the value back", async () => {
    await typeInto("Width", "12")
    // @ts-expect-error The page's setter.
    await page.evaluate(() => window.setOutside(10))
    expect(await width().inputValue()).toBe("12")
    await width().press("Escape")
    expect(await width().inputValue()).toBe("40")
    expect(await focused()).toBeNull()
  })

  it("says when a length snaps to the spacing scale", async () => {
    await typeInto("Width", "281")
    await width().press("Enter")
    expect((await log()).at(-1)).toEqual(["commit", 70.5])
    expect(await page.getByRole("status").textContent()).toBe("Snapped to 282px, the nearest step on the spacing scale")
  })
})

describe("stepping and scrubbing", () => {
  it("moves a step with Up and Down, ten with Shift", async () => {
    await width().click()
    await width().press("ArrowUp")
    await width().press("Shift+ArrowUp")
    await width().press("ArrowDown")
    expect((await log()).filter(([kind]) => kind === "commit")).toEqual([
      ["commit", 9],
      ["commit", 19],
      ["commit", 18]
    ])
    expect(await width().inputValue()).toBe("72")
  })

  it("makes a run of Up and Down one gesture, which Enter or leaving the field ends, and typing commits apart", async () => {
    await width().click()
    await width().press("ArrowUp")
    await page.waitForTimeout(1200)
    await width().press("ArrowUp")
    await width().press("Enter")
    await width().press("ArrowDown")
    await page.mouse.click(500, 350)
    await typeInto("Width", "40")
    await width().press("Enter")
    expect(await gestures()).toEqual([
      ["begin", "g1"],
      ["commit", "g1"],
      ["commit", "g1"],
      ["end", "g1"],
      ["begin", "g2"],
      ["commit", "g2"],
      ["end", "g2"],
      ["commit", null]
    ])
  })

  it("ends a run when what the field edits changes while it keeps focus", async () => {
    await width().click()
    await width().press("ArrowUp")
    // Another layer selected from the canvas, the field still focused: its presses are a step of their own.
    // @ts-expect-error The page's setter.
    await page.evaluate(() => window.setTarget("second layer"))
    // The run ends as the change draws, before another press.
    await expect.poll(gestures).toContainEqual(["end", "g1"])
    await width().press("ArrowUp")
    expect(await focused()).toBe("Width")
    expect(await gestures()).toEqual([
      ["begin", "g1"],
      ["commit", "g1"],
      ["end", "g1"],
      ["begin", "g2"],
      ["commit", "g2"]
    ])
  })

  it("scrubs by dragging the row's label, previewing, then commits once", async () => {
    const label = await page.getByText("Width", { exact: true }).boundingBox()
    await page.mouse.move(label!.x + 5, label!.y + 5)
    await page.mouse.down()
    await page.mouse.move(label!.x + 25, label!.y + 5)
    expect(await width().inputValue()).toBe("72")
    await page.mouse.up()
    const entries = await log()
    expect(entries.filter(([kind]) => kind === "commit")).toEqual([["commit", 18]])
    expect(entries).toContainEqual(["preview", 18])
    // In a gesture of its own, from the press to the release.
    expect(await gestures()).toEqual([
      ["begin", "g1"],
      ["commit", "g1"],
      ["end", "g1"]
    ])
  })

  it("takes a scrub back on Escape", async () => {
    const label = await page.getByText("Width", { exact: true }).boundingBox()
    await page.mouse.move(label!.x + 5, label!.y + 5)
    await page.mouse.down()
    await page.mouse.move(label!.x + 25, label!.y + 5)
    await page.keyboard.press("Escape")
    await page.mouse.up()
    expect((await log()).filter(([kind]) => kind === "commit")).toEqual([])
    expect((await log()).at(-1)).toEqual(["cancel"])
    expect(await width().inputValue()).toBe("32")
  })
})

describe("mixed values", () => {
  it("shows Mixed, and Mixed+8 adds 8px to each layer's own value", async () => {
    const both = page.getByRole("textbox", { name: "Both" })
    expect(await both.inputValue()).toBe("Mixed")
    await both.click()
    await both.press("End")
    await both.pressSequentially("+8")
    await both.press("Enter")
    // @ts-expect-error The page's layers.
    expect(await page.evaluate(() => window.layers)).toEqual([10, 77])
    expect(errors).toEqual([])
  })
})
