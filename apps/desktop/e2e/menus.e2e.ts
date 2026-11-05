import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App, center } from "./app.ts"

// docs/editor.md, Selecting: right-click menus (PAR-168), with the system's own right button and the stand-in
// clipboard.

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterEach(() => app?.reset())
afterAll(() => app?.close())

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

  it("undoes with Ctrl+Z pressed while the menu is still closing", async () => {
    await app.show("Members", 1)
    await app.rightClick(center(await app.box("Members", "ada")))
    await menu()
      .getByRole("menuitem", { name: /^Duplicate/ })
      .click()
    // At once, while the menu plays its closing animation and still has focus (PAR-424). The canvas's own listener comes
    // first and stops the key, so where focus is gets read just before it rather than as it arrives.
    const focusIn = await app.page.evaluate(() => {
      const menu = document.activeElement?.closest("[role=menu]")
      if (!menu) return "outside a menu"
      return menu.hasAttribute("data-closed") ? "closed" : "open"
    })
    await app.page.keyboard.press("Control+z")
    expect(focusIn).toBe("closed")
    await closed()
    await expect.poll(() => app.children("Members", "page")).toEqual(["ada", "lin", "grace", "names", "email"])
    expect(await app.undoLabel()).toBeUndefined()
  })

  it("opens again at the new point when right-clicked while it's open, as Figma does", async () => {
    await app.show("Members", 1)
    const ada = await app.box("Members", "ada")
    const first = { x: ada.x + ada.width * 0.6, y: center(ada).y }
    await app.rightClick(first)
    await expect.poll(() => menu().count()).toBe(1)
    const opened = (await menu().boundingBox())!
    // The next row, further left, clear of the menu, which opens right of the pointer and below it: the press reaches
    // the canvas, rather than only closing the menu.
    const lin = await app.box("Members", "lin")
    const second = { x: lin.x + lin.width * 0.1, y: center(lin).y }
    expect(second.x).toBeLessThan(opened.x)
    await app.rightClick(second)
    await expect.poll(async () => (await app.selection()).node).toBe("lin")
    // It moved as far as the pointer did, and there's still the one menu.
    const moved = async () => Math.abs(((await menu().boundingBox())?.x ?? Infinity) - opened.x - (second.x - first.x))
    await expect.poll(moved).toBeLessThan(2)
    expect(await menu().count()).toBe(1)
    // It acts on what that right-click selected.
    await menu()
      .getByRole("menuitem", { name: /^Duplicate/ })
      .click()
    await expect
      .poll(() => app.children("Members", "page"))
      .toEqual(["ada", "lin", expect.any(String), "grace", "names", "email"])
    await closed()
  })

  it("greys out in the menubar what can't act on a layer inside an instance, as the canvas menu does", async () => {
    await app.show("Dashboard", 0.5)
    // Ctrl and a click select the deepest layer under the pointer: the Users card's value, inside the instance.
    await app.click(center(await app.box("Dashboard", "BtvqI/BSm2g")), ["Control"])
    await expect.poll(async () => (await app.selection()).node).toMatch(/^BtvqI\//)
    const unavailable = async (menuName: string, items: RegExp[]) => {
      await app.page.getByRole("menubar", { name: "Application" }).getByRole("menuitem", { name: menuName }).click()
      const open = app.page.getByRole("menu")
      await expect.poll(() => open.count()).toBe(1)
      const states: (string | null)[] = []
      for (const item of items) {
        states.push(await open.getByRole("menuitem").filter({ hasText: item }).getAttribute("aria-disabled"))
      }
      await app.page.keyboard.press("Escape")
      await closed()
      return states
    }
    const edit = [/^\s*Copy\s*Ctrl/, /^\s*Duplicate/, /^\s*Paste over selection/, /^\s*Paste to replace/]
    expect(await unavailable("Edit", edit)).toEqual(["true", "true", null, null])
    const object = [
      /Wrap in layout/,
      /Bring forward/,
      /Send backward/,
      /Bring to front/,
      /Send to back/,
      /Hide or show/
    ]
    expect(await unavailable("Object", object)).toEqual(object.map(() => "true"))
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
