import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { about, App, type Box, center } from "./app.ts"

// docs/editor.md, Text: editing text in place (PAR-175). On Pricing's subtitle, "Start free, then upgrade…", which
// wraps onto two lines at 560px, centred under the heading.

let app: App

beforeAll(async () => {
  app = await App.connect()
})

afterEach(() => app?.reset())

afterAll(() => app?.close())

const subtitle = "so61t"
const title = "crd2J"

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

  if (!box) {
    throw new Error("The text editor isn't drawn")
  }

  return box
}

/** Where a word of a layer's text is drawn. */
function wordBox(design: string, id: string, word: string): Promise<Box> {
  return app.page.evaluate(
    ([design, id, word]) => {
      const e2e = window.e2e!
      const element = window.e2eModules!.frames.findNodeElement(e2e.frame(e2e.key(design)), id)

      for (const node of element?.childNodes ?? []) {
        if (!(node instanceof Text) || !node.data.includes(word)) {
          continue
        }

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

    if (!element || !textarea) {
      throw new Error("Nothing to measure")
    }

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
