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
 * What the page loads: a project document and its token store, with a project whose stylesheet declares `--primary`
 * in the root and dark themes, and a writer that keeps what Save writes.
 */
const entry = `
import { openTestSession } from "./doc-fixtures.ts"
import { keyframesNamed, TokenStore } from "./tokens-store.ts"

const tokens = [
  { name: "primary", category: "color", source: "semantic", values: { default: "black", dark: "white" } },
  { name: "radius", category: "radius", source: "semantic", values: { default: "0.5rem" } }
]
const css = ":host { --primary: black; --radius: 0.5rem; } .dark { --primary: white; }"

export const written = []
export { keyframesNamed }

export function open() {
  const designs = openTestSession([])
  return { designs, tokens: guest(designs) }
}

/** The guest loading again, as when the project's builder restarts: a fresh sheet and a new token store. */
export function guest(designs) {
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css)
  const write = async (changes) => { written.push(changes) }
  return { sheet, store: new TokenStore(tokens, sheet, write, designs, "src/index.css") }
}

/** A guest that loaded \`--primary\` saved as another value, as a copy joining a live room after the host saved. */
export function guestSaved(designs, primary) {
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css.replace("--primary: black", "--primary: " + primary))
  const saved = tokens.map((token) =>
    token.name === "primary" ? { ...token, values: { ...token.values, default: primary } } : token
  )
  return { sheet, store: new TokenStore(saved, sheet, async () => {}, designs, "src/index.css") }
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

  if (!(await page.evaluate(() => "tokens" in window))) {
    throw new Error(`The page didn't load: ${errors.join(",")}`)
  }
})

afterAll(async () => {
  await browser?.close()
})

describe("editing tokens", () => {
  it("previews in the shared stylesheet, and undo and redo take it back and forth", async () => {
    const result = await page.evaluate(async () => {
      // @ts-expect-error The bundle's global.
      const { open, declared, written } = tokens
      written.length = 0
      const { designs, tokens: project } = open()
      const seen = (theme?: string) => declared(project.sheet, "primary", theme)
      project.store.set([
        { name: "primary", theme: "default", value: "red" },
        { name: "primary", theme: "dark", value: "pink" }
      ])
      const edited = [seen(), seen("dark"), designs.doc.history().undo[0], designs.saver.hasUnsaved(), written.length]
      const listed = project.store.get()[0].values
      designs.doc.undo()
      const undone = [seen(), seen("dark"), designs.saver.hasUnsaved(), project.store.get()[0].values.default]
      designs.doc.redo()
      const redone = [seen(), project.store.previews().length]
      await designs.saver.flush()

      return { edited, listed, undone, redone, saved: [written, designs.saver.hasUnsaved()] }
    })

    expect(result.edited).toEqual(["red", "pink", "Edit primary", true, 0])
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
      const { designs, tokens: project } = open()
      project.store.set([{ name: "radius", theme: "dark", value: "1rem" }])
      const edited = declared(project.sheet, "radius", "dark")
      const previewed = project.store.previews()
      designs.doc.undo()

      return [
        edited,
        declared(project.sheet, "radius", "dark"),
        declared(project.sheet, "radius"),
        previewed,
        project.store.previews()
      ]
    })

    // The sheet measures the previewed rem against the frame's root (PAR-156), while the override keeps the value as
    // typed. Frames drawn elsewhere are sent no override for it any more, so they draw the compiled value.
    expect(result).toEqual([
      "calc(1 * var(--canvas-rem, 1rem))",
      "",
      "0.5rem",
      [{ name: "radius", theme: "dark", value: "1rem" }],
      []
    ])
  })

  it("shows unsaved edits in a guest loaded again, which then writes them", async () => {
    const result = await page.evaluate(async () => {
      // @ts-expect-error The bundle's global.
      const { open, guest, declared, written } = tokens
      written.length = 0
      const { designs, tokens: first } = open()
      first.store.set([{ name: "primary", theme: "default", value: "red" }])
      const again = guest(designs)
      const shown = declared(again.sheet, "primary")
      await designs.saver.flush()

      return [shown, written.length, designs.saver.hasUnsaved()]
    })

    expect(result).toEqual(["red", 1, false])
  })
})

describe("joining a live room", () => {
  it("shows the room's value over one the host saved, though it's the edit's original (PAR-1254)", async () => {
    const result = await page.evaluate(() => {
      // @ts-expect-error The bundle's global.
      const { open, guestSaved, declared } = tokens
      // The host saved red, then changed it back to black: the room's edit is black, its original black.
      const { designs, tokens: first } = open()
      first.store.set([{ name: "primary", theme: "default", value: "red" }])
      first.store.set([{ name: "primary", theme: "default", value: "black" }])
      const joined = guestSaved(designs, "red")

      return declared(joined.sheet, "primary")
    })

    expect(result).toBe("black")
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
