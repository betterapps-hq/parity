import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App } from "./app.ts"

// docs/editor.md, Fields: typing, stepping and scrubbing (CAN-48), in the inspector against the real stores and frames,
// on Pricing's Brand mark, 8 steps (32px) wide, as the hand check was.

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterEach(() => app.reset())
afterAll(() => app.close())

const brand = "aP9rK"
const plans = "Wre7g"

const width = () => app.page.locator('input[aria-label="Width"]')
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
  it("previews each keystroke on the canvas, and Enter makes it one undo step, keeping the field", async () => {
    await selectBrand()
    await width().click()
    await width().press("ControlOrMeta+a")
    for (const [key, shown] of [
      ["3", 4],
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
    expect(await width().evaluate((input) => input === document.activeElement)).toBe(true)
    expect(
      await width().evaluate(
        (input) =>
          input instanceof HTMLInputElement && input.selectionStart === 0 && input.selectionEnd === input.value.length
      )
    ).toBe(true)
    await width().press("Escape")
    await app.page.keyboard.press("Control+z")
    await expect.poll(brandWidth).toBe(8)
  })

  it("reads px, and lands an off-scale length on the nearest step with a note", async () => {
    await selectBrand()
    await typeOver(width(), "16px")
    await width().press("Enter")
    await expect.poll(brandWidth).toBe(4)
    await typeOver(width(), "281")
    await width().press("Enter")
    await expect.poll(brandWidth).toBe(70.5)
    expect(await width().inputValue()).toBe("282")
    await expect.poll(() => app.page.getByRole("status").filter({ hasText: "Snapped to 282px" }).count()).toBe(1)
  })

  it("keeps what it can't read, with the reason, and Escape puts the value back", async () => {
    await selectBrand()
    await typeOver(width(), "abc")
    await width().press("Enter")
    await expect.poll(() => width().getAttribute("aria-invalid")).toBe("true")
    expect(await width().inputValue()).toBe("abc")
    await expect.poll(() => app.page.getByRole("alert").filter({ hasText: `Can't read "abc"` }).count()).toBe(1)
    expect(await brandWidth()).toBe(8)
    await width().press("Escape")
    await expect.poll(() => width().inputValue()).toBe("32")
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
          if (node.id === brand) return { ...node, style: { ...node.style, width: 10 } }
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
  it("steps a length with Up and Down, ten with Shift, as one undo step", async () => {
    await selectBrand()
    await width().click()
    // Each press is made at once; a press less than a second after the one before joins its undo step.
    const presses: number[] = []
    for (const [key, steps] of [
      ["ArrowUp", 9],
      ["Shift+ArrowUp", 19],
      ["ArrowDown", 18]
    ] as const) {
      presses.push(Date.now())
      await width().press(key)
      await expect.poll(brandWidth, { interval: 10 }).toBe(steps)
    }
    for (let press = 1; press < presses.length; press++) {
      expect(presses[press]! - presses[press - 1]!).toBeLessThan(1000)
    }
    expect(await width().inputValue()).toBe("72")
    await width().press("Escape")
    await app.page.keyboard.press("Control+z")
    await expect.poll(brandWidth).toBe(8)
  })

  it("works maths out in Opacity, where % is the unit", async () => {
    await selectBrand()
    const opacity = app.page.locator('input[aria-label="Opacity"]')
    await typeOver(opacity, "50-10")
    await opacity.press("Enter")
    await expect.poll(async () => (await app.style("Pricing", brand)).opacity).toBe(40)
  })

  it("scrubs the Width label a step per 2px, previewing, and makes one undo step on release", async () => {
    await selectBrand()
    const label = app.page.getByText("Width", { exact: true }).first()
    const box = (await label.boundingBox())!
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const during = await app.drag(from, { x: from.x + 20, y: from.y }, async () => ({
      drawn: await drawnWidth(),
      stored: await brandWidth(),
      shown: await width().inputValue()
    }))
    // Ten steps further, on the canvas and in the field, with the design unchanged until the release.
    expect(during).toEqual({ drawn: 72, stored: 8, shown: "72" })
    await expect.poll(brandWidth).toBe(18)
    await app.page.keyboard.press("Control+z")
    await expect.poll(brandWidth).toBe(8)
  })
})

describe("several layers", () => {
  it("adds 8px to each with Mixed+8", async () => {
    await selectBrand()
    await app.toggleInLayers("Pricing", plans)
    await expect.poll(async () => (await app.selection()).nodes).toEqual([brand, plans])
    await expect.poll(() => width().inputValue()).toBe("Mixed")
    await width().click()
    await width().press("End")
    await width().pressSequentially("+8", { delay: 20 })
    await width().press("Enter")
    await expect.poll(brandWidth).toBe(10)
    expect((await app.style("Pricing", plans)).width).toBe(302)
  })
})
