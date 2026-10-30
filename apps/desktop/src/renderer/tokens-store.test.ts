import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"

// Token edits preview in the shared stylesheet every frame adopts, so this runs in Chrome, where CSSOM is real. It
// needs Chrome installed.
let browser: Browser
let page: Page
const errors: string[] = []

/**
 * What the page loads: the token and design stores, with a project whose stylesheet declares `--primary` in the root
 * and dark themes, and a writer that keeps what Save writes.
 */
const entry = `
import { DesignStore } from "./design-store.ts"
import { keyframesNamed, TokenStore } from "./tokens-store.ts"
import { defaultModeSettings } from "@parity-app/core"

const tokens = [
  { name: "primary", category: "color", source: "semantic", values: { default: "black", dark: "white" } },
  { name: "radius", category: "radius", source: "semantic", values: { default: "0.5rem" } }
]
const css = ":host { --primary: black; --radius: 0.5rem; } .dark { --primary: white; }"

export const written = []
export { keyframesNamed }

export function open() {
  const store = new DesignStore([], defaultModeSettings, "app.par", {
    saveDocument: async () => undefined,
    autosave: () => false
  })
  return { store, tokens: guest(store) }
}

/** The guest loading again, as when the project's builder restarts: a fresh sheet and a new token store. */
export function guest(store) {
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css)
  const write = async (changes) => { written.push(changes) }
  return { sheet, store: new TokenStore(tokens, sheet, write, store, "src/index.css") }
}

/** A token's value in a theme, as the sheet declares it. */
export function declared(sheet, name, theme = "default") {
  const selector = theme === "default" ? ":host" : "." + theme
  const values = [...sheet.cssRules]
    .filter((rule) => rule.selectorText === selector)
    .map((rule) => rule.style.getPropertyValue("--" + name).trim())
    .filter(Boolean)
  return values.at(-1) ?? ""
}
`

beforeAll(async () => {
  const renderer = fileURLToPath(new URL(".", import.meta.url))
  const bundle = await build({
    stdin: { contents: entry, resolveDir: renderer, loader: "ts", sourcefile: "entry.ts" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "tokens",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage()
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route("http://parity.test/tokens.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0]!.text })
  )
  await page.route("http://parity.test/", (route) =>
    route.fulfill({ contentType: "text/html", body: `<script src="http://parity.test/tokens.js"></script>` })
  )
  await page.goto("http://parity.test/")
  // @ts-expect-error The bundle's global.
  if (!(await page.evaluate(() => typeof tokens === "object")))
    throw new Error(`The page didn't load: ${errors.join(",")}`)
}, 30_000)

afterAll(async () => {
  await browser?.close()
})

describe("editing tokens", () => {
  it("previews in the shared stylesheet, and undo and redo take it back and forth", async () => {
    const result = await page.evaluate(async () => {
      // @ts-expect-error The bundle's global.
      const { open, declared, written } = tokens
      written.length = 0
      const { store, tokens: project } = open()
      const seen = (theme?: string) => declared(project.sheet, "primary", theme)
      const steps: Record<string, unknown> = {}
      project.store.set([
        { name: "primary", theme: "default", value: "red" },
        { name: "primary", theme: "dark", value: "pink" }
      ])
      steps.edited = [seen(), seen("dark"), store.getHistory().undoLabel, store.hasUnsaved(), written.length]
      steps.listed = project.store.get()[0].values
      store.undo()
      steps.undone = [seen(), seen("dark"), store.hasUnsaved(), project.store.get()[0].values.default]
      store.redo()
      steps.redone = [seen(), project.store.previews().length]
      await store.flush()
      steps.saved = [written, store.hasUnsaved()]
      return steps
    })
    expect(result.edited).toEqual(["red", "pink", "Edit --primary", true, 0])
    expect(result.listed).toEqual({ default: "red", dark: "pink" })
    expect(result.undone).toEqual(["black", "white", false, "black"])
    expect(result.redone).toEqual(["red", 2])
    expect(result.saved).toEqual([
      [
        [
          { name: "primary", theme: "default", value: "red" },
          { name: "primary", theme: "dark", value: "pink" }
        ]
      ],
      false
    ])
  })

  it("takes out a value a theme didn't have when it's undone", async () => {
    const result = await page.evaluate(() => {
      // @ts-expect-error The bundle's global.
      const { open, declared } = tokens
      const { store, tokens: project } = open()
      project.store.set([{ name: "radius", theme: "dark", value: "1rem" }])
      const edited = declared(project.sheet, "radius", "dark")
      store.undo()
      return [edited, declared(project.sheet, "radius", "dark"), declared(project.sheet, "radius")]
    })
    expect(result).toEqual(["1rem", "", "0.5rem"])
  })

  it("shows unsaved edits in a guest loaded again, which then writes them", async () => {
    const result = await page.evaluate(async () => {
      // @ts-expect-error The bundle's global.
      const { open, guest, declared, written } = tokens
      written.length = 0
      const { store, tokens: first } = open()
      first.store.set([{ name: "primary", theme: "default", value: "red" }])
      const again = guest(store)
      const shown = declared(again.sheet, "primary")
      await store.flush()
      return [shown, written.length, store.hasUnsaved()]
    })
    expect(result).toEqual(["red", 1, false])
  })
})

describe("animation keyframes", () => {
  it("reads an animation token's keyframes from the stylesheet, also inside a layer, as the Web Animations API runs them", async () => {
    const frames = await page.evaluate(() => {
      // @ts-expect-error The bundle's global.
      const { keyframesNamed } = tokens
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(`@keyframes spin { to { transform: rotate(360deg) } }
        @layer theme {
          @keyframes bounce {
            0%, 100% { transform: translateY(-25%); animation-timing-function: cubic-bezier(0.8, 0, 1, 1) }
            50% { transform: none; animation-timing-function: cubic-bezier(0, 0, 0.2, 1) }
          }
        }`)
      const named = (name: string) => keyframesNamed(sheet.cssRules, name) ?? null
      return { bounce: named("bounce"), spin: named("spin"), pulse: named("pulse") }
    })
    expect(frames.bounce).toEqual([
      { transform: "translateY(-25%)", easing: "cubic-bezier(0.8, 0, 1, 1)", offset: 0 },
      { transform: "none", easing: "cubic-bezier(0, 0, 0.2, 1)", offset: 0.5 },
      { transform: "translateY(-25%)", easing: "cubic-bezier(0.8, 0, 1, 1)", offset: 1 }
    ])
    expect(frames.spin).toEqual([{ transform: "rotate(360deg)", offset: 1 }])
    expect(frames.pulse).toBeNull()
  })
})
