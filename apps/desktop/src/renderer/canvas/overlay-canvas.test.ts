import { describe, expect, it } from "vite-plus/test"
import { sizeWhileShown } from "./overlay-canvas.ts"

/** A stand-in for a canvas element: its size is accessors on its class, and setting one counts as clearing it. */
class Canvas {
  #width = 300
  #height = 150
  sets = 0
  get width() {
    return this.#width
  }
  set width(value: number) {
    this.#width = value
    this.sets++
  }
  get height() {
    return this.#height
  }
  set height(value: number) {
    this.#height = value
    this.sets++
  }
}

/** What tldraw does as it draws: sizes the canvas to the window's, when it isn't already. */
function draw(canvas: Canvas, width = 1920, height = 1080): void {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
}

describe("sizeWhileShown", () => {
  it("gives the canvas no bitmap while nothing shows", () => {
    const canvas = new Canvas()
    const sizing = sizeWhileShown(canvas, () => false)
    sizing.release()
    expect([canvas.width, canvas.height]).toEqual([0, 0])
    draw(canvas)
    expect([canvas.width, canvas.height]).toEqual([0, 0])
  })

  it("lets tldraw size it while an overlay shows, and takes the bitmap back once it goes", () => {
    const canvas = new Canvas()
    let showing = false
    const sizing = sizeWhileShown(canvas, () => showing)
    sizing.release()
    showing = true
    draw(canvas)
    expect([canvas.width, canvas.height]).toEqual([1920, 1080])
    showing = false
    draw(canvas)
    expect([canvas.width, canvas.height]).toEqual([1920, 1080])
    sizing.release()
    expect([canvas.width, canvas.height]).toEqual([0, 0])
  })

  it("leaves the bitmap while something still shows", () => {
    const canvas = new Canvas()
    const sizing = sizeWhileShown(canvas, () => true)
    draw(canvas)
    sizing.release()
    expect([canvas.width, canvas.height]).toEqual([1920, 1080])
  })

  it("never sets a size the canvas already has, which would clear it", () => {
    const canvas = new Canvas()
    const sizing = sizeWhileShown(canvas, () => false)
    sizing.release()
    const sets = canvas.sets
    // Panning with nothing showing draws again and again, each time finding the canvas smaller than the window.
    for (let pan = 0; pan < 5; pan++) draw(canvas)
    sizing.release()
    expect(canvas.sets).toBe(sets)
  })

  it("leaves the canvas to tldraw once restored", () => {
    const canvas = new Canvas()
    const sizing = sizeWhileShown(canvas, () => false)
    sizing.release()
    sizing.restore()
    draw(canvas)
    expect([canvas.width, canvas.height]).toEqual([1920, 1080])
    expect(Object.getOwnPropertyNames(canvas)).not.toContain("width")
  })
})
