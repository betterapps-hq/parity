import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App } from "./app.ts"

// docs/editor.md, The window: the page never scrolls (PAR-424). Only panels scroll, so the canvas stays where tldraw
// thinks it is and clicks land where they're aimed. `App.reset` also fails any test during which the page scrolled.

let app: App

beforeAll(async () => {
  app = await App.connect()
})

afterEach(() => app?.reset())

afterAll(() => app?.close())

/**
 * Where the window's page is scrolled to, and whether anything makes it taller or wider than the window. When something
 * does, `past` names the outermost elements reaching past the window, so a failure says what overflowed.
 */
const page = () =>
  app.page.evaluate(() => {
    const root = document.scrollingElement!
    const overflows = root.scrollHeight > root.clientHeight || root.scrollWidth > root.clientWidth
    const seen = { top: root.scrollTop, left: root.scrollLeft, overflows }

    if (!overflows) {
      return seen
    }

    const reachesPast = (element: Element) => {
      const { right, bottom } = element.getBoundingClientRect()

      return right > root.clientWidth + 0.5 || bottom > root.clientHeight + 0.5
    }

    const past = [...document.body.querySelectorAll("*")]
      .filter((element) => reachesPast(element) && !(element.parentElement && reachesPast(element.parentElement)))
      .slice(0, 5)
      .map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect()

        const name = `${element.tagName.toLowerCase()}${[...element.classList]
          .slice(0, 3)
          .map((name) => `.${name}`)
          .join("")}`

        return `${name} "${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40)}" at ${[x, y, width, height].map(Math.round).join(",")}`
      })

    return { ...seen, past }
  })

const still = { top: 0, left: 0, overflows: false }

/** How far the Layers panel is scrolled: its tree scrolls below the search (PAR-187). */
const layersScroll = () =>
  app.page.evaluate(() => document.querySelector("[role=tree][aria-label=Layers]")!.parentElement!.scrollTop)

describe("the window", () => {
  it("scrolls only Layers when what's focused is out of its view, so canvas clicks still land", async () => {
    // Members is the last screen Layers lists, so selecting one of its layers scrolls Layers down to it.
    await app.show("Members", 1)
    await app.selectLayer("Members", "ada")
    await expect.poll(layersScroll).toBeGreaterThan(0)
    expect(await page()).toEqual(still)
    // Back from Members' title, focus reaches the Layers panel, scrolled down to Members. The panel draws only the
    // rows in view (PAR-187), so what focus reaches there is the tree, or a control drawn in it.
    await app.selectDesign("Members")

    const inLayers = () =>
      app.page.evaluate(() => !!document.activeElement?.closest("[role=tabpanel]")?.querySelector("[role=tree]"))

    for (let press = 0; press < 5 && !(await inLayers()); press++) {
      await app.page.keyboard.press("Shift+Tab")
    }

    expect(await inLayers()).toBe(true)
    await app.frames(2)
    expect(await page()).toEqual(still)
    // And on from the title, as the end-to-end suite first found it.
    await app.selectDesign("Members")

    for (let press = 0; press < 4; press++) {
      await app.page.keyboard.press("Tab")
    }

    await app.frames(2)
    expect(await page()).toEqual(still)
    // The canvas is where tldraw thinks it is: a click on a layer selects it.
    await app.selectLayer("Members", "lin")
  })
})
