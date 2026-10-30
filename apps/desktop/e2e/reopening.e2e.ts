import { basename } from "node:path"
import { afterAll, beforeAll, describe, expect, inject, it } from "vite-plus/test"
import { App, settled } from "./app.ts"

// docs/editor.md, Opening and closing projects: closing a project gives back its canvas, however often it's opened
// again (PAR-422).

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterAll(() => app.close())

const frames = () => app.page.locator("[data-frame]").count()

/**
 * The window's DOM nodes, once everything nothing holds is collected. What the page logged goes first: DevTools keeps
 * every element a console message names, which only matters while a debugger is attached, as it is here.
 */
async function nodes(): Promise<number> {
  const cdp = await app.page.context().newCDPSession(app.page)
  await cdp.send("Runtime.discardConsoleEntries")
  for (let pass = 0; pass < 3; pass++) await cdp.send("HeapProfiler.collectGarbage")
  const { nodes } = await cdp.send("Memory.getDOMCounters")
  await cdp.detach()
  return nodes
}

/**
 * Closes the tab from the keyboard. The browser keeps the element last pressed, here the tab's close button, whose
 * React props name the closed tab until the tab bar draws again, so a click would hold the last canvas for a while.
 */
async function closeProject(): Promise<void> {
  await app.page.keyboard.press("Control+W")
  await expect.poll(frames).toBe(0)
}

/** Opens the project again from the start page's recent projects, and waits for every frame to draw. */
async function openProject(count: number): Promise<void> {
  await app.page
    .getByText(basename(inject("app").project), { exact: false })
    .first()
    .click()
  // Counted through a locator, which holds on to no element; a handle to one would keep its whole canvas.
  await expect.poll(frames, { timeout: 120_000 }).toBe(count)
  // Its frames finish drawing, and then its bitmaps are taken, before it closes.
  await app.page.evaluate(settled)
  await app.page.waitForTimeout(2000)
}

/** Opens the project again for the files after this one, unless it's open. */
async function restoreProject(count: number): Promise<void> {
  if ((await frames()) > 0) return
  // An open that failed leaves its tab, with an error and no frames, which hides the start page it opens from.
  const tabs = app.page.getByRole("tab")
  for (let left = await tabs.count(); left > 0; left--) {
    await app.page.keyboard.press("Control+W")
    await expect.poll(() => tabs.count()).toBe(left - 1)
  }
  await openProject(count)
}

describe("closing a project", () => {
  it("gives back its canvas each time it's opened again", { timeout: 360_000 }, async () => {
    const count = await frames()
    expect(count).toBeGreaterThan(0)
    await closeProject()
    // The files after this one need the project open, so it opens again however this one ends.
    try {
      const closed = await nodes()
      for (let round = 0; round < 2; round++) {
        await openProject(count)
        await closeProject()
      }
      // A canvas kept in memory is every frame's elements, tens of thousands of nodes on the example project.
      expect(await nodes()).toBeLessThan(closed + 3000)
    } finally {
      await restoreProject(count)
    }
  })
})
