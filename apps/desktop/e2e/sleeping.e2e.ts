import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App } from "./app.ts"

// docs/editor.md, Zooming far out: frames showing their bitmaps let go of their designs, and draw them again as they
// come back into view, at the same size (PAR-197).

let app: App

beforeAll(async () => {
  app = await App.connect()
  // Bitmaps are taken one frame at a time in the background, and a frame without one stays drawn, so a run that starts
  // with this file waits for them all.
  await app.page.waitForFunction(
    () => document.querySelectorAll("[data-bitmap]").length === document.querySelectorAll("[data-frame]").length,
    undefined,
    { timeout: 150_000, polling: 500 }
  )
}, 180_000)
afterEach(() => app?.reset())
afterAll(() => app?.close())

/** Every board's size, as tldraw has it and agents' snapshots give it. */
const boards = () =>
  app.page.evaluate(() =>
    Object.fromEntries(
      window
        .e2e!.session()
        .editor!.getCurrentPageShapes()
        .flatMap((shape) =>
          shape.type === "canvas-container" && "key" in shape.props && "w" in shape.props && "h" in shape.props
            ? [[shape.props.key, [Math.round(Number(shape.props.w)), Math.round(Number(shape.props.h))]]]
            : []
        )
    )
  )

/**
 * How many frames have bitmaps, how many sleep, how many draw their designs, and how many elements those hold. A frame
 * whose design doesn't render has no bitmap, so it never sleeps.
 */
const frames = () =>
  app.page.evaluate(() => {
    const hosts = [...document.querySelectorAll("[data-frame]")]
    return {
      all: hosts.length,
      bitmaps: hosts.filter((host) => host.closest("[data-bitmap]")).length,
      asleep: hosts.filter((host) => host.closest("[data-asleep]")).length,
      drawn: hosts.filter((host) => host.shadowRoot?.querySelector("*")).length,
      elements: hosts.reduce((total, host) => total + (host.shadowRoot?.querySelectorAll("*").length ?? 0), 0)
    }
  })

/** Whether a design's main frame draws its design. */
const drawn = (design: string) =>
  app.page.evaluate((design) => {
    const host = window.e2e!.frame(window.e2e!.key(design))
    return !host.closest("[data-asleep]") && !!host.shadowRoot?.querySelector("*")
  }, design)

/** The window's DOM nodes, once everything nothing holds is collected (see reopening.e2e.ts). */
async function nodes(): Promise<number> {
  const cdp = await app.page.context().newCDPSession(app.page)
  await cdp.send("Runtime.discardConsoleEntries")
  for (let pass = 0; pass < 3; pass++) await cdp.send("HeapProfiler.collectGarbage")
  const { nodes } = await cdp.send("Memory.getDOMCounters")
  await cdp.detach()
  return nodes
}

/**
 * Zooms to fit the whole project, and waits until every frame with a bitmap sleeps: once the zoom settles, which a busy
 * machine can hold back for seconds.
 */
async function zoomOut(): Promise<void> {
  await app.page.keyboard.press("Shift+1")
  await expect
    .poll(
      async () => {
        const { bitmaps, asleep } = await frames()
        return asleep > 0 && asleep === bitmaps
      },
      { timeout: 30_000 }
    )
    .toBe(true)
}

describe("zoomed far out", () => {
  it(
    "lets go of frames showing bitmaps, and draws them again in view at the same size",
    { timeout: 240_000 },
    async () => {
      await app.show("Members", 1)
      const sizes = await boards()
      const awake = await nodes()
      const { elements } = await frames()
      expect(elements).toBeGreaterThan(0)

      await zoomOut()
      // The elements the frames drew are let go of, and nothing keeps them: text and comments are nodes too.
      const out = await frames()
      expect(out.drawn).toBe(out.all - out.asleep)
      expect(await nodes()).toBeLessThan(awake - elements)
      expect(await boards()).toEqual(sizes)

      // Back in view, its frames draw again, and the boards out of view stay asleep.
      await app.show("Members", 1)
      expect(await drawn("Members")).toBe(true)
      expect(await app.size("Members", "ada")).toBeDefined()
      expect((await frames()).asleep).toBeGreaterThan(0)
      expect(await boards()).toEqual(sizes)
    }
  )

  it("draws the selected board's frames", { timeout: 180_000 }, async () => {
    await zoomOut()
    expect(await drawn("Members")).toBe(false)
    await app.selectDesign("Members")
    await expect.poll(() => drawn("Members")).toBe(true)
    // Selecting nothing lets it sleep again.
    await app.page.keyboard.press("Escape")
    await expect.poll(() => drawn("Members")).toBe(false)
  })
})
