import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { boardDormant } from "./frame-sleep.ts"

const at = { hidden: false, drawn: true, far: false, selected: false }

describe("boardDormant", () => {
  it("leaves a shown tab's boards awake up close", () => {
    expect(boardDormant(at)).toBe(false)
  })

  it("puts a shown tab's boards to sleep zoomed far out, except the selected one", () => {
    expect(boardDormant({ ...at, far: true })).toBe(true)
    expect(boardDormant({ ...at, far: true, selected: true })).toBe(false)
  })

  it("puts every board of a hidden tab to sleep, the selected one too, at any zoom", () => {
    expect(boardDormant({ ...at, hidden: true })).toBe(true)
    expect(boardDormant({ ...at, hidden: true, selected: true })).toBe(true)
    expect(boardDormant({ ...at, hidden: true, far: true, selected: true })).toBe(true)
  })

  it("keeps a hidden tab's board awake until it's been drawn, so its frames have a size to keep", () => {
    expect(boardDormant({ ...at, hidden: true, drawn: false })).toBe(false)
  })
})

// Frames wake on animation frames and React runs their effects as it does in the window, so these run in Chrome, on
// React's development build, which is what reports an update loop. They need Chrome installed.
let browser: Browser
let page: Page

/**
 * What the page loads: frames on a dormant board near the view, each with a bitmap to sleep on, that note each time
 * they wake (W) or fall asleep (S). Awake, a frame draws a design that takes a while, as a project's components do, so
 * the next frame wakes in the same render as the last one falls asleep, as it does in the window.
 */
const entry = `
import { createElement, StrictMode, useEffect, useRef } from "react"
import { createRoot } from "react-dom/client"
import { atom } from "tldraw"
import { useAwake } from "./frame-sleep.ts"

const rest = { dormant: atom("dormant", true), near: atom("near", true) }
const drawMs = 20
export const turns = {}
export const awake = {}
export const errors = []
const report = console.error
console.error = (...args) => {
  errors.push(String(args[0]))
  report(...args)
}

function Design() {
  const start = performance.now()
  while (performance.now() - start < drawMs);
  return null
}

function Frame({ id, shows }) {
  const now = useAwake(true, rest, shows)
  const was = useRef(now)
  useEffect(() => {
    awake[id] = now
    if (was.current === now) return
    was.current = now
    turns[id] = (turns[id] ?? "") + (now ? "W" : "S")
  }, [id, now])
  return now ? createElement(Design) : null
}

let root

/** Draws \`count\` frames that show \`shows\`. */
export function draw(count, shows) {
  root ??= createRoot(document.querySelector("#frames"))
  const frames = Array.from({ length: count }, (_, id) => createElement(Frame, { key: id, id, shows }))
  root.render(createElement(StrictMode, null, frames))
}

/** Forgets the turns so far. */
export function forget() {
  for (const id of Object.keys(turns)) delete turns[id]
  errors.length = 0
}

/** Takes every frame away. */
export function reset() {
  root?.unmount()
  root = undefined
  forget()
  for (const id of Object.keys(awake)) delete awake[id]
}
`

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))
  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "tsx", sourcefile: "entry.tsx" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "sleep",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"development"' }
  })
  browser = await chromium.launch({ channel: "chrome", headless: true })
  page = await browser.newPage()
  const failures: string[] = []
  page.on("pageerror", (error) => failures.push(error.message))
  await page.route("http://parity.test/sleep.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0]!.text })
  )
  await page.route("http://parity.test/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="frames"></div><script src="http://parity.test/sleep.js"></script>`
    })
  )
  await page.goto("http://parity.test/")
  // @ts-expect-error The bundle's global.
  if (!(await page.evaluate(() => typeof sleep === "object")))
    throw new Error(`The page didn't load: ${failures.join(",")}`)
}, 30_000)

afterAll(async () => {
  await browser?.close()
})

/**
 * Draws `count` frames showing `before` and lets them fall asleep, then has them show `after`, as a change to the
 * project's code does to every frame, and waits until they're all asleep again. Gives what each did meanwhile.
 */
async function change(count: number, before: string, after: string) {
  // @ts-expect-error The bundle's global.
  const asleep = (n: number) => Object.values(sleep.awake).filter((awake) => !awake).length === n
  await page.evaluate(
    // @ts-expect-error The bundle's global.
    ({ count, before }) => (sleep.reset(), sleep.draw(count, before)),
    { count, before }
  )
  await page.waitForFunction(asleep, count)
  await page.evaluate(
    // @ts-expect-error The bundle's global.
    ({ count, after }) => (sleep.forget(), sleep.draw(count, after)),
    { count, after }
  )
  // Every frame has woken and fallen asleep again; then a few more animation frames pass, for any turn after that.
  await page.waitForFunction(
    // @ts-expect-error The bundle's global.
    (n) => Object.keys(sleep.turns).length === n && Object.values(sleep.awake).every((awake) => !awake),
    count
  )
  await page.evaluate(() => new Promise((done) => setTimeout(done, 200)))
  return page.evaluate(() => ({
    // @ts-expect-error The bundle's global.
    turns: Object.values(sleep.turns) as string[],
    // @ts-expect-error The bundle's global.
    errors: sleep.errors as string[]
  }))
}

describe("useAwake", () => {
  it("wakes a dormant frame once when what it shows changes, then puts it back to sleep once", async () => {
    const { turns, errors } = await change(1, "revision 1", "revision 2")
    expect(turns).toEqual(["WS"])
    expect(errors).toEqual([])
  })

  it("wakes a whole project's frames through a change without hitting React's update limit (PAR-606)", async () => {
    const { turns, errors } = await change(64, "revision 3", "revision 4")
    expect(new Set(turns)).toEqual(new Set(["WS"]))
    expect(errors.filter((error) => error.includes("Maximum update depth"))).toEqual([])
  }, 30_000)
})
