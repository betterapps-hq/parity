import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App } from "./app.ts"

// docs/editor.md, Zooming far out: frames showing their bitmaps let go of their designs, and draw them again as they
// come back into view, at the same size (PAR-197).

let app: App

beforeAll(async () => {
  app = await App.connect()

  // Bitmaps are taken one frame at a time in the background, and a frame without one stays drawn, so a run that starts
  // with this file waits for them all. A route board shows a picture of its page's copy instead (PAR-1200), so each
  // frame is checked for the one it shows rather than the counts compared.
  try {
    await app.page.waitForFunction(
      () =>
        [...document.querySelectorAll("[data-frame]")].every(
          (host) => host.closest("[data-bitmap]") || host.closest("[data-tier]")?.querySelector("img[data-picture]")
        ),
      undefined,
      { timeout: 150_000, polling: 500 }
    )
  } catch (error) {
    // Which frames never got one, so a failure says where to look.
    const without = await app.page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-frame]")].flatMap((host) =>
        host.closest("[data-bitmap]") || host.closest("[data-tier]")?.querySelector("img[data-picture]")
          ? []
          : [`${host.dataset.design} ${host.dataset.state}/${host.dataset.mode}`]
      )
    )

    throw new Error(`${without.length} frames have no bitmap: ${without.slice(0, 20).join(", ")}`, { cause: error })
  }
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
        .flatMap((item) =>
          item.type === "canvas-container" && "key" in item.props && "w" in item.props && "h" in item.props
            ? [[item.props.key, [Math.round(Number(item.props.w)), Math.round(Number(item.props.h))]]]
            : []
        )
    )
  )

/**
 * Every frame's size on the canvas, by design, state and mode, so a failure names the frame. A board's gutter keeps its
 * screen size (PAR-602), so zoomed out its board grows on the canvas while its frames keep theirs.
 */
const frameSizes = () =>
  app.page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-frame]")].map((host) => [
        `${host.dataset.design} ${host.dataset.state}/${host.dataset.mode}`,
        [host.offsetWidth, host.offsetHeight]
      ])
    )
  )

/**
 * How many designs' frames have bitmaps, how many sleep, and how many draw their designs. A frame whose design doesn't
 * render has no bitmap, so it never sleeps. Route boards show their pages' pictures instead (PAR-1200), and aren't
 * counted.
 */
const frames = () =>
  app.page.evaluate(() => {
    const hosts = [...document.querySelectorAll("[data-frame]")].filter((host) => !host.closest("[data-tier]"))

    return {
      all: hosts.length,
      bitmaps: hosts.filter((host) => host.closest("[data-bitmap]")).length,
      asleep: hosts.filter((host) => host.closest("[data-asleep]")).length,
      drawn: hosts.filter((host) => host.shadowRoot?.querySelector("*")).length
    }
  })

/** Whether a design's main frame draws its design. */
const drawn = (design: string) =>
  app.page.evaluate((design) => {
    const host = window.e2e!.frame(window.e2e!.key(design))

    return !host.closest("[data-asleep]") && !!host.shadowRoot?.querySelector("*")
  }, design)

declare global {
  interface Window {
    /** The weak references `holdDrawn` keeps in the page, by frame. */
    e2eDrawn?: { host: WeakRef<HTMLElement>; name: string; nodes: WeakRef<Node>[] }[]
  }
}

/**
 * Weak references to every node the drawn frames hold in their shadow roots, text and comments too, kept in the page by
 * frame, so the test can tell which of them are collected once the frames sleep. Returns how many there are.
 */
const holdDrawn = () =>
  app.page.evaluate(() => {
    window.e2eDrawn = [...document.querySelectorAll<HTMLElement>("[data-frame]")].flatMap((host) => {
      if (!host.shadowRoot) {
        return []
      }

      const nodes: WeakRef<Node>[] = []
      const walker = document.createTreeWalker(host.shadowRoot)

      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        nodes.push(new WeakRef(node))
      }

      const name = `${host.dataset.design} ${host.dataset.state}/${host.dataset.mode}`

      return nodes.length > 0 ? [{ host: new WeakRef(host), name, nodes }] : []
    })

    return window.e2eDrawn.reduce((total, frame) => total + frame.nodes.length, 0)
  })

/**
 * The nodes from `holdDrawn` that sleeping frames still keep once everything nothing holds is collected, by frame and
 * node name with how many, so a failure says what's kept. What the page logged goes first, since DevTools keeps it.
 */
async function keptAsleep(): Promise<string[]> {
  const cdp = await app.page.context().newCDPSession(app.page)
  await cdp.send("Runtime.discardConsoleEntries")

  for (let pass = 0; pass < 3; pass++) {
    await cdp.send("HeapProfiler.collectGarbage")
  }

  await cdp.detach()

  return app.page.evaluate(() => {
    const kept = new Map<string, number>()

    for (const { host, name, nodes } of window.e2eDrawn ?? []) {
      if (host.deref()?.closest("[data-asleep]")) {
        for (const node of nodes) {
          const nodeName = node.deref()?.nodeName

          if (nodeName) {
            kept.set(`${name} ${nodeName}`, (kept.get(`${name} ${nodeName}`) ?? 0) + 1)
          }
        }
      }
    }

    return [...kept].map(([what, count]) => `${what} ×${count}`)
  })
}

/**
 * Zooms to fit the whole project, and waits until every frame with a bitmap sleeps: once the zoom settles, which a busy
 * machine can hold back for seconds.
 */
async function zoomOut(): Promise<void> {
  await app.page.keyboard.press("Shift+1")

  // The frames with a bitmap still awake, by design, state and mode, with what their tile says of them: none once every
  // one sleeps.
  const awake = () =>
    app.page.evaluate(() => {
      const hosts = [...document.querySelectorAll<HTMLElement>("[data-frame]")]

      return hosts.flatMap((host) => {
        const tile = host.closest<HTMLElement>("[data-bitmap]")

        return tile && !tile.hasAttribute("data-asleep")
          ? [`${host.dataset.design} ${host.dataset.state}/${host.dataset.mode} ${Object.keys(tile.dataset).join(" ")}`]
          : []
      })
    })

  await expect.poll(async () => (await frames()).asleep > 0, { timeout: 30_000 }).toBe(true)
  await expect.poll(awake, { timeout: 30_000 }).toEqual([])
}

describe("zoomed far out", () => {
  it(
    "lets go of frames showing bitmaps, and draws them again in view at the same size",
    { timeout: 240_000 },
    async () => {
      // The first zoom out draws every board's title and gutter, which stay, and fits a frame or two drawn for the
      // first time. Zoomed out once already, the counts and sizes below are the same whichever files ran before this
      // one: with the suite split across runners, this file may be the first to zoom out (PAR-1121).
      await zoomOut()
      await app.show("Members", 1)
      await expect.poll(() => drawn("Members")).toBe(true)
      const sizes = await boards()
      const framed = await frameSizes()
      // Session Replay records the window in CI too, and what it records of the frames could keep their nodes, so it's
      // held while they're let go of (PAR-1047).
      const letGo = await app.holdRecording(120_000)

      // Let go however it ends, so the files after this one are recorded.
      try {
        expect(await holdDrawn()).toBeGreaterThan(0)

        await zoomOut()
        // The nodes the frames drew are let go of, and nothing keeps them. Their React roots are taken apart as they
        // fall asleep, so it waits for what React lets go of after. Counting the window's nodes instead tied now and
        // then, since the rest of the window changes too (PAR-1140).
        const out = await frames()
        expect(out.drawn).toBe(out.all - out.asleep)
        await expect.poll(keptAsleep, { timeout: 15_000, interval: 500 }).toEqual([])
      } finally {
        await letGo()
      }

      expect(await frameSizes()).toEqual(framed)

      // Back in view, its frames draw again, and the boards out of view stay asleep.
      await app.show("Members", 1)
      expect(await drawn("Members")).toBe(true)
      expect(await app.size("Members", "ada")).toBeDefined()
      expect((await frames()).asleep).toBeGreaterThan(0)
      expect(await boards()).toEqual(sizes)
      expect(await frameSizes()).toEqual(framed)
    }
  )

  it("draws the selected board's frames", { timeout: 180_000 }, async () => {
    await zoomOut()
    expect(await drawn("Members")).toBe(false)
    // Zoomed this far out, Members' board is too narrow on screen to show its title.
    await app.selectDesignInLayers("Members")
    await expect.poll(() => drawn("Members")).toBe(true)
    // Selecting nothing lets it sleep again.
    await app.page.keyboard.press("Escape")
    await expect.poll(() => drawn("Members")).toBe(false)
  })
})
