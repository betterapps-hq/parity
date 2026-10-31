import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// `previewToken` edits a real CSSStyleSheet, which Node doesn't have, so this runs it in Chrome. It needs Chrome
// installed.
let browser: Browser
let page: Page

beforeAll(async () => {
  const bundle = await build({
    stdin: {
      contents: `export { previewToken } from "./guest.ts"`,
      resolveDir: fileURLToPath(new URL(".", import.meta.url)),
      loader: "ts",
      sourcefile: "entry.ts"
    },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "guest",
    platform: "browser"
  })
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage()
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
}, 30_000)

afterAll(async () => {
  await browser?.close()
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
