import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App } from "./app.ts"

// docs/editor.md, Each page of the app as a screen (PAR-1076), live route boards (PAR-1263): with the Interact tool, a
// press on a route board puts the app's own page over its frozen copy, engaged; Ctrl and the wheel over it still zoom
// the canvas, and Escape or a press outside gives the pointer and keys back to Parity.

let app: App

beforeAll(async () => {
  app = await App.connect()
})

afterEach(async () => {
  // Out of Interact first, so the live page lets go of the keys `reset` presses.
  await app?.page.evaluate(() => window.e2e!.session().selection.setTool("select"))
  await app?.reset()
})

afterAll(() => app?.close())

/** The Pricing route's board, drawn from its page: the `(pages)` file's route, not the Pricing screen. */
const pricing = "(pages)#route:/pricing"

/** Puts the Pricing route's board in view at 50%, waits for its frozen copy, and says where its frame is on screen. */
async function showPricing() {
  await app.page.evaluate((key) => {
    const editor = window.e2e!.session().editor!
    editor.stopCameraAnimation()
    const area = editor.getContainer().getBoundingClientRect()
    const camera = editor.getCamera()
    const frame = window.e2e!.frame(key).getBoundingClientRect()
    const page = { x: (frame.left - area.left) / camera.z - camera.x, y: (frame.top - area.top) / camera.z - camera.y }
    editor.setCamera({ x: 64 / 0.5 - page.x, y: 140 / 0.5 - page.y, z: 0.5 }, { immediate: true })
  }, pricing)

  // The freezer loads the route the first time it's asked for, which compiles it.
  await expect
    .poll(() => app.page.evaluate((key) => window.e2e!.frame(key).hasAttribute("data-copy"), pricing), {
      timeout: 60_000
    })
    .toBe(true)

  return app.page.evaluate((key) => {
    const { x, y, width, height } = window.e2e!.frame(key).closest(".mode-frame")!.getBoundingClientRect()

    return { x, y, width, height }
  }, pricing)
}

/** Whether the Pricing board is live, and engaged, and whether its page has focus. */
function live() {
  return app.page.evaluate((key) => {
    const board = window.e2e!.frame(key).closest<HTMLElement>(".mode-frame")!
    const frame = document.querySelector("[data-live-frame]:not([aria-hidden])")

    return {
      live: board.dataset.live ?? "no",
      focused: !!frame && document.activeElement === frame
    }
  }, pricing)
}

describe("live route boards", () => {
  it("goes live and engaged on a press with Interact, zooms with Ctrl and the wheel, and lets go on Escape", async () => {
    const board = await showPricing()
    await app.page.keyboard.press("i")
    await expect.poll(() => app.tool()).toBe("interact")
    const middle = { x: board.x + board.width / 2, y: board.y + board.height / 3 }

    await app.click(middle)
    await expect.poll(live, { timeout: 30_000 }).toEqual({ live: "engaged", focused: true })

    // The page takes the wheel, but Ctrl and the wheel come back as the canvas's zoom.
    const before = await app.page.evaluate(() => window.e2e!.session().editor!.getZoomLevel())
    await app.page.mouse.move(middle.x, middle.y)
    await app.page.keyboard.down("Control")
    await app.page.mouse.wheel(0, -200)
    await app.page.keyboard.up("Control")
    await expect
      .poll(() => app.page.evaluate(() => window.e2e!.session().editor!.getZoomLevel()))
      .toBeGreaterThan(before)

    await app.page.keyboard.press("Escape")
    await expect.poll(live).toEqual({ live: "", focused: false })
  })

  it("engages again on a press, and lets go on a press outside the page", async () => {
    const board = await showPricing()
    await app.page.keyboard.press("i")
    await expect.poll(() => app.tool()).toBe("interact")

    await app.click({ x: board.x + board.width / 2, y: board.y + board.height / 3 })
    await expect.poll(live, { timeout: 30_000 }).toEqual({ live: "engaged", focused: true })

    await app.click({ x: board.x + board.width / 2, y: board.y - 80 })
    await expect.poll(live).toEqual({ live: "", focused: false })

    await app.click({ x: board.x + board.width / 2, y: board.y + board.height / 3 })
    await expect.poll(live).toEqual({ live: "engaged", focused: true })
  })
})
