import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { type Browser, chromium, type Page } from "playwright-core"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test"

// An area built as a board's title is: a button that's a context menu's trigger and has a hint, and a dropdown menu
// beside it, both mounted only once the area is used. Base UI's menus open on real pointer and key events, so this
// renders them in Chrome. It needs Chrome installed.
let browser: Browser
let page: Page
const errors: string[] = []

const entry = `
import { createRoot } from "react-dom/client"
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, TooltipProvider
} from "@buildkitgg/shadcn-baseui-kit"
import { Hint } from "../chrome/Hint.tsx"
import { Used, useMountOnUse, useUsed } from "./mount-on-use.tsx"

function Title() {
  const used = useUsed()
  const button = <button type="button" tabIndex={-1}>Dashboard</button>
  if (!used) return button
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<Hint label="Dashboard, in app/page.tsx">{button}</Hint>} />
      <ContextMenuContent><ContextMenuItem>Rename</ContextMenuItem></ContextMenuContent>
    </ContextMenu>
  )
}

function Controls() {
  return useUsed() && (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="State">Default</DropdownMenuTrigger>
      <DropdownMenuContent><DropdownMenuItem>Hover</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu>
  )
}

function Area({ ready }) {
  const { used, area } = useMountOnUse(ready)
  return (
    <div id="area" style={{ position: "absolute", left: 100, top: 100, display: "flex", gap: 8 }} {...area}>
      <Used value={used}><Title /><Controls /></Used>
    </div>
  )
}

let root
export function mount(ready) {
  root?.unmount()
  root = createRoot(document.querySelector("#root"))
  root.render(<TooltipProvider><Area ready={ready} /></TooltipProvider>)
}
`

beforeAll(async () => {
  const canvas = fileURLToPath(new URL(".", import.meta.url))

  const bundle = await build({
    stdin: { contents: entry, resolveDir: canvas, loader: "tsx", sourcefile: "entry.tsx" },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "area",
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
  await page.setContent(`<body style="margin: 0"><div id="root"></div></body>`)
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
})

afterAll(async () => {
  await browser?.close()
})

/** Mounts the area, the pointer away from it. */
async function mount(ready = false) {
  errors.length = 0
  await page.mouse.move(700, 550)
  // @ts-expect-error The bundle's global.
  await page.evaluate((now) => area.mount(now), ready)
  await page.getByRole("button", { name: "Dashboard" }).waitFor()
}

const title = () => page.getByRole("button", { name: "Dashboard" })
const stateMenu = () => page.getByRole("button", { name: "State" })
const openMenus = () => page.getByRole("menu").count()

beforeEach(async () => {
  await mount()
})

describe("an area that mounts on use", { timeout: 20_000 }, () => {
  it("leaves its menus unmounted until it's used", async () => {
    expect(await stateMenu().count()).toBe(0)
    expect(await title().count()).toBe(1)
    expect(errors).toEqual([])
  })

  it("mounts them as the pointer enters, so a right-click there opens the context menu", async () => {
    const box = (await title().boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    expect(await stateMenu().count()).toBe(1)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" })
    await expect.poll(() => page.getByRole("menuitem", { name: "Rename" }).count()).toBe(1)
    expect(errors).toEqual([])
  })

  it("opens the context menu for a right-click that comes before any pointer move", async () => {
    // As a touch's long press or a screen reader's menu key might: no pointer over the area first.
    await title().evaluate((button) => {
      const { x, y } = button.getBoundingClientRect()
      button.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: x + 5, clientY: y + 5 })
      )
    })
    await expect.poll(() => page.getByRole("menuitem", { name: "Rename" }).count()).toBe(1)
    expect(await openMenus()).toBe(1)
    expect(errors).toEqual([])
  })

  it("keeps focus on what was focused, and its menus open from the keyboard", async () => {
    await title().focus()
    expect(await stateMenu().count()).toBe(1)
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Dashboard")
    await stateMenu().focus()
    await page.keyboard.press("Enter")
    await expect.poll(() => page.getByRole("menuitem", { name: "Hover" }).count()).toBe(1)
    expect(errors).toEqual([])
  })

  it("mounts them at once when it's ready, as a hovered or selected board is, and keeps them once used", async () => {
    await mount(true)
    expect(await stateMenu().count()).toBe(1)
    // Used by the pointer, then left: still mounted, so a menu open as the pointer leaves stays open.
    await mount()
    const box = (await title().boundingBox())!
    await page.mouse.move(box.x + 2, box.y + 2)
    await page.mouse.move(700, 550)
    expect(await stateMenu().count()).toBe(1)
  })
})
