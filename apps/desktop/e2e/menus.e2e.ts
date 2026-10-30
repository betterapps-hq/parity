import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { App, center } from "./app.ts"

// docs/editor.md, Selecting: right-click menus (PAR-168), with the system's own right button and the stand-in
// clipboard.

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterEach(() => app.reset())
afterAll(() => app.close())

const menu = () => app.page.getByRole("menu", { name: "Canvas" })
const normalized = (texts: string[]) => texts.map((text) => text.replace(/\s+/g, " ").trim())

/** Waits for every menu to close, once it has played its closing animation. */
async function closed(): Promise<void> {
  await expect.poll(() => app.page.getByRole("menu").count()).toBe(0)
}

/** The open menu's items, each its label and then its keys. */
async function items(): Promise<string[]> {
  await expect.poll(() => menu().getByRole("menuitem").count()).toBeGreaterThan(0)
  return normalized(await menu().getByRole("menuitem").allInnerTexts())
}

describe("right-click menus", () => {
  it("selects the layer a click would, and lists what can be done to it with the menubar's keys", async () => {
    // Members' first row, a MemberRow that ignores its props.
    await app.show("Members", 1)
    await app.rightClick(center(await app.box("Members", "ada")))
    await expect.poll(async () => (await app.selection()).node).toBe("ada")
    expect(await items()).toEqual([
      "Select layer",
      "Copy Ctrl+C",
      "Paste here",
      "Paste over selection Ctrl+Shift+V",
      "Paste to replace Ctrl+Shift+R",
      "Duplicate Ctrl+D",
      "Bring to front Ctrl+Shift+]",
      "Bring forward Ctrl+]",
      "Send backward Ctrl+[",
      "Send to back Ctrl+Shift+[",
      "Wrap in layout Ctrl+G",
      "Make component Ctrl+Alt+K",
      "Hide Ctrl+Shift+H"
    ])
    expect(await menu().getByRole("separator").count()).toBe(4)
    // Its items run the menubar's commands.
    await menu()
      .getByRole("menuitem", { name: /^Duplicate/ })
      .click()
    await expect.poll(() => app.children("Members", "page")).toHaveLength(6)
    await closed()
    expect(await app.undoLabel()).toBe("Duplicate layer")
  })

  it("picks a deeper layer under the pointer from Select layer", async () => {
    // A right-click on a stat card selects Main, the column it's in, as a click would; Select layer reaches the card.
    await app.show("Dashboard", 0.5)
    await app.rightClick(center(await app.box("Dashboard", "BtvqI")))
    await expect.poll(async () => (await app.selection()).node).toBe("PuGkX")
    await menu().getByRole("menuitem", { name: "Select layer" }).click()
    const layers = app.page.getByRole("menu", { name: "Select layer" })
    await expect.poll(() => layers.getByRole("menuitem").count()).toBeGreaterThan(5)
    const names = normalized(await layers.getByRole("menuitem").allInnerTexts())
    expect(names.slice(0, 5)).toEqual(["Dashboard", "Main", "Content", "Stats", "Users card"])
    // The selected layer has the check.
    const checked = layers.getByRole("menuitem").filter({ has: app.page.getByLabel("Selected") })
    expect(normalized(await checked.allInnerTexts())).toEqual(["Main"])
    await layers.getByRole("menuitem", { name: "Users card" }).click()
    await expect.poll(async () => (await app.selection()).node).toBe("BtvqI")
    await closed()
  })

  it("pastes into the layout under the pointer, at the slot there, with Paste here", async () => {
    // Pricing's Hero: a badge, the headline, the lede and the billing period, in a column.
    const hero = "t3Reo"
    const [badge, headline, lede, billing] = ["P07mQ", "crd2J", "so61t", "UKxSY"]
    await app.show("Pricing", 0.5, hero)
    await app.selectLayer("Pricing", headline)
    await app.page.keyboard.press("Control+c")
    await expect.poll(() => app.clipboard()).toContain('"parity":"clipboard"')
    const below = await app.box("Pricing", lede)
    // In the gap between the lede and the billing period.
    await app.rightClick({ x: center(below).x, y: below.y + below.height + 4 })
    await expect.poll(async () => (await app.selection()).node).toBe(hero)
    await menu().getByRole("menuitem", { name: "Paste here" }).click()
    await expect.poll(async () => (await app.children("Pricing", hero)).length).toBe(5)
    const copy = (await app.selection()).node!
    expect(await app.children("Pricing", hero)).toEqual([badge, headline, lede, copy, billing])
    // The headline itself, under its own id.
    expect({ ...(await app.node("Pricing", copy)), id: headline }).toEqual(await app.node("Pricing", headline))
    expect(await app.undoLabel()).toBe("Paste layer here")
    await closed()
    await app.page.keyboard.press("Control+z")
    await expect.poll(() => app.children("Pricing", hero)).toEqual([badge, headline, lede, billing])
  })

  it("opens no menu in Interact mode, where the design gets the right-click", async () => {
    await app.show("Sign in", 0.5)
    await app.selectDesign("Sign in")
    await app.page.keyboard.press("i")
    await expect.poll(() => app.tool()).toBe("interact")
    // Count the right-clicks that reach the design's own DOM.
    await app.page.evaluate(() => {
      const e2e = window.e2e!
      const host = e2e.frame(e2e.key("Sign in"))
      host.dataset.e2eMenus = "0"
      host.shadowRoot!.addEventListener("contextmenu", () => {
        host.dataset.e2eMenus = String(Number(host.dataset.e2eMenus) + 1)
      })
    })
    await app.rightClick(center(await app.box("Sign in", "YYVJX")))
    await expect
      .poll(() =>
        app.page.evaluate(() => {
          const e2e = window.e2e!
          return e2e.frame(e2e.key("Sign in")).dataset.e2eMenus
        })
      )
      .toBe("1")
    await app.frames(10)
    expect(await app.page.getByRole("menu").count()).toBe(0)
  })
})
