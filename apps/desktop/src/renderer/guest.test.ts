import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// `previewToken` edits a real CSSStyleSheet, and the offscreen renderer lays token values over a guest's stylesheet, which
// Node doesn't have, so this runs in Chrome, where CSSOM is real. It needs Chrome installed.
let browser: Browser
let page: Page
const errors: string[] = []

/** What the page loads: a guest stylesheet whose compiled CSS declares `--primary` in the root and dark themes. */
const entry = `
import { guestSheet, previewToken, showTokenOverrides } from "./guest.ts"

export const css = ":host { --primary: black; --radius: 0.5rem; } .dark { --primary: white; }"
export { guestSheet, previewToken, showTokenOverrides }

/** The whole stylesheet, as its rules read now. */
export function text(sheet) {
  return [...sheet.cssRules].map((rule) => rule.cssText).join("\\n")
}
`

beforeAll(async () => {
  const renderer = fileURLToPath(new URL(".", import.meta.url))
  const bundle = await build({
    stdin: { contents: entry, resolveDir: renderer, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "guest",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage()
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("http://parity.test/guest.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0]!.text })
  )
  await page.route("http://parity.test/", (route) =>
    route.fulfill({ contentType: "text/html", body: `<script src="http://parity.test/guest.js"></script>` })
  )
  await page.goto("http://parity.test/")
  // @ts-expect-error The bundle's global.
  if (!(await page.evaluate(() => typeof guest === "object")))
    throw new Error(`The page didn't load: ${errors.join(",")}`)
}, 30_000)

afterAll(async () => {
  await browser?.close()
})

describe("token overrides on an offscreen frame's stylesheet", () => {
  it("give the same stylesheet for the same overrides, whichever frame came before", async () => {
    const sheets = await page.evaluate(() => {
      // @ts-expect-error The bundle's global.
      const { css, guestSheet, showTokenOverrides, text } = guest
      const sheet = guestSheet(css)
      const compiled = text(sheet)
      const a = [
        { name: "primary", theme: "default", value: "red" },
        { name: "radius", theme: "dark", value: "1rem" }
      ]
      showTokenOverrides(sheet, a)
      const first = text(sheet)
      showTokenOverrides(sheet, [])
      const none = text(sheet)
      showTokenOverrides(sheet, [{ name: "primary", theme: "dark", value: "pink" }])
      const other = text(sheet)
      showTokenOverrides(sheet, a)
      return { compiled, first, none, other, again: text(sheet) }
    })
    expect(sheets.first).toContain("--primary: red")
    expect(sheets.first).toContain(".dark { --radius: 1rem; }")
    expect(sheets.none).toBe(sheets.compiled)
    expect(sheets.other).not.toContain("--radius: 1rem")
    expect(sheets.other).not.toContain("--primary: red")
    expect(sheets.again).toBe(sheets.first)
  })

  it("take out a value a theme didn't have once the overrides leave it out, and only go on a guest's stylesheet", async () => {
    const result = await page.evaluate(() => {
      // @ts-expect-error The bundle's global.
      const { css, guestSheet, showTokenOverrides, text } = guest
      const sheet = guestSheet(css)
      const compiled = text(sheet)
      showTokenOverrides(sheet, [{ name: "radius", theme: "dark", value: "1rem" }])
      showTokenOverrides(sheet, [])
      const cleared = text(sheet)
      // A sheet that isn't a guest's has nothing to start again from.
      let refused = ""
      try {
        showTokenOverrides(new CSSStyleSheet(), [{ name: "primary", theme: "default", value: "red" }])
      } catch (error) {
        refused = String(error)
      }
      return { compiled, cleared, refused }
    })
    expect(result.cleared).toBe(result.compiled)
    expect(result.refused).toContain("guestSheet")
  })

  it("lay a set over the sheet again after a set that failed partway", async () => {
    const result = await page.evaluate(() => {
      // @ts-expect-error The bundle's global.
      const { css, guestSheet, showTokenOverrides, text } = guest
      const sheet = guestSheet(css)
      const a = [{ name: "radius", theme: "dark", value: "1rem" }]
      showTokenOverrides(sheet, a)
      const first = text(sheet)
      let threw = false
      try {
        // A theme that isn't a class name makes the rule it would add unreadable.
        showTokenOverrides(sheet, [{ name: "radius", theme: "{", value: "2rem" }])
      } catch {
        threw = true
      }
      showTokenOverrides(sheet, a)
      return { first, threw, again: text(sheet) }
    })
    expect(result.threw).toBe(true)
    expect(result.again).toBe(result.first)
  })
})

/** The stylesheet's rules after previewing a token, one per line. */
function previewed(css: string, name: string, theme: string, value: string): Promise<string[]> {
  return page.evaluate(
    ({ css, name, theme, value }) => {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(css)
      // @ts-expect-error The bundle's global.
      guest.previewToken(sheet, name, theme, value)
      const lines: string[] = []
      const collect = (list: CSSRuleList) => {
        for (const rule of list) {
          if (rule instanceof CSSStyleRule) lines.push(rule.cssText)
          else if ("cssRules" in rule) collect((rule as CSSGroupingRule).cssRules)
        }
      }
      collect(sheet.cssRules)
      return lines
    },
    { css, name, theme, value }
  )
}

describe("previewToken", () => {
  it("edits a theme where the stylesheet declares it, by class or by attribute", async () => {
    const css = `:host { --c: #fff; } [data-theme="dark"] { --c: #000; } .dark { --c: #111; }`
    expect(await previewed(css, "c", "dark", "red")).toEqual([
      ":host { --c: #fff; }",
      '[data-theme="dark"] { --c: red; }',
      ".dark { --c: red; }"
    ])
  })

  it("adds a value a theme lacks with the selector that theme already uses", async () => {
    const css = `:host { --c: #fff; --d: 1px; } [data-theme="dark"] { --c: #000; }`
    expect((await previewed(css, "d", "dark", "2px")).at(-1)).toBe('[data-theme="dark"] { --d: 2px; }')
  })

  it("leaves a prefers-color-scheme block alone when previewing the default", async () => {
    const css = `:host { --c: #fff; } @media (prefers-color-scheme: dark) { :host { --c: #000; } }`
    expect(await previewed(css, "c", "default", "red")).toEqual([":host { --c: red; }", ":host { --c: #000; }"])
  })
})
