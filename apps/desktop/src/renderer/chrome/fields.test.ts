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
 * What the fields edit can change under them, as the selection does in the inspector. Below them are token pickers for a
 * fill set to primary, an unset text color and radii that differ across the selection.
 */
const entry = `
import { createElement as h, useState } from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { ProjectContext } from "../canvas/context.ts"
import { Field, FieldTarget, NumberField, NumberValueInput, TokenInput } from "./fields.tsx"

const rules = { kind: "length", unit: 4, min: 0, label: "Width" }
const tokens = [
  { name: "primary", category: "color", source: "semantic", values: { default: "oklch(0.5 0.2 260)" } },
  { name: "muted", category: "color", source: "semantic", values: { default: "oklch(0.95 0 0)" } },
  { name: "radius-lg", category: "radius", source: "theme", values: { default: "10px" } }
]
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
  // A number prop of 70, whose preview is made in the design while it shows, as ChangePreview makes it.
  const [prop, setProp] = useState(70)
  const [textColor, setTextColor] = useState(undefined)
  window.setOutside = setValue
  window.setTarget = setTarget
  window.layers = layers
  window.prop = prop
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
    })),
    h(Field, { label: "value" }, h(NumberValueInput, {
      value: prop, title: "value",
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
      onCommit: (next) => {
        window.log.push(["prop commit", next])
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
  )))
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
    // Its one commit is an undo step of its own, with no gesture around it (PAR-551).
    expect(await gestures()).toEqual([["commit", null]])
  })

  it("ends a run of Up and Down presses when the label is scrubbed", async () => {
    await width().click()
    await width().press("ArrowUp")
    const label = await page.getByText("Width", { exact: true }).boundingBox()
    await page.mouse.move(label!.x + 5, label!.y + 5)
    await page.mouse.down()
    await page.mouse.move(label!.x + 25, label!.y + 5)
    await page.mouse.up()
    expect(await gestures()).toEqual([
      ["begin", "g1"],
      ["commit", "g1"],
      ["end", "g1"],
      ["commit", null]
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

describe("number props (PAR-203)", () => {
  const props = async () => (await log()).filter(([kind]) => String(kind).startsWith("prop"))
  // @ts-expect-error The page's prop.
  const prop = () => page.evaluate(() => window.prop as number)

  it("previews from the value as it was, though the design holds the preview, and commits from it", async () => {
    await typeInto("value", "/20")
    await page.getByRole("textbox", { name: "value" }).press("Enter")
    // "/" can't be read; "/2" halves 70, and "/20" divides 70, not the 35 shown.
    expect(await props()).toEqual([
      ["prop preview", 35],
      ["prop preview", 3.5],
      ["prop commit", 3.5]
    ])
    expect(await prop()).toBe(3.5)
  })

  it("takes the preview back on Escape, and on Enter when it comes back to the value", async () => {
    const field = page.getByRole("textbox", { name: "value" })
    await typeInto("value", "5")
    await field.press("Escape")
    expect(await field.inputValue()).toBe("70")
    await typeInto("value", "70")
    await field.press("Enter")
    expect(await props()).toEqual([
      ["prop preview", 5],
      ["prop cancel"],
      ["prop preview", 7],
      ["prop preview", 70],
      ["prop cancel"]
    ])
    expect(await prop()).toBe(70)
  })

  it("scrubs from the value as it was", async () => {
    const label = await page.getByText("value", { exact: true }).boundingBox()
    await page.mouse.move(label!.x + 5, label!.y + 5)
    await page.mouse.down()
    await page.mouse.move(label!.x + 25, label!.y + 5)
    await page.mouse.up()
    expect(await props()).toEqual([
      ["prop preview", 80],
      ["prop commit", 80]
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
