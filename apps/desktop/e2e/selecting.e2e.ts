import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { about, App, center } from "./app.ts"

// docs/editor.md, Selecting: finding a layer's DOM (CAN-45) and selecting what you point at (PAR-163). The run's copy of
// the example adds a Members design: three MemberRows, which take a member and render none of their other props, a
// fragment (Names) and a field around an input (Email), in a column.

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterEach(() => app.reset())
afterAll(() => app.close())

describe("a component that ignores its props", () => {
  it("is outlined when the pointer is over it", async () => {
    await app.show("Members", 1)
    const ada = await app.box("Members", "ada")
    await app.page.mouse.move(center(ada).x, center(ada).y, { steps: 4 })
    await expect.poll(() => app.hovered()).toBe("ada")
    await expect.poll(() => app.outlines()).toContainEqual(about(ada))
  })

  it("is selected by clicking it, with its outline, name, size and the inspector's note", async () => {
    await app.show("Members", 1)
    await app.selectLayer("Members", "ada")
    const ada = await app.box("Members", "ada")
    await expect.poll(() => app.outlines()).toContainEqual(about(ada))
    // At 100% the size is the layer's own, in the design's pixels, to a tenth.
    const px = (value: number) => String(Math.round(value * 10) / 10)
    await expect.poll(() => app.labels()).toEqual(["Ada Lovelace", `${px(ada.width)} × ${px(ada.height)}`])
    // The type checker reads whether a component takes `style`, which can take a while after the project opens.
    const note = app.page.getByText(/MemberRow doesn.t take a style, so the size and styles below don.t change it/)
    await expect.poll(() => note.isVisible(), { timeout: 45_000 }).toBe(true)
  })

  it("wraps in a layout from the inspector's note", async () => {
    await app.show("Members", 1)
    await app.selectLayer("Members", "ada")
    await app.page.getByRole("button", { name: /Wrap in layout/ }).click()
    const { node: wrapper } = await app.selection()
    expect(wrapper).not.toBe("ada")
    await expect.poll(() => app.children("Members", "page")).toEqual([wrapper, "lin", "grace", "names", "email"])
    expect(await app.children("Members", wrapper!)).toEqual(["ada"])
  })

  it("is dragged to reorder, with a copy where it would land", async () => {
    await app.show("Members", 1)
    await app.selectLayer("Members", "ada")
    const ada = await app.box("Members", "ada")
    const lin = await app.box("Members", "lin")
    // The layer itself is hidden while a copy shows where it would go. Names is a fragment, so it draws two elements.
    await app.drag(center(ada), { x: center(lin).x, y: lin.y + lin.height * 0.9 }, async () => {
      await expect
        .poll(() => app.drawn("Members", "page"))
        .toEqual(["hidden:ada", "lin", "copy", "grace", "names", "names", "email"])
    })
    await expect.poll(() => app.children("Members", "page")).toEqual(["lin", "ada", "grace", "names", "email"])
    expect((await app.selection()).node).toBe("ada")
    await app.page.keyboard.press("Control+z")
    await expect.poll(() => app.children("Members", "page")).toEqual(["ada", "lin", "grace", "names", "email"])
  })
})

describe("other layers found from React's tree", () => {
  it("outlines a field around its input, not the input its props reach", async () => {
    await app.show("Members", 1)
    const field = await app.box("Members", "email")
    const input = await app.page.evaluate(() => {
      const e2e = window.e2e!
      const { x, y, width, height } = e2e
        .frame(e2e.key("Members"))
        .shadowRoot!.querySelector("input[type=email]")!
        .getBoundingClientRect()
      return { x, y, width, height }
    })
    expect(input.height).toBeLessThan(field.height)
    await app.page.mouse.move(center(input).x, center(input).y, { steps: 4 })
    await expect.poll(() => app.hovered()).toBe("email")
    await expect.poll(() => app.outlines()).toContainEqual(about(field))
  })

  it("outlines a fragment around both of its elements", async () => {
    await app.show("Members", 1)
    const names = await app.box("Members", "names")
    const [name, role] = await app.boxes("Members", "names")
    // The box reaches from the name's line to the role's.
    expect(names.y).toBeCloseTo(name!.y, 0)
    expect(names.y + names.height).toBeCloseTo(role!.y + role!.height, 0)
    await app.page.mouse.move(center(role!).x, center(role!).y, { steps: 4 })
    await expect.poll(() => app.hovered()).toBe("names")
    await expect.poll(() => app.outlines()).toContainEqual(about(names))
  })
})

// Dashboard's Main column, its content, the stat cards' grid and two of the cards; Sign in's card and terms.
const [main, content, stats] = ["PuGkX", "AXqFW", "i59Du"]
const [revenue, users, issues, uptime] = ["VvlPt", "BtvqI", "HwbHH", "PJhCQ"]
const [brand, card, terms] = ["MekxR", "YYVJX", "f4cbn"]

const position = async (design: string) => (await app.designs()).find((other) => other.name === design)!.position

describe("selecting what you point at", () => {
  it("selects the top-level layer under the pointer with a click, and leaves the board where it was", async () => {
    await app.show("Dashboard", 0.5)
    const before = await position("Dashboard")
    await app.click(center(await app.box("Dashboard", users)))
    await expect.poll(async () => (await app.selection()).node).toBe(main)
    expect(await position("Dashboard")).toEqual(before)
  })

  it("goes a level deeper with each double-click, and to the deepest with Ctrl on a layer's edge", async () => {
    await app.show("Dashboard", 0.5)
    const box = await app.box("Dashboard", users)
    await app.click(center(box))
    await expect.poll(async () => (await app.selection()).node).toBe(main)
    // The stat card takes three double-clicks.
    for (const level of [content, stats, users]) {
      await app.page.mouse.dblclick(center(box).x, center(box).y)
      await expect.poll(async () => (await app.selection()).node).toBe(level)
    }
    await app.page.keyboard.press("Escape")
    await app.page.keyboard.press("Escape")
    await app.page.keyboard.press("Escape")
    await app.page.keyboard.press("Escape")
    // Above its header, where none of its own layers are, Ctrl-click selects the card itself.
    await app.click({ x: center(box).x, y: box.y + 3 }, ["Control"])
    await expect.poll(async () => (await app.selection()).node).toBe(users)
  })

  it("selects the board with a click on a frame's background", async () => {
    await app.show("Sign in", 0.5)
    const frame = await app.page.evaluate(() => {
      const e2e = window.e2e!
      const { x, y } = e2e.frame(e2e.key("Sign in")).getBoundingClientRect()
      return { x, y }
    })
    await app.click({ x: frame.x + 12, y: frame.y + 12 })
    await expect.poll(() => app.selection()).toEqual({ design: await app.key("Sign in") })
  })

  it("moves the board by its own background around the frames, and by its title", async () => {
    await app.show("Sign in", 0.5)
    const before = await position("Sign in")
    const around = await app.page.evaluate(() => {
      const e2e = window.e2e!
      const key = e2e.key("Sign in")
      const board = document.querySelector(`.container-view[data-design="${CSS.escape(key)}"]`)!.getBoundingClientRect()
      const frame = e2e.frame(key).getBoundingClientRect()
      return { x: (board.left + frame.left) / 2, y: frame.top + frame.height / 2 }
    })
    // 40 by 20 on screen is 80 by 40 on the page at half size, give or take what snapping to other designs adds.
    const moved = async () => {
      const now = await position("Sign in")
      return Math.abs(now.x - before.x - 80) <= 16 && Math.abs(now.y - before.y - 40) <= 16
    }
    await app.drag(around, { x: around.x + 40, y: around.y + 20 })
    await expect.poll(moved).toBe(true)
    await app.page.keyboard.press("Control+z")
    await expect.poll(() => position("Sign in")).toEqual(before)
    const title = (await app.page
      .locator(".design-title > div > button")
      .filter({ hasText: /^Sign in$/ })
      .boundingBox())!
    await app.drag(center(title), { x: center(title).x + 40, y: center(title).y + 20 })
    await expect.poll(moved).toBe(true)
  })

  it("selects the top-level layers a box from a frame's background touches, with tldraw's box drawn meanwhile", async () => {
    await app.show("Sign in", 0.5)
    const frame = await app.page.evaluate(() => {
      const e2e = window.e2e!
      const { x, y, height } = e2e.frame(e2e.key("Sign in")).getBoundingClientRect()
      return { x, y, height }
    })
    const target = await app.box("Sign in", card)
    // From the background below and left of everything, to the card's middle: the card and the terms, not the brand.
    const during = await app.drag({ x: frame.x + 12, y: frame.y + frame.height - 12 }, center(target), () =>
      app.page.evaluate(() => window.e2e!.session().editor!.getInstanceState().brush !== null)
    )
    expect(during).toBe(true)
    await expect.poll(async () => (await app.selection()).nodes).toEqual([card, terms])
    expect((await app.selection()).nodes).not.toContain(brand)
    expect(await app.page.evaluate(() => window.e2e!.session().editor!.getInstanceState().brush)).toBeNull()
  })

  it("selects the layers inside with Enter, and edits a text layer", async () => {
    await app.show("Dashboard", 0.5)
    await app.selectLayer("Dashboard", stats)
    await app.page.keyboard.press("Enter")
    await expect.poll(async () => (await app.selection()).nodes).toEqual([revenue, users, issues, uptime])
    await app.selectLayer("Dashboard", "FZvFw")
    await app.page.keyboard.press("Enter")
    await expect.poll(() => app.page.evaluate(() => window.e2e!.session().selection.getEditing()?.node)).toBe("FZvFw")
    await expect.poll(() => app.page.locator(".text-editor").count()).toBe(1)
  })

  it("moves a layer that isn't selected by dragging it, never the board", async () => {
    await app.show("Sign in", 0.5)
    const before = await position("Sign in")
    const from = await app.box("Sign in", terms)
    const above = await app.box("Sign in", card)
    await app.drag(center(from), { x: center(above).x, y: above.y + 4 })
    await expect.poll(() => app.children("Sign in", "hpbgZ")).toEqual([brand, terms, card])
    expect(await position("Sign in")).toEqual(before)
    expect((await app.selection()).node).toBe(terms)
  })

  it("moves a card Ctrl-dragged by its edge, rather than the column it's in", async () => {
    await app.show("Dashboard", 0.5)
    const from = await app.box("Dashboard", revenue)
    const past = await app.box("Dashboard", issues)
    await app.page.keyboard.down("Control")
    await app.drag({ x: center(from).x, y: from.y + 3 }, { x: past.x + past.width * 0.8, y: center(past).y })
    await app.page.keyboard.up("Control")
    await expect.poll(() => app.children("Dashboard", stats)).toEqual([users, issues, revenue, uptime])
  })

  it("outlines what a click would select in the frame under the pointer, in a design that isn't selected", async () => {
    // Dashboard's dark frame, beside its main one.
    await app.show("Dashboard", 0.5, users, "desktop-dark")
    expect((await app.selection()).design).toBeUndefined()
    const card = await app.box("Dashboard", users, "desktop-dark")
    await app.page.mouse.move(center(card).x, center(card).y, { steps: 4 })
    await expect.poll(() => app.hovered()).toBe(main)
    await expect.poll(() => app.outlines()).toContainEqual(about(await app.box("Dashboard", main, "desktop-dark")))
  })
})
