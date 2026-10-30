import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { about, App, type Box, center } from "./app.ts"

// docs/editor.md, Text: editing text in place, and auto width, auto height and fixed text (PAR-175). On Pricing's
// subtitle, "Start free, then upgrade…", which wraps onto two lines at 560px, centred under the heading, and its FAQ
// heading, "Questions, answered".

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterEach(() => app.reset())
afterAll(() => app.close())

const subtitle = "so61t"
const title = "crd2J"
const heading = "Kr88n"
const original =
  "Start free, then upgrade when you need more seats, history and control. Every plan includes unlimited viewers."

const editor = () => app.page.getByRole("textbox", { name: "Edit text" })

async function selectSubtitle(): Promise<void> {
  await app.show("Pricing", 1, subtitle)
  await app.selectLayer("Pricing", subtitle)
}

/** Opens the editor with Enter, as on a selected text layer. */
async function openWithEnter(): Promise<void> {
  await app.page.keyboard.press("Enter")
  await expect.poll(() => focused()).toBe(true)
}

function focused(): Promise<boolean> {
  return editor()
    .evaluate((textarea) => textarea === document.activeElement)
    .catch(() => false)
}

/** What the editor has selected. */
function selected(): Promise<string> {
  return editor().evaluate((textarea) =>
    textarea instanceof HTMLTextAreaElement ? textarea.value.slice(textarea.selectionStart, textarea.selectionEnd) : ""
  )
}

async function editorBox(): Promise<Box> {
  const box = await editor().boundingBox()
  if (!box) throw new Error("The text editor isn't drawn")
  return box
}

/** Where a word of a layer's text is drawn. */
function wordBox(design: string, id: string, word: string): Promise<Box> {
  return app.page.evaluate(
    ([design, id, word]) => {
      const e2e = window.e2e!
      const element = window.e2eModules!.frames.findNodeElement(e2e.frame(e2e.key(design)), id)
      for (const node of element?.childNodes ?? []) {
        if (!(node instanceof Text) || !node.data.includes(word)) continue
        const range = document.createRange()
        range.setStart(node, node.data.indexOf(word))
        range.setEnd(node, node.data.indexOf(word) + word.length)
        const { x, y, width, height } = range.getBoundingClientRect()
        return { x, y, width, height }
      }
      throw new Error(`${id} doesn't draw "${word}"`)
    },
    [design, id, word] as const
  )
}

/** A layer's font size as its design sets it, and as the editor draws it on screen. */
function fontSizes(id: string): Promise<{ layer: number; editor: number }> {
  return app.page.evaluate((id) => {
    const e2e = window.e2e!
    const element = window.e2eModules!.frames.findNodeElement(e2e.frame(e2e.key("Pricing")), id)
    const textarea = document.querySelector("textarea.text-editor")
    if (!element || !textarea) throw new Error("Nothing to measure")
    return {
      layer: parseFloat(getComputedStyle(element).fontSize),
      editor: parseFloat(getComputedStyle(textarea).fontSize)
    }
  }, id)
}

/** Dispatches an input method's composition events on the editor, as typing in Japanese or Chinese does. */
async function compose(event: "compositionstart" | "compositionend"): Promise<void> {
  await editor().evaluate((textarea, type) => {
    textarea.dispatchEvent(
      new CompositionEvent(type, { bubbles: true, data: type === "compositionend" ? "プラン" : "" })
    )
  }, event)
}

describe("opening the editor", () => {
  it("selects the double-clicked word", async () => {
    await selectSubtitle()
    const upgrade = center(await wordBox("Pricing", subtitle, "upgrade"))
    await app.page.mouse.dblclick(upgrade.x, upgrade.y)
    await expect.poll(() => focused()).toBe(true)
    expect(await selected()).toBe("upgrade")
    // On the second line too.
    await app.page.keyboard.press("Escape")
    await expect.poll(() => editor().count()).toBe(0)
    const viewers = center(await wordBox("Pricing", subtitle, "viewers"))
    await app.page.mouse.dblclick(viewers.x, viewers.y)
    await expect.poll(() => focused()).toBe(true)
    expect(await selected()).toBe("viewers")
  })

  it("selects the whole text when opened with Enter", async () => {
    await selectSubtitle()
    await openWithEnter()
    expect(await selected()).toBe(original)
  })
})

describe("where the editor draws", () => {
  it("wraps at the text's own width, and grows down as it's typed in", async () => {
    await selectSubtitle()
    const text = await app.box("Pricing", subtitle)
    await openWithEnter()
    // Over the text, two lines at its own 560px, rather than one long line from where its characters start.
    await expect.poll(() => editorBox()).toEqual(about(text))
    await app.page.keyboard.press("End")
    await app.page.keyboard.type(" Cancel any time, and keep what you made.", { delay: 5 })
    await expect.poll(async () => (await editorBox()).height).toBeGreaterThan(text.height + 10)
    expect((await editorBox()).width).toBeCloseTo(text.width, 0)
  })

  it("follows the text while the canvas pans and zooms", async () => {
    await selectSubtitle()
    await openWithEnter()
    const before = await editorBox()
    // Scrolling over the canvas, away from the editor, pans it.
    const away = center(await app.box("Pricing", title))
    await app.page.mouse.move(away.x, away.y)
    await app.page.mouse.wheel(0, 160)
    await app.settle("Pricing")
    const panned = await app.box("Pricing", subtitle)
    expect(Math.abs(panned.y - before.y)).toBeGreaterThan(40)
    await expect.poll(() => editorBox()).toEqual(about(panned))
    // Ctrl and the wheel zoom it, and the editor's text scales with the layer's.
    await app.page.keyboard.down("Control")
    await app.page.mouse.wheel(0, -200)
    await app.page.keyboard.up("Control")
    await app.settle("Pricing")
    const { z } = await app.camera()
    expect(z).toBeGreaterThan(1.05)
    const zoomed = await app.box("Pricing", subtitle)
    await expect.poll(() => editorBox()).toEqual(about(zoomed))
    const sizes = await fontSizes(subtitle)
    expect(sizes.editor).toBeCloseTo(sizes.layer * z, 1)
    // Still editing, with the text still selected.
    expect(await focused()).toBe(true)
    expect(await selected()).toBe(original)
  })
})

describe("leaving the editor", () => {
  it("keeps the edit on Escape, as a note does, with the layer still selected", async () => {
    await selectSubtitle()
    await openWithEnter()
    await app.page.keyboard.type("Simple pricing for every team.", { delay: 5 })
    await app.page.keyboard.press("Escape")
    await expect.poll(() => editor().count()).toBe(0)
    await expect.poll(() => app.node("Pricing", subtitle)).toMatchObject({ text: "Simple pricing for every team." })
    expect(await app.undoLabel()).toBe("Edit text")
    expect((await app.selection()).node).toBe(subtitle)
  })

  it("leaves Enter and Escape to an input method while it's composing", async () => {
    await selectSubtitle()
    await openWithEnter()
    await app.page.keyboard.type("Plans", { delay: 5 })
    await compose("compositionstart")
    await app.page.keyboard.press("Enter")
    await app.page.keyboard.press("Escape")
    await app.frames(2)
    // Still editing: the keys were the input method's, and nothing is written yet.
    expect(await focused()).toBe(true)
    expect(await app.node("Pricing", subtitle)).toMatchObject({ text: original })
    await compose("compositionend")
    const typed = await editor().inputValue()
    await app.page.keyboard.press("Enter")
    await expect.poll(() => editor().count()).toBe(0)
    await expect.poll(() => app.node("Pricing", subtitle)).toMatchObject({ text: typed })
  })
})

describe("auto width, auto height and fixed text", () => {
  const sizing = (name: string) => app.page.getByRole("radio", { name })
  const pressed = async () => {
    for (const name of ["Auto width", "Auto height", "Fixed size"]) {
      if ((await sizing(name).getAttribute("aria-checked")) === "true") return name
    }
    return undefined
  }

  it("switches between them from the inspector, keeping the layer where it's drawn", async () => {
    await app.show("Pricing", 1, heading)
    await app.selectLayer("Pricing", heading)
    // A text layer without a width wraps at the one its layout gives it.
    await expect.poll(pressed).toBe("Auto height")
    const width = app.page.locator('input[aria-label="Width"]')
    await width.click()
    await width.press("ControlOrMeta+a")
    await width.pressSequentially("80", { delay: 20 })
    await width.press("Enter")
    await expect.poll(async () => (await app.style("Pricing", heading)).width).toBe(20)
    const wrapped = await app.size("Pricing", heading)
    expect(await pressed()).toBe("Auto height")

    // Auto width: one line, as wide as the text.
    await sizing("Auto width").click()
    await expect.poll(async () => (await app.style("Pricing", heading)).width).toBe("hug")
    const line = (await app.size("Pricing", heading))!
    expect(line.width).toBeGreaterThan(160)
    expect(line.height).toBeLessThan(wrapped!.height * 0.75)
    expect(await pressed()).toBe("Auto width")

    // Auto height: the width it's drawn at, fixed, in spacing steps; the height still follows the text.
    await sizing("Auto height").click()
    await expect.poll(async () => typeof (await app.style("Pricing", heading)).width).toBe("number")
    const fixedWidth = Number((await app.style("Pricing", heading)).width)
    // Rounded up to whole steps, so the text doesn't wrap again.
    expect(fixedWidth * 4).toBeGreaterThanOrEqual(line.width - 0.5)
    expect(fixedWidth * 4).toBeLessThan(line.width + 4.5)
    expect((await app.style("Pricing", heading)).height).toBeUndefined()
    expect((await app.size("Pricing", heading))!.height).toBe(line.height)

    // Fixed: the height it's drawn at too.
    await sizing("Fixed size").click()
    await expect.poll(async () => typeof (await app.style("Pricing", heading)).height).toBe("number")
    const fixedHeight = Number((await app.style("Pricing", heading)).height)
    expect(fixedHeight * 4).toBeGreaterThanOrEqual(line.height - 0.5)
    expect(fixedHeight * 4).toBeLessThan(line.height + 4.5)
    expect(await pressed()).toBe("Fixed size")
  })
})
