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
})
