import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App } from "./app.ts"

// docs/editor.md, Frames (PAR-545): drawing a frame with the frame tool, text on the empty canvas making a frame that
// hugs it, and converting a frame to a heavier kind and back with Undo.

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterEach(() => app?.reset())
afterAll(() => app?.close())

/** The design added since `before`, by its key. */
async function added(before: { key: string }[]) {
  await expect.poll(async () => (await app.designs()).length).toBe(before.length + 1)
  return (await app.designs()).find((design) => !before.some((old) => old.key === design.key))!
}

function frameOf(key: string) {
  return app.page.evaluate((key) => {
    const { container } = window.e2e!.session().store.getEntry(key)!
    return { kind: container.kind, size: container.size, name: container.name }
  }, key)
}

describe("the frame tool", () => {
  it("draws a frame by dragging, named Frame 1, selected, with the move tool back, as one step", async () => {
    const { screen, page } = await app.showEmptyCanvas()
    const before = await app.designs()
    await app.page.keyboard.press("f")
    await expect.poll(() => app.tool()).toBe("frame")
    await app.drag(screen, { x: screen.x + 240, y: screen.y + 160 })
    const frame = await added(before)
    expect(frame).toMatchObject({ name: "Frame 1", kind: "frame", position: page })
    expect((await frameOf(frame.key)).size).toEqual({ width: 240, height: 160 })
    expect(await app.selection()).toEqual({ design: frame.key })
    expect(await app.tool()).toBe("select")
    expect(await app.undoLabel()).toBe("Draw frame")
    await app.page.keyboard.press("Control+z")
    await expect.poll(async () => (await app.designs()).length).toBe(before.length)
  })

  it("makes a 100 × 100 frame with a click, and A picks it too", async () => {
    const { screen } = await app.showEmptyCanvas()
    const before = await app.designs()
    await app.page.keyboard.press("a")
    await expect.poll(() => app.tool()).toBe("frame")
    await app.click(screen)
    const frame = await added(before)
    expect((await frameOf(frame.key)).size).toEqual({ width: 100, height: 100 })
  })

  it("resizes the selected frame to a mode's size from its menu", async () => {
    const { screen } = await app.showEmptyCanvas()
    const before = await app.designs()
    await app.page.keyboard.press("f")
    await app.click(screen)
    const frame = await added(before)
    await app.page.getByRole("button", { name: "Frame sizes, New screen and New component" }).click()
    await app.page.getByRole("menuitem", { name: /^Mobile/ }).click()
    await expect.poll(async () => (await frameOf(frame.key)).size).toEqual({ width: 390, height: 844 })
    expect(await app.undoLabel()).toBe("Resize frame to Mobile")
  })
})

describe("text on the empty canvas", () => {
  it("makes a text layer in a frame that hugs it, named after what's typed", async () => {
    const { screen } = await app.showEmptyCanvas()
    const before = await app.designs()
    await app.page.keyboard.press("t")
    await app.click(screen)
    const frame = await added(before)
    await expect.poll(() => app.page.getByRole("textbox", { name: "Edit text" }).isVisible()).toBe(true)
    await app.page.keyboard.type("Plans for every team")
    await app.page.keyboard.press("Enter")
    await expect.poll(async () => (await frameOf(frame.key)).name).toBe("Plans for every team")
    // It hugs its text on one line: as wide as the text and its padding, no wider.
    const lines = () =>
      app.page.evaluate((key) => {
        const host = document.querySelector(`.frame-view[data-design="${CSS.escape(key)}"] [data-frame]`)
        const text = host?.shadowRoot?.querySelector("[data-canvas-node]")?.firstElementChild
        return text instanceof HTMLElement
          ? Math.round(text.offsetHeight / parseFloat(getComputedStyle(text).lineHeight))
          : 0
      }, frame.key)
    await expect.poll(lines).toBe(1)
    const width = (await frameOf(frame.key)).size?.width ?? 0
    expect(width).toBeGreaterThan(100)
    expect(width).toBeLessThan(400)
    expect(await app.undoLabel()).toBe("Edit text")
  })
})

// PAR-657, for its diagnostic run only: the pair of tests below, six times over, to catch the press an open tooltip takes.
describe.each([1, 2, 3, 4, 5, 6])("converting a frame, round %i", () => {
  it("makes it a component at once, with a toast whose Undo makes it a frame again", async () => {
    const { screen } = await app.showEmptyCanvas()
    const before = await app.designs()
    await app.page.keyboard.press("f")
    await app.click(screen)
    const frame = await added(before)
    await app.page.getByRole("group", { name: "Kind" }).getByRole("button", { name: "Component" }).click()
    await expect.poll(async () => (await frameOf(frame.key)).kind).toBe("component")
    expect(await app.undoLabel()).toBe("Convert to component")
    await app.page.locator("[data-sonner-toast]").getByRole("button", { name: "Undo" }).click()
    await expect.poll(async () => (await frameOf(frame.key)).kind).toBe("frame")
  })

  it("asks before a screen with states becomes a frame, saying what it drops", async () => {
    await app.show("Pricing", 0.3)
    await app.selectDesign("Pricing")
    await app.page.getByRole("group", { name: "Kind" }).getByRole("button", { name: "Frame" }).click()
    const dialog = app.page.getByRole("dialog")
    await expect.poll(() => dialog.innerText()).toContain("Convert Pricing to a frame?")
    await dialog.getByRole("button", { name: "Cancel" }).click()
    const pricing = (await app.designs()).find((design) => design.name === "Pricing")!
    expect(pricing.kind).toBe("screen")
  })
})
