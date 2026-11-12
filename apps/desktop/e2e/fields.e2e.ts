import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App } from "./app.ts"

// docs/editor.md, Fields: typing, stepping and scrubbing (CAN-48), in the inspector against the real stores and frames,
// on Pricing's Brand mark, 8 steps (32px) wide, as the hand check was.

let app: App

beforeAll(async () => {
  app = await App.connect()
})

afterEach(() => app?.reset())

afterAll(() => app?.close())

const brand = "aP9rK"
const plans = "Wre7g"

const width = () => app.page.locator('input[aria-label="Width"]').first()
const brandWidth = async () => (await app.style("Pricing", brand)).width
const drawnWidth = async () => (await app.size("Pricing", brand))?.width

async function selectBrand(): Promise<void> {
  await app.show("Pricing", 1, brand)
  await app.selectLayer("Pricing", brand)
  await expect.poll(() => width().inputValue()).toBe("32")
}

/** Focuses a field and selects its text, ready to type over it. */
async function typeOver(field: ReturnType<typeof width>, text: string): Promise<void> {
  await field.click()
  await field.press("ControlOrMeta+a")
  await field.pressSequentially(text, { delay: 20 })
}

describe("typing in a length field", () => {
  it("previews each keystroke on the canvas, and Enter makes it one undo step, leaving the field", async () => {
    await selectBrand()
    await width().click()
    await width().press("ControlOrMeta+a")

    for (const [key, shown] of [
      ["3", 3],
      ["2", 32],
      ["0", 320]
    ] as const) {
      await app.page.keyboard.press(key)
      // On the canvas at once, while the design is still as it was.
      await expect.poll(drawnWidth).toBe(shown)
      expect(await brandWidth()).toBe(8)
    }

    await width().press("Enter")
    await expect.poll(brandWidth).toBe(80)
    expect(await drawnWidth()).toBe(320)
    expect(await width().inputValue()).toBe("320")
    expect(await width().evaluate((input) => input === document.activeElement)).toBe(false)
    await app.page.keyboard.press("Control+z")
    await expect.poll(brandWidth).toBe(8)
  })

  it("reads px, and keeps a width off the spacing scale as it is", async () => {
    await selectBrand()
    await typeOver(width(), "16px")
    await width().press("Enter")
    await expect.poll(brandWidth).toBe(4)
    await typeOver(width(), "281")
    await width().press("Enter")
    await expect.poll(brandWidth).toBe(70.25)
    expect(await width().inputValue()).toBe("281")
  })

  it("keeps what it can't read, with the reason, and Escape puts the value back, then leaves", async () => {
    await selectBrand()
    await typeOver(width(), "abc")
    await width().press("Enter")
    await expect.poll(() => width().getAttribute("aria-invalid")).toBe("true")
    expect(await width().inputValue()).toBe("abc")
    expect(await width().evaluate((input) => input.getAttribute("aria-describedby"))).toBeTruthy()
    await expect.poll(() => app.page.getByText("Enter a length, Hug or Fill").count()).toBe(1)
    expect(await brandWidth()).toBe(8)
    await width().press("Escape")
    await expect.poll(() => width().inputValue()).toBe("32")
    expect(await width().evaluate((input) => input === document.activeElement)).toBe(true)
    await width().press("Escape")
    expect(await width().evaluate((input) => input === document.activeElement)).toBe(false)
  })

  it("keeps what's being typed when the value changes underneath", async () => {
    await selectBrand()
    await typeOver(width(), "12")
    // As an agent's edit would.
    await app.page.evaluate((brand) => {
      const e2e = window.e2e!
      e2e.session().store.updateContainer(e2e.key("Pricing"), "Agent", (container) => {
        const edit = (node: typeof container.root): typeof container.root => {
          if (node.id === brand) {
            return { ...node, style: { ...node.style, width: 10 } }
          }

          return node.type === "layout" ? { ...node, children: node.children.map(edit) } : node
        }

        return { ...container, root: edit(container.root) }
      })
    }, brand)
    await expect.poll(brandWidth).toBe(10)
    expect(await width().inputValue()).toBe("12")
    await width().press("Escape")
    await expect.poll(() => width().inputValue()).toBe("40")
  })
})

describe("stepping and scrubbing", () => {
  it("steps a length with Up and Down, ten with Shift, as one undo step however slowly (PAR-441)", async () => {
    await selectBrand()
    await width().click()

    // Each press is made at once, and the run is one undo step, with pauses longer than a second between presses.
    for (const [key, steps] of [
      ["ArrowUp", 9],
      ["Shift+ArrowUp", 19],
      ["ArrowDown", 18]
    ] as const) {
      await width().press(key)
      await expect.poll(brandWidth, { interval: 10 }).toBe(steps)
      await app.page.waitForTimeout(1200)
    }

    expect(await width().inputValue()).toBe("72")
    // Leaving keeps the run, and one Undo takes it all back.
    await width().press("Tab")
    await app.page.keyboard.press("Control+z")
    await expect.poll(brandWidth).toBe(8)
  })

  it("takes a run of Up and Down back on Escape, leaving nothing to undo (PAR-968)", async () => {
    await selectBrand()
    await width().click()
    await width().press("ArrowUp")
    await width().press("ArrowUp")
    await expect.poll(brandWidth).toBe(10)
    await width().press("Escape")
    await expect.poll(brandWidth).toBe(8)
    expect(await width().inputValue()).toBe("32")
    expect(await app.undoLabel()).toBeUndefined()
  })

  it("scrubs W a spacing step per two pixels, previewing on the canvas, and makes one undo step on release", async () => {
    await selectBrand()
    const label = app.page.getByText("W", { exact: true }).first()
    const box = (await label.boundingBox())!
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

    const during = await app.drag(from, { x: from.x + 20, y: from.y }, async () => ({
      drawn: await drawnWidth(),
      stored: await brandWidth()
    }))

    // Ten steps further on the canvas, with the design unchanged until the release.
    expect(during).toEqual({ drawn: 72, stored: 8 })
    await expect.poll(brandWidth).toBe(18)
    await app.page.keyboard.press("Control+z")
    await expect.poll(brandWidth).toBe(8)
  })

  it("puts a scrub back on Escape, making nothing (PAR-968)", async () => {
    await selectBrand()
    const label = app.page.getByText("W", { exact: true }).first()
    const box = (await label.boundingBox())!
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await app.page.mouse.move(from.x, from.y)
    await app.page.mouse.down()
    await app.page.mouse.move(from.x + 20, from.y, { steps: 5 })
    await expect.poll(drawnWidth).toBe(72)
    await app.page.keyboard.press("Escape")
    await expect.poll(drawnWidth).toBe(32)
    await app.page.mouse.up()
    expect(await brandWidth()).toBe(8)
    expect(await app.undoLabel()).toBeUndefined()
  })
})

describe("several layers", () => {
  it("shows Mixed, and gives each the value typed", async () => {
    await selectBrand()
    await app.toggleInLayers("Pricing", plans)
    await expect.poll(async () => (await app.selection()).nodes).toEqual([brand, plans])
    await expect.poll(() => width().getAttribute("placeholder")).toBe("Mixed")
    expect(await width().inputValue()).toBe("")
    expect(await app.page.getByText("Different across these layers").textContent()).toContain(
      "adds 8 to each layer's own value"
    )
    await typeOver(width(), "48")
    await width().press("Enter")
    await expect.poll(brandWidth).toBe(12)
    expect((await app.style("Pricing", plans)).width).toBe(12)
  })

  it("works +8 and Up out from each layer's own width, as one undo step each (PAR-968)", async () => {
    await selectBrand()
    await app.toggleInLayers("Pricing", plans)
    await expect.poll(() => width().getAttribute("placeholder")).toBe("Mixed")
    const plansWidth = async () => (await app.style("Pricing", plans)).width
    const before = await plansWidth()
    await typeOver(width(), "+8")
    await width().press("Enter")
    await expect.poll(brandWidth).toBe(10)
    expect(await plansWidth()).toBe(Number(before) + 2)
    await app.page.keyboard.press("Control+z")
    await expect.poll(brandWidth).toBe(8)
    await width().click()
    await width().press("ArrowUp")
    await expect.poll(brandWidth).toBe(9)
    expect(await plansWidth()).toBe(Number(before) + 1)
  })
})

describe("number props (PAR-203)", () => {
  // App sidebar's Seats bar, a nova/Progress whose value is 70.
  const seats = "LiOql"
  // Named by its row's label, the prop's name with a capital first letter.
  const valueField = () => app.page.getByRole("textbox", { name: "Value", exact: true })

  const storedValue = async () => {
    const node = await app.node("App sidebar", seats)

    return node?.type === "component" ? node.props?.value : undefined
  }

  /** The value the bar is drawn with, which the component sets on its progressbar. */
  const drawnValue = () =>
    app.page.evaluate((seats) => {
      const e2e = window.e2e!
      const element = window.e2eModules!.frames.findNodeElement(e2e.frame(e2e.key("App sidebar")), seats)
      const bar = element?.matches('[role="progressbar"]') ? element : element?.querySelector('[role="progressbar"]')

      return bar?.getAttribute("aria-valuenow")
    }, seats)

  async function selectSeats(): Promise<void> {
    await app.show("App sidebar", 1, seats)
    await app.selectLayer("App sidebar", seats)
    await expect.poll(() => valueField().inputValue()).toBe("70")
  }

  it("previews each keystroke on the canvas, and Enter makes it one undo step", async () => {
    await selectSeats()
    await valueField().click()
    await valueField().press("ControlOrMeta+a")

    for (const [key, shown] of [
      ["2", "2"],
      ["5", "25"]
    ] as const) {
      await app.page.keyboard.press(key)
      await expect.poll(drawnValue).toBe(shown)
    }

    await valueField().press("Enter")
    await expect.poll(storedValue).toBe(25)
    expect(await drawnValue()).toBe("25")
    await valueField().press("Escape")
    await app.page.keyboard.press("Control+z")
    await expect.poll(storedValue).toBe(70)
  })

  it("works maths out from the value as it was, and Escape takes the preview back, leaving nothing to undo", async () => {
    await selectSeats()
    const before = await app.undoLabel()
    await valueField().click()
    await valueField().press("ControlOrMeta+a")
    await valueField().pressSequentially("/2", { delay: 20 })
    await expect.poll(drawnValue).toBe("35")
    // 70 divided by 20, not the 35 the design holds while it's previewed.
    await valueField().pressSequentially("0", { delay: 20 })
    await expect.poll(drawnValue).toBe("3.5")
    await valueField().press("Escape")
    await expect.poll(drawnValue).toBe("70")
    expect(await storedValue()).toBe(70)
    expect(await app.undoLabel()).toBe(before)
  })
})
