import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App } from "./app.ts"

// docs/editor.md, Selecting: tldraw's overlay canvas holds a bitmap only while an overlay shows (PAR-196).

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterEach(() => app.reset())
afterAll(() => app.close())

/** The overlay canvas's bitmap size, and whether anything is drawn on it. */
function overlayCanvas(): Promise<{ width: number; height: number; drawn: boolean }> {
  return app.page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.tl-canvas-overlays")!
    const { width, height } = canvas
    if (width === 0 || height === 0) return { width, height, drawn: false }
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, width, height).data
    let drawn = false
    for (let alpha = 3; alpha < pixels.length && !drawn; alpha += 4) drawn = pixels[alpha]! > 0
    return { width, height, drawn }
  })
}

describe("the overlay canvas", () => {
  it("has no bitmap while nothing shows, and the window's while a selection box does", async () => {
    await app.show("Sign in", 0.5)
    await app.page.mouse.move(1, 1)
    await expect.poll(overlayCanvas).toEqual({ width: 0, height: 0, drawn: false })

    // Several designs selected draw tldraw's selection box around them.
    await app.page.evaluate(() => {
      window.e2e!.session().editor!.selectAll()
    })
    await expect.poll(async () => (await overlayCanvas()).drawn).toBe(true)
    const { width, height } = await overlayCanvas()
    const scale = await app.page.evaluate(() => window.devicePixelRatio)
    const area = await app.page.locator(".tl-canvas-overlays").evaluate((canvas) => canvas.getBoundingClientRect())
    expect([width, height]).toEqual([Math.ceil(area.width * scale), Math.ceil(area.height * scale)])

    await app.page.keyboard.press("Escape")
    await expect.poll(overlayCanvas).toEqual({ width: 0, height: 0, drawn: false })

    // Moving the camera with nothing showing draws the canvas again, which leaves it without a bitmap.
    await app.show("Sign in", 0.25)
    expect(await overlayCanvas()).toEqual({ width: 0, height: 0, drawn: false })
  })

  it("keeps the selection box while Shift is held down on the empty canvas", async () => {
    await app.show("Sign in", 0.1)
    // Two designs in view selected, then a bare spot of canvas outside the box around them.
    const empty = await app.page.evaluate(() => {
      const editor = window.e2e!.session().editor!
      const area = editor.getContainer().getBoundingClientRect()
      const viewport = editor.getViewportPageBounds()
      const inView = editor.getCurrentPageShapes().filter((shape) => {
        const bounds = editor.getShapePageBounds(shape)
        return bounds && viewport.collides(bounds)
      })
      if (inView.length < 2) return undefined
      editor.select(...inView.slice(0, 2).map((shape) => shape.id))
      const box = editor.getSelectionScreenBounds()!
      for (let y = area.bottom - 20; y > area.top + 20; y -= 40) {
        for (let x = area.right - 20; x > area.left + 20; x -= 40) {
          if (x > box.minX - 40 && x < box.maxX + 40 && y > box.minY - 40 && y < box.maxY + 40) continue
          // The canvas itself, not a control drawn over it, and no board near.
          const under = document.elementFromPoint(x, y)
          if (!under?.closest(".tl-canvas") || under.closest("button, .tl-shape, .design-title")) continue
          if (!editor.getShapeAtPoint(editor.screenToPage({ x, y }), { hitInside: true, margin: 20 })) return { x, y }
        }
      }
      return undefined
    })
    if (!empty) throw new Error("No two designs and empty canvas in view")
    await expect.poll(async () => (await overlayCanvas()).drawn).toBe(true)
    // Pressing the empty canvas with Shift keeps the selection, and tldraw keeps drawing its box with no handles.
    await app.page.mouse.move(empty.x, empty.y)
    await app.page.keyboard.down("Shift")
    await app.page.mouse.down()
    try {
      await expect
        .poll(() => app.page.evaluate(() => window.e2e!.session().editor!.isIn("select.pointing_canvas")))
        .toBe(true)
      expect((await overlayCanvas()).drawn).toBe(true)
    } finally {
      await app.page.mouse.up()
      await app.page.keyboard.up("Shift")
    }
  })

  it("draws the brush while a box is dragged on the empty canvas, and gives the bitmap back after", async () => {
    await app.show("Sign in", 0.1)
    // A stretch of bare canvas, clear of every board, to drag the brush across.
    const empty = await app.page.evaluate(() => {
      const editor = window.e2e!.session().editor!
      const area = editor.getContainer().getBoundingClientRect()
      const bare = (x: number, y: number) => {
        const under = document.elementFromPoint(x, y)
        if (!under?.closest(".tl-canvas") || under.closest("button, .tl-shape, .design-title")) return false
        return !editor.getShapeAtPoint(editor.screenToPage({ x, y }), { hitInside: true, margin: 20 })
      }
      for (let y = area.bottom - 20; y > area.top + 60; y -= 40) {
        for (let x = area.right - 20; x > area.left + 60; x -= 40) {
          if (bare(x, y) && bare(x - 30, y - 30) && bare(x - 15, y - 15)) return { x, y }
        }
      }
      return undefined
    })
    if (!empty) throw new Error("No bare canvas in view")
    await app.page.mouse.move(1, 1)
    await expect.poll(overlayCanvas).toEqual({ width: 0, height: 0, drawn: false })
    await app.page.mouse.move(empty.x, empty.y)
    await app.page.mouse.down()
    try {
      await app.page.mouse.move(empty.x - 30, empty.y - 30, { steps: 6 })
      await expect.poll(() => app.page.evaluate(() => window.e2e!.session().editor!.isIn("select.brushing"))).toBe(true)
      await expect.poll(async () => (await overlayCanvas()).drawn).toBe(true)
    } finally {
      await app.page.mouse.up()
    }
    await app.page.mouse.move(1, 1)
    await expect.poll(overlayCanvas).toEqual({ width: 0, height: 0, drawn: false })
  })
})
