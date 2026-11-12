import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test"
import { z } from "zod"

// Focus, selection, keys and dragging are the browser's, so the number field runs in Chrome. It needs Chrome installed.
let browser: Browser
let page: Page
const errors: string[] = []

/**
 * What the page loads: a Seats row holding a number prop of 70, whose preview is made in the design while it shows,
 * with what it asks for logged, and token pickers for a fill set to primary, an unset text color and radii that differ
 * across the selection.
 */
const entry = `
import { createElement as h, useState } from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { Field, TokenInput } from "./fields.tsx"
import { Field as Row } from "../inspector/controls/field-row.tsx"
import { NumberProp } from "../inspector/controls/number-field.tsx"

const tokens = [
  { name: "primary", category: "color", source: "semantic", values: { default: "oklch(0.5 0.2 260)" } },
  { name: "muted", category: "color", source: "semantic", values: { default: "oklch(0.95 0 0)" } },
  { name: "radius-lg", category: "radius", source: "theme", values: { default: "10px" } }
]
window.log = []

function Harness() {
  // A number prop of 70, whose preview is made in the design while it shows, as ChangePreview makes it.
  const [prop, setProp] = useState(70)
  const [textColor, setTextColor] = useState(undefined)
  window.prop = prop
  return h(TooltipProvider, null,
    h(Row, { label: "Seats" }, h(NumberProp, {
      label: "Seats",
      value: prop,
      preview: {
        onPreview: (next) => {
          window.log.push(["prop preview", next])
          setProp(next)
        },
        onCancel: () => {
          window.log.push(["prop cancel"])
          setProp(70)
        }
      },
      onChange: (next, gesture) => {
        window.log.push(gesture ? ["prop commit", next, "in a run"] : ["prop commit", next])
        setProp(next)
      }
    })),
    // Token pickers, named for their property and what they show, as the Design tab's Fill, Color and Radius rows are.
    h(Field, { label: "Fill" }, h(TokenInput, {
      label: "Fill", value: "primary", tokens, categories: ["color"], onChange: () => {}
    })),
    h(Field, { label: "Color" }, h(TokenInput, {
      label: "Text color", value: textColor, tokens, categories: ["color"], onChange: setTextColor
    })),
    h(Field, { label: "Radius", mixed: true }, h(TokenInput, {
      label: "Radius", value: undefined, tokens, categories: ["radius"], onChange: () => {}
    }))
  )
}

export function start() {
  createRoot(document.getElementById("root")).render(h(Harness))
}
`

beforeAll(async () => {
  const chrome = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: chrome, loader: "tsx", sourcefile: "entry.tsx" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "fields",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' }
  })

  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage({ viewport: { width: 600, height: 400 } })
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text())
    }
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
})

afterAll(async () => {
  await browser?.close()
})

beforeEach(async () => {
  await page.reload()
  // @ts-expect-error The bundle's global.
  await page.evaluate(() => fields.start())
  await page.getByRole("textbox", { name: "Seats" }).waitFor()
})

// The page's log, parsed, since the page's globals come back untyped.
const entries = z.array(z.array(z.unknown()))

const log = async () =>
  // @ts-expect-error The page's log.
  entries.parse(await page.evaluate(() => window.log))

async function typeInto(name: string, text: string) {
  const input = page.getByRole("textbox", { name })
  await input.click()
  // Command+A on macOS, where Control+A moves to the start of the line instead.
  await input.press("ControlOrMeta+a")
  await input.pressSequentially(text)
}

describe("number props (PAR-203)", () => {
  const props = async () => (await log()).filter(([kind]) => String(kind).startsWith("prop"))

  // The page's prop, parsed, since the page's globals come back untyped.
  const prop = async () =>
    // @ts-expect-error The page's prop.
    z.number().parse(await page.evaluate(() => window.prop))

  it("makes a run of Up and Down presses in one gesture, and Escape takes it back", async () => {
    const field = page.getByRole("textbox", { name: "Seats" })
    await field.click()
    await field.press("ArrowUp")
    await field.press("ArrowUp")
    await field.press("Escape")
    expect(await props()).toEqual([
      ["prop commit", 71, "in a run"],
      ["prop commit", 72, "in a run"],
      ["prop commit", 70, "in a run"]
    ])
    expect(await prop()).toBe(70)
  })

  it("previews from the value as it was, though the design holds the preview, and commits from it", async () => {
    await typeInto("Seats", "/20")
    await page.getByRole("textbox", { name: "Seats" }).press("Enter")
    // "/" can't be read; "/2" halves 70, and "/20" divides 70, not the 35 shown.
    expect(await props()).toEqual([
      ["prop preview", 35],
      ["prop preview", 3.5],
      ["prop commit", 3.5]
    ])
    expect(await prop()).toBe(3.5)
  })

  it("takes the preview back on Escape, and makes what Enter comes back to", async () => {
    const field = page.getByRole("textbox", { name: "Seats" })
    await typeInto("Seats", "5")
    await field.press("Escape")
    expect(await field.inputValue()).toBe("70")
    await typeInto("Seats", "70")
    await field.press("Enter")
    expect(await props()).toEqual([
      ["prop preview", 5],
      ["prop cancel"],
      ["prop preview", 7],
      ["prop preview", 70],
      ["prop commit", 70]
    ])
    expect(await prop()).toBe(70)
  })

  it("scrubs from the value as it was, a step per screen pixel", async () => {
    const label = await page.getByText("Seats", { exact: true }).boundingBox()
    await page.mouse.move(label!.x + 5, label!.y + 5)
    await page.mouse.down()
    await page.mouse.move(label!.x + 25, label!.y + 5)
    await page.mouse.up()
    expect(await props()).toEqual([
      ["prop preview", 90],
      ["prop commit", 90]
    ])
  })
})

describe("token pickers (PAR-722)", () => {
  const picker = (name: string) => page.getByRole("button", { name, exact: true })

  it("names each for its property and the token, None or Mixed it shows", async () => {
    expect(await picker("Fill, primary").count()).toBe(1)
    expect(await picker("Text color, None").count()).toBe(1)
    expect(await picker("Radius, Mixed").count()).toBe(1)
  })

  it("renames the picker for the token picked in it", async () => {
    await picker("Text color, None").click()
    await page.getByRole("option", { name: "primary" }).click()
    await expect.poll(() => picker("Text color, primary").count()).toBe(1)
  })
})
