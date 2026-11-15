import { basename } from "node:path"
import { afterAll, beforeAll, describe, expect, inject, it } from "vite-plus/test"
import { App, settled } from "./app.ts"

// docs/editor.md, Opening and closing projects: closing a project gives back its canvas, however often it's opened
// again (PAR-422).

let app: App

beforeAll(async () => {
  app = await App.connect()
})

afterAll(() => app?.close())

const frames = () => app.page.locator("[data-frame]").count()

/**
 * The window's DOM nodes, once everything nothing holds is collected. What the page logged goes first: DevTools keeps
 * every element a console message names, which only matters while a debugger is attached, as it is here.
 */
async function nodes(): Promise<{ nodes: number; documents: number }> {
  const cdp = await app.page.context().newCDPSession(app.page)
  await cdp.send("Runtime.discardConsoleEntries")

  for (let pass = 0; pass < 3; pass++) {
    await cdp.send("HeapProfiler.collectGarbage")
  }

  const { nodes, documents } = await cdp.send("Memory.getDOMCounters")
  await cdp.detach()

  return { nodes, documents }
}

/**
 * Closes the tab from the keyboard. The browser keeps the element last pressed, here the tab's close button, whose
 * React props name the closed tab until the tab bar draws again, so a click would hold the last canvas for a while.
 */
async function closeProject(): Promise<void> {
  await app.page.keyboard.press("Control+W")
  await expect.poll(frames).toBe(0)
}

/** Opens the project again from Home, where it's the one to continue, and waits for every frame to draw. */
async function openProject(count: number): Promise<void> {
  await app.page.getByRole("button", { name: `Resume ${basename(inject("app").project)}` }).click()
  // Counted through a locator, which holds on to no element; a handle to one would keep its whole canvas.
  await expect.poll(frames, { timeout: 120_000 }).toBe(count)
  // Its frames finish drawing, and then its bitmaps are taken, before it closes.
  await app.page.evaluate(settled)
  await app.page.waitForTimeout(2000)
}

/** Opens the project again for the files after this one, unless it's open. */
async function restoreProject(count: number): Promise<void> {
  if ((await frames()) > 0) {
    return
  }

  // An open that failed leaves its tab, with an error and no frames, which hides the start page it opens from. Home
  // can't be closed, so only the tabs with a close button count.
  const tabs = app.page.getByRole("tab").filter({ has: app.page.getByRole("button", { name: /^Close / }) })

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
      // The nodes while it's open and after each close.
      const open: number[] = []
      const shut: number[] = []

      for (let round = 0; round < 3; round++) {
        await openProject(count)
        open.push((await nodes()).nodes)
        await closeProject()
        shut.push((await nodes()).nodes)
      }

      // tldraw sometimes keeps the editor closed last, with its canvas, until another replaces it (PAR-445). That's one
      // canvas however often the project opens, so it's allowed for: what's kept after the third close is the same as
      // after the first, and less than an open canvas and a half. A canvas kept on each reopen adds one each round. The
      // example's canvas is about 19,000 nodes since its boards gained the app's pages, components and stories, and a
      // closed one keeps about 16,000 of them. The documents say whether what's kept is a page's frame, each of which
      // is one.
      const after = await nodes()
      const canvas = open[0]! - closed.nodes
      const kept = after.nodes - closed.nodes
      const grew = after.nodes - shut[0]!

      const problems = [
        kept >= canvas * 1.5 && `kept ${kept} nodes, past an open canvas and a half (${canvas})`,
        grew >= 5000 && `kept ${grew} more nodes after the third close than after the first`
      ].filter((problem) => problem !== false)

      const said = `from ${closed.nodes}: ${open.map((nodes, round) => `${nodes} open, ${shut[round]} closed`).join("; ")}; documents ${closed.documents} to ${after.documents}`
      expect(problems.length === 0 ? [] : [...problems, said]).toEqual([])
    } finally {
      await restoreProject(count)
    }
  })
})
