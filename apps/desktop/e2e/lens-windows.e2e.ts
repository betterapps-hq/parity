import type { Page } from "playwright-core"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App, until } from "./app.ts"

// docs/editor.md, Lens windows (PAR-1247): a lens moved to a window of its own keeps working there. Screens, with the
// canvas, is moved out at the start and back at the end, so the files after this one find the window as it opened.

let app: App
let lensWindow: Page

/** The lens window that's open, once it has drawn its group. */
async function openedLensWindow(): Promise<Page> {
  let found: Page | undefined

  await until(async () => {
    found = app.page
      .context()
      .pages()
      .find((page) => page.url().includes("/lenses/popout/popout.html"))

    return !!found && (await found.locator(".dv-tab").count()) > 0
  }, 15_000)

  if (!found) {
    throw new Error("Screens' own window didn't open")
  }

  return found
}

/** How many sheets each frame in a window has, as the browser draws them rather than as code reads them back. */
const drawnSheets = () => {
  const adopted = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, "adoptedStyleSheets")
  const frames = [...document.querySelectorAll("[data-frame]")].flatMap((host) => host.shadowRoot ?? [])

  // SAFETY: the browser's own getter, which gives a shadow root's adopted sheets.
  return frames.map((root) => ((adopted?.get?.call(root) ?? []) as CSSStyleSheet[]).length)
}

beforeAll(async () => {
  app = await App.connect()
  await app.page.getByRole("button", { name: "Move to new window" }).first().click()
  lensWindow = await openedLensWindow()
})

afterEach(async () => {
  await lensWindow.keyboard.press("Escape")
  await app?.reset()
})

afterAll(async () => {
  if (lensWindow && !lensWindow.isClosed()) {
    await lensWindow.getByRole("button", { name: "Move to main window" }).click()
    await until(async () => (await app.page.locator(".dv-tab").allTextContents()).includes("Screens"), 10_000)
  }

  await app?.close()
})

describe("a lens's own window", () => {
  it("is named for its lens and the project, in its title bar too", async () => {
    const project = await app.page.evaluate(() => window.e2e!.session().info.name)

    expect(await lensWindow.title()).toBe(`Screens — ${project}`)
    expect(await lensWindow.locator("[data-lens-title-bar]").textContent()).toBe(`Screens — ${project}`)
    expect(await app.page.locator(".dv-tab").allTextContents()).toEqual([])
  })

  it("draws its designs with their stylesheets", async () => {
    const sheets = await lensWindow.evaluate(drawnSheets)

    expect(sheets.length).toBeGreaterThan(0)
    expect(sheets.every((count) => count > 0)).toBe(true)
  })

  it("takes the app's shortcuts", async () => {
    await lensWindow.bringToFront()
    await lensWindow
      .locator(".tl-container")
      .first()
      .click({ position: { x: 20, y: 20 } })
    await lensWindow.keyboard.press("Control+a")

    await expect.poll(async () => ((await app.selection()).designs ?? []).length).toBeGreaterThan(0)
  })

  it("shows the canvas's menu in its own document", async () => {
    await lensWindow
      .locator(".tl-container")
      .first()
      .click({ position: { x: 20, y: 20 }, button: "right" })

    await expect.poll(() => lensWindow.locator("[role=menu]").count()).toBe(1)
    expect(await app.page.locator("[role=menu]").count()).toBe(0)
  })

  it("takes the app's theme as it changes", async () => {
    const theme = () => lensWindow.evaluate(() => document.documentElement.classList.contains("dark"))
    const before = await theme()

    try {
      await app.page.evaluate(() => document.documentElement.classList.toggle("dark"))
      await expect.poll(theme).toBe(!before)
    } finally {
      await app.page.evaluate(() => document.documentElement.classList.toggle("dark"))
    }

    await expect.poll(theme).toBe(before)
  })
})
