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
    // The canvas is where tldraw thinks it is: a click on a layer selects it. Tabbing on can reach the next design on
    // Screens' canvas, which comes into view, so Members is brought back first.
    await app.show("Members", 1)
    await app.selectLayer("Members", "lin")
  })
  // docs/editor.md, The project's lenses (PAR-1243).
  it("opens the project on Screens in the lens shell, and empties the window when its tab closes", async () => {
    const { page } = app
    const lenses = page.getByRole("toolbar", { name: "Lenses" }).getByRole("button")
    const screens = page.getByRole("toolbar", { name: "Lenses" }).getByRole("button", { name: "Screens", exact: true })
    const layers = page.locator("[role=tree][aria-label=Layers]")
    const empty = page.getByText("No lens open")

    await expect
      .poll(() => lenses.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))))
      .toEqual(["Pages", "Screens", "Components", "Stories"])
    expect(await screens.getAttribute("aria-pressed")).toBe("true")

    try {
      // Clicking the lens in front hides the left panel, and again shows it.
      await screens.click()
      await expect.poll(() => layers.count()).toBe(0)
      await screens.click()
      await expect.poll(() => layers.count()).toBe(1)

      // Closing its tab, the last, empties the window, and the panels go with it.
      await page.getByRole("button", { name: "Close Screens" }).click()
      await expect.poll(() => empty.count()).toBe(1)
      expect(await layers.count()).toBe(0)
      expect(await page.locator(".container-view").count()).toBe(0)
    } finally {
      await showScreens()
    }

    expect(await empty.count()).toBe(0)
    await expect.poll(() => page.locator(".container-view").count()).toBeGreaterThan(0)
  })

  // docs/editor.md, Pages, a lens of its own (PAR-1244).
  it("draws the app's pages on Pages' canvas alone, keeping its camera when Screens takes its tab and gives it back", async () => {
    const { page } = app

    const pages = await designsIn("(pages)")
    expect(pages.length).toBeGreaterThan(0)
    // Screens draws none of them.
    expect((await drawn()).filter((key) => pages.includes(key))).toEqual([])

    try {
      // Ctrl+1 shows Pages in Screens' place, drawing the pages and nothing else.
      await page.keyboard.press("Control+1")
      await expect.poll(async () => (await drawn()).toSorted()).toEqual(pages.toSorted())
      // In place, as a link opens: one tab, Pages.
      expect(await page.locator(".dv-tab").allTextContents()).toEqual(["Pages"])
      expect(await page.locator("[role=tree][aria-label=Layers]").getByText("Screens", { exact: true }).count()).toBe(0)

      // Moved, then left for Screens and shown again, it's where it was.
      await page.evaluate(() => {
        window.e2e!.session().editor!.setCamera({ x: 120, y: 80, z: 0.2 }, { immediate: true })
      })
      await page.keyboard.press("Control+2")
      await expect.poll(async () => (await drawn()).some((key) => pages.includes(key))).toBe(false)
      await page.keyboard.press("Control+1")
      await expect.poll(async () => (await drawn()).length).toBe(pages.length)
      const { x, y, z } = await app.camera()
      expect({ x: Math.round(x), y: Math.round(y), z: Math.round(z * 100) / 100 }).toEqual({ x: 120, y: 80, z: 0.2 })
    } finally {
      await showScreens()
    }
  })

  // docs/editor.md, Stories, a lens of its own (PAR-1246).
  it("draws the story files on Stories' canvas alone, listing them in its Layers, and keeps its camera", async () => {
    const { page } = app
    const stories = await designsIn("(stories)")
    const layers = page.locator("[role=tree][aria-label=Layers]")

    expect(stories.length).toBeGreaterThan(0)
    // Screens draws none of them.
    expect((await drawn()).filter((key) => stories.includes(key))).toEqual([])

    try {
      // Ctrl+4 shows Stories in Screens' place, drawing the story files and nothing else.
      await page.keyboard.press("Control+4")
      await expect.poll(async () => (await drawn()).toSorted()).toEqual(stories.toSorted())
      expect(await page.locator(".dv-tab").allTextContents()).toEqual(["Stories"])
      // Its Layers lists the story files, without Screens' groups.
      expect(await layers.getByText("Screens", { exact: true }).count()).toBe(0)
      expect(await layers.getByText("Components", { exact: true }).count()).toBe(0)

      // Moved, then left for Screens and shown again, it's where it was.
      await page.evaluate(() => {
        window.e2e!.session().editor!.setCamera({ x: -90, y: 40, z: 0.3 }, { immediate: true })
      })
      await page.keyboard.press("Control+2")
      await expect.poll(async () => (await drawn()).some((key) => stories.includes(key))).toBe(false)
      await page.keyboard.press("Control+4")
      await expect.poll(async () => (await drawn()).length).toBe(stories.length)
      const { x, y, z } = await app.camera()
      expect({ x: Math.round(x), y: Math.round(y), z: Math.round(z * 100) / 100 }).toEqual({ x: -90, y: 40, z: 0.3 })
    } finally {
      await showScreens()
    }
  })

  // docs/editor.md, Screens, holding only designs (PAR-1251).
  it("holds none of Screens' frames while Pages shows in its place, and draws them again with Screens", async () => {
    const { page } = app
    const screens = await drawn()

    const framesOf = (keys: string[]) =>
      page.evaluate(
        (wanted) =>
          [...document.querySelectorAll<HTMLElement>(".container-view[data-design]")]
            .filter((board) => wanted.includes(board.dataset.design!))
            .reduce((count, board) => count + board.querySelectorAll("[data-frame]").length, 0),
        keys
      )

    expect(screens.some((key) => /^\((pages|components|stories)\)#/.test(key))).toBe(false)
    await expect.poll(() => framesOf(screens)).toBeGreaterThan(0)

    try {
      await page.keyboard.press("Control+1")
      await expect.poll(() => framesOf(screens)).toBe(0)
    } finally {
      await showScreens()
    }

    await expect.poll(() => framesOf(screens)).toBeGreaterThan(0)
  })

  // docs/editor.md, Components, a lens of its own (PAR-1245).
  it("draws the boards on Components' canvas alone, and keeps its camera when Screens takes its tab and gives it back", async () => {
    const { page } = app
    const boards = await designsIn("(components)")
    const layers = page.locator("[role=tree][aria-label=Layers]")

    expect(boards.length).toBeGreaterThan(0)
    // Screens draws none of them.
    expect((await drawn()).filter((key) => boards.includes(key))).toEqual([])

    try {
      // Ctrl+3 shows Components in Screens' place, drawing the boards and nothing else, and Layers lists them alone.
      await page.keyboard.press("Control+3")
      await expect.poll(async () => (await drawn()).toSorted()).toEqual(boards.toSorted())
      expect(await page.locator(".dv-tab").allTextContents()).toEqual(["Components"])
      expect(await layers.getByText("Screens", { exact: true }).count()).toBe(0)

      // Moved, then left for Screens and shown again, it's where it was.
      await page.evaluate(() => {
        window.e2e!.session().editor!.setCamera({ x: 60, y: -30, z: 0.5 }, { immediate: true })
      })
      await page.keyboard.press("Control+2")
      await expect.poll(async () => (await drawn()).some((key) => boards.includes(key))).toBe(false)
      await page.keyboard.press("Control+3")
      await expect.poll(async () => (await drawn()).length).toBe(boards.length)
      const { x, y, z } = await app.camera()
      expect({ x: Math.round(x), y: Math.round(y), z: Math.round(z * 100) / 100 }).toEqual({ x: 60, y: -30, z: 0.5 })
    } finally {
      await showScreens()
    }
  })

  // docs/editor.md, Pages, a lens of its own (PAR-1244).
  it("shows Pages in Screens' place for a page selected elsewhere, and Ctrl+A there selects only the pages", async () => {
    const { page } = app

    const pages = await designsIn("(pages)")

    try {
      // Selected as Search selects it, with Screens in front.
      await page.evaluate((key) => window.e2e!.session().selection.set({ design: key }), pages[0]!)
      await expect.poll(() => page.locator(".dv-tab").allTextContents()).toEqual(["Pages"])
      await expect.poll(async () => (await app.selection()).design).toBe(pages[0])

      await page.keyboard.press("Control+a")
      await expect.poll(async () => ((await app.selection()).designs ?? []).toSorted()).toEqual(pages.toSorted())

      // Back on Screens with the pages still selected, picking a tool leaves Screens in front.
      await page.keyboard.press("Control+2")
      await expect.poll(() => page.locator(".dv-tab").allTextContents()).toEqual(["Screens"])
      await page.keyboard.press("h")
      await app.frames(4)
      expect(await page.locator(".dv-tab").allTextContents()).toEqual(["Screens"])
      await page.keyboard.press("v")
    } finally {
      await page.keyboard.press("Escape")
      await showScreens()
    }
  })

  // docs/editor.md, Pages, a lens of its own (PAR-1244).
  it("shows Screens with its Components tab for Show Components asked for on Pages, whose panel has only Layers", async () => {
    const { page } = app

    try {
      await page.keyboard.press("Control+1")
      await expect.poll(() => page.locator(".dv-tab").allTextContents()).toEqual(["Pages"])

      await page.keyboard.press("Alt+2")
      await expect.poll(() => page.locator(".dv-tab").allTextContents()).toEqual(["Screens"])
      await expect.poll(() => page.getByRole("tab", { name: "Components", selected: true }).count()).toBe(1)
    } finally {
      await page.keyboard.press("Alt+1")
      await showScreens()
    }
  })
})

/** The keys of the designs in one of the project's generated files, such as `(pages)`. */
function designsIn(file: string): Promise<string[]> {
  return app.page.evaluate(
    (wanted) =>
      [...window.e2e!.session().doc.files()].flatMap(([path, canvas]) =>
        path === wanted ? canvas.containers.map((container) => `${path}#${container.id}`) : []
      ),
    file
  )
}

/** The keys of the boards the canvas in focus draws. */
function drawn(): Promise<string[]> {
  return app.page.evaluate(() =>
    window
      .e2e!.session()
      .editor!.getCurrentPageShapes()
      .flatMap((board) => (board.type === "canvas-container" ? [String(board.props.key)] : []))
  )
}

/** Screens back in front, with its canvas and panels, as the tests after these need. */
async function showScreens(): Promise<void> {
  await app.page.keyboard.press("Control+2")
  await expect.poll(() => app.page.locator("[role=tree][aria-label=Layers]").count()).toBe(1)
  await expect
    .poll(() => app.page.evaluate(() => !!window.e2e!.session().editor?.getCurrentPageShapes().length))
    .toBe(true)
}
