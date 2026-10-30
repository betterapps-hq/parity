import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App } from "./app.ts"

// docs/editor.md, The window: the page never scrolls (PAR-424). Only panels scroll, so the canvas stays where tldraw
// thinks it is and clicks land where they're aimed. `App.reset` also fails any test during which the page scrolled.

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterEach(() => app.reset())
afterAll(() => app.close())

/** Where the window's page is scrolled to, and whether anything makes it taller or wider than the window. */
const page = () =>
  app.page.evaluate(() => {
    const root = document.scrollingElement!
    return {
      top: root.scrollTop,
      left: root.scrollLeft,
      overflows: root.scrollHeight > root.clientHeight || root.scrollWidth > root.clientWidth
    }
  })
const still = { top: 0, left: 0, overflows: false }

/** How far the Layers panel is scrolled. */
const layersScroll = () =>
  app.page.evaluate(
    () => document.querySelector("[role=tree][aria-label=Layers]")!.closest("[role=tabpanel]")!.scrollTop
  )

describe("the window", () => {
  it("scrolls only Layers when what's focused is out of its view, so canvas clicks still land", async () => {
    // Members is the last screen Layers lists, so selecting one of its layers scrolls Layers down to it.
    await app.show("Members", 1)
    await app.selectLayer("Members", "ada")
    await expect.poll(layersScroll).toBeGreaterThan(0)
    expect(await page()).toEqual(still)
    // Back from Members' title, focus reaches the Screens heading's New screen button, scrolled out of view above.
    await app.selectDesign("Members")
    const scrolled = await layersScroll()
    const newScreen = app.page.getByRole("button", { name: "New screen" })
    for (
      let press = 0;
      press < 5 && !(await newScreen.evaluate((button) => button === document.activeElement));
      press++
    ) {
      await app.page.keyboard.press("Shift+Tab")
    }
    expect(await newScreen.evaluate((button) => button === document.activeElement)).toBe(true)
    await expect.poll(layersScroll).toBeLessThan(scrolled)
    expect(await page()).toEqual(still)
    // And on from the title, as the end-to-end suite first found it.
    await app.selectDesign("Members")
    for (let press = 0; press < 4; press++) await app.page.keyboard.press("Tab")
    await app.frames(2)
    expect(await page()).toEqual(still)
    // The canvas is where tldraw thinks it is: a click on a layer selects it.
    await app.selectLayer("Members", "lin")
  })
})
