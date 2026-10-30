import type { DesignNode, NodeStyle } from "@parity/core"
import { type Browser, chromium, type Page } from "playwright-core"
import { expect, inject } from "vitest"
import type * as frameModule from "../src/renderer/frame.ts"
import type { Selection } from "../src/renderer/selection.ts"
import type { ProjectSession, Workspace } from "../src/renderer/workspace.ts"

/** A box on screen, in the window's CSS pixels. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** What the tests read in the page: the open project's session, and its designs and frames by name. */
interface PageHelpers {
  session(): ProjectSession
  key(design: string): string
  node(key: string, id: string): DesignNode | undefined
  /** The ids from the design's root down to the layer, the root first and the layer last. */
  path(key: string, id: string): string[]
  /** A design's main frame, or the frame of one of its modes, such as desktop-dark. */
  frame(key: string, mode?: string): HTMLElement
  box(key: string, id: string, mode?: string): Box | undefined
  /** Each element a layer draws at its top level, such as both roots of a fragment. */
  boxes(key: string, id: string): Box[]
  size(key: string, id: string): { width: number; height: number } | undefined
  /**
   * What a layout draws in the design's main frame, in order: each child layer's id, `hidden:<id>` for one that isn't
   * drawn, and `copy` for the faded copy a drag shows where layers would land.
   */
  drawn(key: string, id: string): string[]
  /** The page's stand-in for the system clipboard, which is never read or written. */
  clipboard: { text: string }
  /** How many times the window's page has scrolled and been put back (see `install`). */
  scrolls: { count: number }
}

declare global {
  interface Window {
    e2e?: PageHelpers
    e2eModules?: { workspace: Workspace; frames: typeof frameModule }
  }
}

/**
 * The app's own modules, as Vite serves them to the page. It's a string, since the test runner rewrites `import()` in
 * functions, and functions given to `page.evaluate` run in the page as they're written.
 */
const importModules = `Promise.all([import("/workspace.ts"), import("/frame.ts")]).then(([workspace, frames]) => {
  window.e2eModules = { workspace: workspace.workspace, frames }
})`

export const center = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

/** Matches a box within half a pixel each way, as what's drawn over a layer is measured separately from it. */
export const about = (box: Box) => ({
  x: expect.closeTo(box.x, 0),
  y: expect.closeTo(box.y, 0),
  width: expect.closeTo(box.width, 0),
  height: expect.closeTo(box.height, 0)
})

/**
 * The running copy of Parity, as a person at its window sees it: real pointer and keyboard input through the DevTools
 * protocol, and what the canvas and panels show. State is read from the page to check what happened, never to make it
 * happen, apart from putting a design in view and putting everything back between tests.
 */
export class App {
  readonly page: Page
  private readonly browser: Browser
  /** How many times the page had scrolled when this file connected. */
  private scrolled = 0

  private constructor(browser: Browser, page: Page) {
    this.browser = browser
    this.page = page
  }

  /** Connects to the copy global-setup.ts started, and readies the page for driving. */
  static async connect(): Promise<App> {
    const { uiPort, debugPort } = inject("app")
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`)
    const page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find(
        (candidate) => candidate.url().startsWith(`http://localhost:${uiPort}`) && !candidate.url().includes("render")
      )
    if (!page) throw new Error(`No Parity window on port ${uiPort}`)
    const app = new App(browser, page)
    await page.waitForSelector(".container-view", { state: "attached", timeout: 180_000 })
    await page.evaluate(settled)
    await page.evaluate(importModules)
    await page.evaluate(install)
    app.scrolled = await page.evaluate(() => window.e2e!.scrolls.count)
    await page.bringToFront()
    await app.reset()
    return app
  }

  async close(): Promise<void> {
    const scrolled = (await this.page.evaluate(() => window.e2e!.scrolls.count)) - this.scrolled
    if (scrolled > 0) {
      console.warn(`The window's page scrolled ${scrolled === 1 ? "once" : `${scrolled} times`}, and was put back`)
    }
    // Only the connection closes; the app keeps running for the next file.
    await this.browser.close()
  }

  /**
   * Puts everything back as the project opened: every change undone, nothing selected, Move and select, no menu or
   * field open, Layers on the left, and an empty clipboard.
   */
  async reset(): Promise<void> {
    await this.page.mouse.up()
    for (let press = 0; press < 3; press++) await this.page.keyboard.press("Escape")
    await this.page.evaluate(() => {
      const e2e = window.e2e!
      const { store, selection, editor } = e2e.session()
      editor?.stopCameraAnimation()
      while (store.getHistory().canUndo) store.undo()
      selection.setTool("select")
      selection.set({})
      selection.setHover(undefined)
      e2e.clipboard.text = ""
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      document.scrollingElement?.scrollTo(0, 0)
    })
    await this.page.keyboard.press("Alt+1")
    const unsaved = await this.unsaved()
    if (unsaved.length > 0) throw new Error(`Undoing everything left changes in ${unsaved.join(", ")}`)
  }

  // Reading what happened.

  key(design: string): Promise<string> {
    return this.page.evaluate((design) => window.e2e!.key(design), design)
  }

  node(design: string, id: string): Promise<DesignNode | undefined> {
    return this.page.evaluate(
      ([design, id]) => {
        const e2e = window.e2e!
        return e2e.node(e2e.key(design), id)
      },
      [design, id] as const
    )
  }

  /** A layer's children, by id. */
  async children(design: string, id: string): Promise<string[]> {
    const node = await this.node(design, id)
    return node?.type === "layout" ? node.children.map((child) => child.id) : []
  }

  async style(design: string, id: string): Promise<NodeStyle> {
    return (await this.node(design, id))?.style ?? {}
  }

  selection(): Promise<Selection> {
    return this.page.evaluate(() => window.e2e!.session().selection.get())
  }

  hovered(): Promise<string | undefined> {
    return this.page.evaluate(() => window.e2e!.session().selection.getHover()?.node)
  }

  tool(): Promise<string> {
    return this.page.evaluate(() => window.e2e!.session().selection.getTool())
  }

  undoLabel(): Promise<string | undefined> {
    return this.page.evaluate(() => window.e2e!.session().store.getHistory().undoLabel)
  }

  unsaved(): Promise<string[]> {
    return this.page.evaluate(() => window.e2e!.session().store.unsavedPaths())
  }

  designs(): Promise<{ key: string; name: string; position: Point }[]> {
    return this.page.evaluate(() =>
      window
        .e2e!.session()
        .store.getEntries()
        .map((entry) => ({ key: entry.key, name: entry.container.name, position: entry.container.position }))
    )
  }

  camera(): Promise<{ x: number; y: number; z: number }> {
    return this.page.evaluate(() => {
      const { x, y, z } = window.e2e!.session().editor!.getCamera()
      return { x, y, z }
    })
  }

  /** A layer's size as its design lays it out, whatever the zoom: its first element's. */
  size(design: string, id: string): Promise<{ width: number; height: number } | undefined> {
    return this.page.evaluate(
      ([design, id]) => {
        const e2e = window.e2e!
        return e2e.size(e2e.key(design), id)
      },
      [design, id] as const
    )
  }

  /** Where a layer is drawn in its design's main frame, or in the frame of a mode. */
  async box(design: string, id: string, mode?: string): Promise<Box> {
    const box = await this.page.evaluate(
      ([design, id, mode]) => {
        const e2e = window.e2e!
        return e2e.box(e2e.key(design), id, mode)
      },
      [design, id, mode] as const
    )
    if (!box) throw new Error(`${id} isn't drawn in ${design}`)
    return box
  }

  boxes(design: string, id: string): Promise<Box[]> {
    return this.page.evaluate(
      ([design, id]) => {
        const e2e = window.e2e!
        return e2e.boxes(e2e.key(design), id)
      },
      [design, id] as const
    )
  }

  drawn(design: string, id: string): Promise<string[]> {
    return this.page.evaluate(
      ([design, id]) => {
        const e2e = window.e2e!
        return e2e.drawn(e2e.key(design), id)
      },
      [design, id] as const
    )
  }

  /** The outlines the canvas draws over layers, selected or hovered. */
  outlines(): Promise<Box[]> {
    return this.page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".z-\\[300\\] > div")]
        .filter((element) => element.style.outline !== "")
        .map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect()
          return { x, y, width, height }
        })
    )
  }

  /** What the canvas writes beside the selection: the layer's name and its size. */
  labels(): Promise<string[]> {
    return this.page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".z-\\[300\\] > div")]
        .filter((element) => element.style.outline === "" && element.textContent)
        .map((element) => element.textContent ?? "")
    )
  }

  clipboard(): Promise<string> {
    return this.page.evaluate(() => window.e2e!.clipboard.text)
  }

  async setClipboard(text: string): Promise<void> {
    await this.page.evaluate((text) => (window.e2e!.clipboard.text = text), text)
  }

  // Setting up.

  /**
   * Puts a design in view at a zoom by moving the camera directly, as where the camera starts isn't what the tests are
   * about: with a layer, that layer in the middle of the canvas, as the main frame or a mode's draws it; without, the
   * main frame's top left corner near the canvas's, with room above the board for its title.
   */
  async show(design: string, zoom: number, layer?: string, mode?: string): Promise<void> {
    await this.page.evaluate(
      ([design, zoom, layer, mode]) => {
        const e2e = window.e2e!
        const editor = e2e.session().editor!
        const key = e2e.key(design)
        // A zoom still animating from the test before, such as N's, would carry on past this.
        editor.stopCameraAnimation()
        // The canvas as it's drawn, which tldraw draws the page into at the camera's offset and zoom.
        const area = editor.getContainer().getBoundingClientRect()
        const camera = editor.getCamera()
        const toPage = (x: number, y: number) => ({
          x: (x - area.left) / camera.z - camera.x,
          y: (y - area.top) / camera.z - camera.y
        })
        const box = layer ? e2e.box(key, layer, mode) : undefined
        if (layer && !box) throw new Error(`${layer} isn't drawn in ${design}`)
        const frame = e2e.frame(key).getBoundingClientRect()
        // A point on the page, and where in the canvas it should be.
        const [page, screen] = box
          ? [toPage(box.x + box.width / 2, box.y + box.height / 2), { x: area.width / 2, y: area.height / 2 }]
          : [toPage(frame.left, frame.top), { x: 64, y: 140 }]
        editor.setCamera({ x: screen.x / zoom - page.x, y: screen.y / zoom - page.y, z: zoom }, { immediate: true })
      },
      [design, zoom, layer, mode] as const
    )
    await this.settle(design)
  }

  /** Waits until the camera and a design's main frame stop moving or changing, over a few frames. */
  async settle(design: string): Promise<void> {
    await this.page.evaluate(async (design) => {
      const e2e = window.e2e!
      const key = e2e.key(design)
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
      let last = ""
      for (let still = 0, tries = 0; still < 4 && tries < 200; tries++) {
        await frame()
        const { x, y, width, height } = e2e.frame(key).getBoundingClientRect()
        const camera = e2e.session().editor!.getCamera()
        const elements = e2e.frame(key).shadowRoot?.querySelectorAll("*").length
        const now = `${x},${y},${width},${height},${elements},${camera.x},${camera.y},${camera.z}`
        still = now === last ? still + 1 : 0
        last = now
      }
    }, design)
  }

  // Gestures. A press that tldraw sees (a title, a board's or a frame's background, the canvas) is kept apart from the
  // one before by more than a double-click's time: the DevTools protocol says how many clicks a press is, where tldraw
  // counts them by time itself, so two presses close together would be one click to the canvas and a double-click to
  // tldraw, which a person's mouse never sends. Presses on layers never reach tldraw, so they needn't wait.

  private lastPress = 0

  private async apart(): Promise<void> {
    const wait = this.lastPress + 500 - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  }

  private pressed(): void {
    this.lastPress = Date.now()
  }

  async click(point: Point, modifiers: ("Shift" | "Control" | "Alt")[] = []): Promise<void> {
    await this.apart()
    for (const key of modifiers) await this.page.keyboard.down(key)
    await this.page.mouse.click(point.x, point.y)
    for (const key of modifiers) await this.page.keyboard.up(key)
    this.pressed()
  }

  /** A right-click, which tldraw follows too, so it's kept apart like a press tldraw sees. */
  async rightClick(point: Point): Promise<void> {
    await this.apart()
    await this.page.mouse.click(point.x, point.y, { button: "right" })
    this.pressed()
  }

  /** Selects a design by clicking its title, which must be in view. */
  async selectDesign(design: string): Promise<void> {
    const key = await this.key(design)
    // The design's name is the title bar's first button; the state and modes menus follow it.
    const title = this.page
      .locator(".design-title > div > button")
      .filter({ hasText: new RegExp(`^${escape(design)}$`) })
    // Titles follow the zoom a frame after the camera moves.
    let box = await title.boundingBox()
    for (let tries = 0; tries < 10; tries++) {
      await this.frames(2)
      const again = await title.boundingBox()
      if (box && again && Math.abs(again.x - box.x) < 0.5 && Math.abs(again.y - box.y) < 0.5) break
      box = again
    }
    if (!box) throw new Error(`${design}'s title isn't drawn`)
    await this.click(center(box))
    if (!(await until(async () => JSON.stringify(await this.selection()) === JSON.stringify({ design: key })))) {
      throw new Error(`Clicking ${design}'s title selected ${JSON.stringify(await this.selection())}`)
    }
  }

  /**
   * Selects a layer the way a person does since PAR-163: a click on it selects its top-level layer in the design, and
   * each double-click at the same point goes one level deeper, until it's the one selected. A layer of the design that's
   * already selected is left first with Escape, which selects its parent, since a click would pick among its siblings.
   * The point is the layer's middle unless given, away from a selected layer's edge, where its resize handles take the
   * press. Every test selects layers through here, so a change to clicking inside a design is made here alone.
   */
  async selectLayer(design: string, id: string, at?: Point): Promise<void> {
    const key = await this.key(design)
    const path = await this.page.evaluate(([key, id]) => window.e2e!.path(key, id), [key, id] as const)
    if (path.length < 2) throw new Error(`${id} isn't a layer of ${design}`)
    const point = at ?? center(await this.box(design, id))
    for (let level = 0; level < path.length; level++) {
      const { design: selected, node } = await this.selection()
      if (selected !== key || !node) break
      await this.page.keyboard.press("Escape")
    }
    await this.page.mouse.click(point.x, point.y)
    for (let level = 1; ; level++) {
      if (!(await until(async () => (await this.selection()).node === path[level]))) {
        const { node } = await this.selection()
        throw new Error(`At ${point.x},${point.y} in ${design}, ${node} was selected where ${path[level]} should be`)
      }
      if (path[level] === id) return
      await this.page.mouse.dblclick(point.x, point.y)
    }
  }

  /**
   * Adds a layer to the selection, or takes it out, with Ctrl and a click on its row in Layers, opening the rows above
   * it. On the canvas, Shift and a click pick among the selected layer's siblings, so another part of the design is
   * added from Layers.
   */
  async toggleInLayers(design: string, id: string): Promise<void> {
    const key = await this.key(design)
    const path = await this.page.evaluate(([key, id]) => window.e2e!.path(key, id), [key, id] as const)
    // Show Layers, whichever panel the left side had open.
    await this.page.keyboard.press("Alt+1")
    const row = (layer: string) => this.page.locator(`[id="layer-${layer === key ? key : `${key}/${layer}`}"]`)
    for (const ancestor of [key, ...path.slice(0, -1)]) {
      if ((await row(ancestor).getAttribute("aria-expanded")) === "false") {
        await row(ancestor).getByRole("button", { name: "Expand" }).click()
      }
    }
    await row(id).scrollIntoViewIfNeeded()
    const box = await row(id).boundingBox()
    if (!box) throw new Error(`${id}'s row in Layers isn't drawn`)
    await this.click(center(box), ["Control"])
  }

  /**
   * Presses at one point and moves through others in small steps, as a hand does, then releases. `during` runs before
   * the release, to look at the drag in progress or press a key.
   */
  async drag<T>(from: Point, to: Point | Point[], during?: () => Promise<T>): Promise<T | undefined> {
    await this.apart()
    await this.page.mouse.move(from.x, from.y)
    await this.page.mouse.down()
    let at = from
    for (const point of Array.isArray(to) ? to : [to]) {
      const steps = Math.max(4, Math.round(Math.hypot(point.x - at.x, point.y - at.y) / 8))
      await this.page.mouse.move(point.x, point.y, { steps })
      at = point
    }
    // The canvas measures and previews once a frame.
    await this.frames(2)
    const seen = during ? await during() : undefined
    await this.page.mouse.up()
    this.pressed()
    return seen
  }

  /** Waits for the page to draw a few frames. */
  async frames(count = 1): Promise<void> {
    await this.page.evaluate(async (count) => {
      for (let index = 0; index < count; index++) await new Promise((resolve) => requestAnimationFrame(resolve))
    }, count)
  }
}

/**
 * Runs in the page: waits until the frames have mounted, loaded their components and sized themselves, when nothing
 * more is drawn in them for three seconds, as `pnpm perf` waits. Quick once they have.
 */
async function settled(): Promise<void> {
  const count = () =>
    [...document.querySelectorAll("[data-frame]")].reduce(
      (total, host) => total + (host.shadowRoot?.querySelectorAll("*").length ?? 0),
      0
    )
  let last = -1
  for (let still = 0; still < 6;) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    const now = count()
    still = now === last ? still + 1 : 0
    last = now
  }
  await document.fonts.ready
}

/** Whether `check` comes true within a few seconds, trying every 50ms. */
async function until(check: () => Promise<boolean>, timeout = 5000): Promise<boolean> {
  for (const deadline = Date.now() + timeout; Date.now() < deadline;) {
    if (await check()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return check()
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Runs in the page: sets up `window.e2e` from the app's modules, and replaces the system clipboard with one of the
 * page's own, so a test never reads or writes the person's clipboard. Copy, cut and paste events are stopped too, so
 * nothing the browser would do by itself reaches it.
 */
function install(): void {
  if (window.e2e) return
  const { workspace, frames } = window.e2eModules!
  const session = () => {
    const current = workspace.getActive()?.session
    if (!current) throw new Error("No project is open")
    return current
  }
  const entry = (key: string) => {
    const found = session().store.getEntry(key)
    if (!found) throw new Error(`No design ${key}`)
    return found
  }
  const inside = (node: DesignNode): DesignNode[] =>
    node.type === "layout" ? node.children : node.type === "component" ? Object.values(node.slots ?? {}).flat() : []
  const path = (node: DesignNode, id: string): DesignNode[] | undefined => {
    if (node.id === id) return [node]
    for (const child of inside(node)) {
      const found = path(child, id)
      if (found) return [node, ...found]
    }
    return undefined
  }
  const clipboard = { text: "" }
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        clipboard.text = text
      },
      readText: async () => clipboard.text,
      read: async () => [],
      write: async () => undefined
    }
  })
  for (const type of ["copy", "cut", "paste"]) document.addEventListener(type, (event) => event.preventDefault(), true)
  // The window's page is taller than the window while Layers is scrolled, since a group heading's button is placed
  // outside its scroller, so the page scrolls when something below the window is focused or revealed. tldraw doesn't
  // notice, and the pointer then lands off by as much on the canvas. Until that's fixed, the page is put back at once.
  const scrolls = { count: 0 }
  document.addEventListener(
    "scroll",
    (event) => {
      const page = document.scrollingElement
      if (event.target !== document || !page || (page.scrollTop === 0 && page.scrollLeft === 0)) return
      scrolls.count++
      page.scrollTo(0, 0)
    },
    true
  )
  window.e2e = {
    session,
    key: (design) => {
      const found = session()
        .store.getEntries()
        .find((candidate) => candidate.container.name === design)
      if (!found) throw new Error(`No design named ${design}`)
      return found.key
    },
    node: (key, id) => path(entry(key).container.root, id)?.at(-1),
    path: (key, id) => (path(entry(key).container.root, id) ?? []).map((node) => node.id),
    frame: (key, mode) => {
      const host = frames
        .findFrames(document, key)
        .find((candidate) => (mode ? candidate.dataset.mode === mode : candidate.dataset.primary === "true"))
      if (!host) throw new Error(`${key} has no ${mode ?? "main"} frame drawn`)
      return host
    },
    box: (key, id, mode) => {
      const rect = frames.nodeBox(window.e2e!.frame(key, mode), id)
      return rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    },
    boxes: (key, id) =>
      frames.findNodeElements(window.e2e!.frame(key), id).map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return { x, y, width, height }
      }),
    size: (key, id) => {
      const element = frames.findNodeElement(window.e2e!.frame(key), id)
      return element && { width: element.offsetWidth, height: element.offsetHeight }
    },
    drawn: (key, id) => {
      const host = window.e2e!.frame(key)
      const parent = frames.findNodeElement(host, id)
      return [...(parent?.children ?? [])].map((child) => {
        if (child instanceof HTMLElement && child.dataset.dropPreview !== undefined) return "copy"
        const layer = frames.nodeOfElement(host, child) ?? "?"
        return getComputedStyle(child).display === "none" ? `hidden:${layer}` : layer
      })
    },
    clipboard,
    scrolls
  }
  document.title = "Parity (pnpm test:app is driving this copy, which closes by itself)"
}
