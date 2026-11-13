import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { type DesignNode, lengthSteps, type NodeStyle } from "@parity-app/core"
import type { Selection } from "@parity-app/editor"
import { type Browser, chromium, type Locator, type Page } from "playwright-core"
import { expect, inject } from "vite-plus/test"
import type { consoleLog } from "../src/renderer/console-store.ts"
import type * as frameModule from "../src/renderer/frame.ts"
import type { ProjectSession, Workspace } from "../src/renderer/workspace.ts"
import { pageSize } from "./launch.ts"

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
  /** How many times the window's page has scrolled since the last test ended (see `install` and `reset`). */
  scrolls: { count: number }
  /** The tooltips open now: what each says, where it's drawn, and the elements showing one. */
  tooltips(): string[]
  /** What the last press met, for a failure to quote: the element it went to, and the tooltips open as it did. */
  pressed: { at?: Point; target?: string; tooltips?: string[] }
}

declare global {
  interface Window {
    e2e?: PageHelpers
    e2eModules?: { workspace: Workspace; frames: typeof frameModule; consoleLog: typeof consoleLog }
  }
}

/**
 * The app's own modules, as Vite serves them to the page. It's a string, since the test runner rewrites `import()` in
 * functions, and functions given to `page.evaluate` run in the page as they're written.
 */
const importModules = `Promise.all([import("/workspace.ts"), import("/frame.ts"), import("/console-store.ts")]).then(
  ([workspace, frames, store]) => {
    window.e2eModules = { workspace: workspace.workspace, frames, consoleLog: store.consoleLog }
  }
)`

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

  private constructor(browser: Browser, page: Page) {
    this.browser = browser
    this.page = page
  }

  /**
   * Connects to the copy global-setup.ts started, and readies the page for driving. Each step is written to stderr as it
   * starts, and a failure names the step it was on and quotes the app's last output: a hook that times out says neither,
   * and a run cut short by the job's time limit never prints its errors at all.
   */
  static async connect(): Promise<App> {
    const { uiPort, debugPort, log } = inject("app")
    // Once one file couldn't connect, the rest fail at once with its reason, rather than each waiting it out: a failed
    // hook skips a file's tests rather than failing them, so `bail` doesn't stop the run.
    const failed = `${log}.connect-failed`

    if (existsSync(failed)) {
      throw new Error(`An earlier file couldn't connect to Parity: ${readFileSync(failed, "utf8")}`)
    }

    const started = Date.now()
    let step = "connecting over the DevTools protocol"
    let shown: Page | undefined
    const errors: string[] = []

    const report = (next: string) => {
      step = next
      process.stderr.write(`[connect ${((Date.now() - started) / 1000).toFixed(1)}s] ${step}\n`)
    }

    try {
      report(step)
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`)

      const page = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find(
          (candidate) => candidate.url().startsWith(`http://localhost:${uiPort}`) && !candidate.url().includes("render")
        )

      if (!page) {
        throw new Error(`No Parity window on port ${uiPort}`)
      }

      shown = page
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text().slice(0, 300))
        }
      })
      page.on("pageerror", (error) => errors.push(error.message.slice(0, 300)))
      const app = new App(browser, page)
      report("checking the window's size")
      // Every test is written for this page size: a smaller screen shrinks the window, and clicks land under panels.
      const size = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))

      if (size.width < pageSize.width || size.height < pageSize.height) {
        throw new Error(
          `the page is ${size.width}x${size.height}, smaller than the ${pageSize.width}x${pageSize.height} the tests are written for: the screen is too small`
        )
      }

      report("waiting for the canvas")
      await page.waitForSelector(".container-view", { state: "attached", timeout: 120_000 })
      report("waiting for the frames to settle")
      await withTimeout(page.evaluate(settled), 60_000)
      report("importing the app's modules")
      await withTimeout(page.evaluate(importModules), 30_000)
      report("installing the test hooks")
      await page.evaluate(install)
      await page.bringToFront()
      report("putting the app back as it opened")
      await withTimeout(app.reset(), 30_000)
      report("ready")

      return app
    } catch (error) {
      let output = ""

      try {
        output = readFileSync(log, "utf8").split("\n").slice(-40).join("\n")
      } catch {
        output = "(the app's output couldn't be read)"
      }

      // What the window shows: on CI there's no screen to look at.
      const showing = shown
        ? await withTimeout(
            shown.evaluate(() =>
              JSON.stringify({
                url: location.href,
                designs: document.querySelectorAll(".container-view").length,
                text: document.body?.innerText.replace(/\s+/g, " ").slice(0, 600)
              })
            ),
            5000
          ).catch((cause: unknown) => `(the page didn't answer: ${String(cause)})`)
        : "(no page)"

      const reason = `Couldn't connect to Parity while ${step}, after ${Math.round((Date.now() - started) / 1000)}s: ${
        error instanceof Error ? error.message.split("\n")[0] : String(error)
      }`

      writeFileSync(failed, reason)
      throw new Error(
        `Couldn't connect to Parity while ${step}, after ${Math.round((Date.now() - started) / 1000)}s: ${
          error instanceof Error ? error.message : String(error)
        }\nThe window shows: ${showing}\nIts errors (${errors.length}): ${errors.slice(-15).join("\n  ")}\nThe app's last output:\n${output}`
      )
    }
  }

  async close(): Promise<void> {
    // Only the connection closes; the app keeps running for the next file.
    await this.browser.close()
  }

  /**
   * Puts everything back as the project opened: every change undone, nothing selected, Move and select, no menu or
   * field open, Layers on the left, and an empty clipboard. It fails the test that ran before it if the window's page
   * scrolled during it, since the page never should (PAR-424): tldraw doesn't notice, so the canvas takes every click
   * after it as somewhere else.
   */
  async reset(): Promise<void> {
    const scrolled = await this.page.evaluate(() => {
      const page = document.scrollingElement
      const seen = { count: window.e2e!.scrolls.count, top: page?.scrollTop ?? 0, left: page?.scrollLeft ?? 0 }
      window.e2e!.scrolls.count = 0
      // Put back only so the tests after this one start as they should; this one fails below.
      page?.scrollTo(0, 0)

      return seen
    })

    await this.page.mouse.up()

    // A test that failed while holding a modifier would otherwise leave it held for the tests after it.
    for (const key of ["Shift", "Control", "Alt", "Meta"]) {
      await this.page.keyboard.up(key)
    }

    for (let press = 0; press < 3; press++) {
      await this.page.keyboard.press("Escape")
    }

    await this.page.evaluate(() => {
      const e2e = window.e2e!
      const { store, selection, editor } = e2e.session()
      editor?.stopCameraAnimation()

      while (store.getHistory().canUndo) {
        store.undo()
      }

      selection.setTool("select")
      selection.set({})
      selection.setHover(undefined)
      e2e.clipboard.text = ""

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    })

    // What a test's clicks made the designs write stays in main's log and badges their boards, which adds a control to
    // each title (PAR-147), so every test starts with the console empty.
    const cleared = await this.page.evaluate(async () => {
      const at = Date.now()
      await window.canvasHost.console.clear(window.e2e!.session().info.guestUrl)

      return at
    })

    const badges = this.page.getByRole("button", { name: / in the console$/ })

    if (!(await until(async () => (await badges.count()) === 0))) {
      throw new Error(`The console's badges stayed: ${await this.badged(badges, cleared)}`)
    }

    await this.page.keyboard.press("Alt+1")
    const unsaved = await this.unsaved()

    if (unsaved.length > 0) {
      throw new Error(`Undoing everything left changes in ${unsaved.join(", ")}`)
    }

    if (scrolled.count > 0 || scrolled.top !== 0 || scrolled.left !== 0) {
      const times = scrolled.count === 1 ? "once" : `${scrolled.count} times`
      throw new Error(
        `The window's page scrolled ${times}, to ${scrolled.left},${scrolled.top}, and should never scroll`
      )
    }
  }

  /**
   * What keeps each board's badge after the console was cleared at `cleared`: the badges, then each error and warning
   * left, with where it was written, how long after the clear it first came, or that it's a layer failing to draw.
   */
  private async badged(badges: Locator, cleared: number): Promise<string> {
    const labels = await badges.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))

    const left = await this.page.evaluate((cleared) => {
      const messages = window.e2eModules!.consoleLog(window.e2e!.session().id).get()

      return messages
        .filter((message) => message.level === "error" || message.level === "warning")
        .map((message) => {
          const frames = (message.frames ?? []).map((frame) => `${frame.state}/${frame.mode}`).join(", ")

          const when = message.failure
            ? "failing to draw"
            : `${message.where}, ${message.count}x, first ${message.first - cleared}ms after the clear`

          return `${message.level} in ${message.design ?? "no design"}${frames ? ` (${frames})` : ""}, ${when}: ${message.text.slice(0, 400)}`
        })
    }, cleared)

    return [labels.join("; "), ...left].join("\n  ")
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

  /** A layer's width or height in steps of the spacing scale; nothing when it's unset or isn't stored as steps. */
  async steps(design: string, id: string, axis: "width" | "height"): Promise<number | undefined> {
    return lengthSteps((await this.style(design, id))[axis])
  }

  selection(): Promise<Selection> {
    return this.page.evaluate(() => window.e2e!.session().selection.get())
  }

  /**
   * What a click at a point met, for a failure to quote: the elements there, top first, inside a frame's shadow root
   * too, and the selection, tool, hovered layer, camera, focus and open tooltips at the time, with what the last press
   * went to and the tooltips open as it did. The window can't be seen on CI.
   */
  async describe(point: Point): Promise<string> {
    const seen = await this.page.evaluate((point) => {
      const name = (element: Element) => {
        const classes = [...element.classList].slice(0, 3).join(".")

        const data = [...element.attributes]
          .filter((attribute) => attribute.name.startsWith("data-"))
          .slice(0, 2)
          .map((attribute) => `[${attribute.name}=${attribute.value.slice(0, 24)}]`)
          .join("")

        return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}${data}`
      }

      const stack = document.elementsFromPoint(point.x, point.y).slice(0, 6).map(name)
      const host = document.elementsFromPoint(point.x, point.y).find((element) => element.shadowRoot)
      const inner = host?.shadowRoot?.elementsFromPoint(point.x, point.y).slice(0, 3).map(name) ?? []
      const { selection, editor } = window.e2e!.session()
      const { frames } = window.e2eModules!
      const design = selection.get().design

      // What the canvas's own hit test finds at the point, in each of the selected design's frames holding it, which
      // the DOM's stack can't show: frames are inert, so the stack passes through them.
      const layers = (design ? frames.findFrames(document, design) : [])
        .filter((host) => {
          const rect = host.getBoundingClientRect()

          return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
        })
        .map((host) => ({
          mode: host.dataset.mode,
          primary: host.dataset.primary,
          asleep: !!host.closest("[data-asleep]"),
          under: frames.nodesAt(host, point)
        }))

      return {
        stack,
        inner,
        layers,
        selection: selection.get(),
        tool: selection.getTool(),
        hover: selection.getHover(),
        camera: editor ? { state: editor.getCameraState(), ...editor.getCamera() } : undefined,
        focus: document.activeElement ? name(document.activeElement) : undefined,
        tooltips: window.e2e!.tooltips(),
        pressed: window.e2e!.pressed
      }
    }, point)

    return JSON.stringify(seen)
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

  designs(): Promise<{ key: string; name: string; kind: string; position: Point }[]> {
    return this.page.evaluate(() =>
      window
        .e2e!.session()
        .store.getEntries()
        .map((entry) => ({
          key: entry.key,
          name: entry.container.name,
          kind: entry.container.kind ?? "screen",
          position: entry.container.position
        }))
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

    if (!box) {
      throw new Error(`${id} isn't drawn in ${design}`)
    }

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
      [...document.querySelectorAll<HTMLElement>(".z-\\[300\\] > div")].flatMap((element) => {
        if (element.style.outline === "") {
          return []
        }

        const { x, y, width, height } = element.getBoundingClientRect()

        return [{ x, y, width, height }]
      })
    )
  }

  /** What the canvas writes beside the selection: the layer's name and its size. */
  labels(): Promise<string[]> {
    return this.page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".z-\\[300\\] > div")].flatMap((element) =>
        element.style.outline === "" && element.textContent ? [element.textContent] : []
      )
    )
  }

  /**
   * The cursor the window shows at a point: what the element the browser finds there asks for. Frames take no pointer
   * events outside Interact, so over a design that's the canvas's own element, or whatever a gesture puts over it.
   */
  cursorAt(point: Point): Promise<string> {
    return this.page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y)

      return element ? getComputedStyle(element).cursor : ""
    }, point)
  }

  /** The resize handles drawn around the selection, in the window's pixels. */
  handles(): Promise<Box[]> {
    return this.page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".resize-handle")].map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect()

        return { x, y, width, height }
      })
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
    // A layer is found where it's drawn, so the design comes into view first at 100%, where its frames wake even if
    // they slept zoomed far out, and only then moves to the zoom asked for.
    if (layer) {
      await this.show(design, 1)
    }

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

        if (layer && !box) {
          throw new Error(`${layer} isn't drawn in ${design}`)
        }

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

  /**
   * Puts an empty part of the canvas in view at 100%, below every design and note, by moving the camera directly as
   * `show` does. Returns the middle of the canvas on screen, and the point on the page there.
   */
  async showEmptyCanvas(): Promise<{ screen: Point; page: Point }> {
    const shown = await this.page.evaluate(() => {
      const editor = window.e2e!.session().editor!
      editor.stopCameraAnimation()
      const bounds = editor.getCurrentPageBounds()
      const page = { x: Math.round(bounds?.minX ?? 0), y: Math.round((bounds?.maxY ?? 0) + 2000) }
      const area = editor.getContainer().getBoundingClientRect()
      editor.setCamera({ x: area.width / 2 - page.x, y: area.height / 2 - page.y, z: 1 }, { immediate: true })

      return { screen: { x: area.left + area.width / 2, y: area.top + area.height / 2 }, page }
    })

    // While the camera moves, tldraw lays a blocker over the canvas, which would take what's dropped.
    const resting = () => this.page.evaluate(() => window.e2e!.session().editor!.getCameraState() === "idle")

    if (!(await until(resting))) {
      throw new Error("The camera didn't come to rest")
    }

    // Chromium drag events use integer client coordinates. Measure the actual drop point after the camera rests,
    // rather than expecting a fractional viewport centre to round-trip through a drag event unchanged.
    const screen = { x: Math.round(shown.screen.x), y: Math.round(shown.screen.y) }

    const page = await this.page.evaluate((screen) => {
      const editor = window.e2e!.session().editor!
      const area = editor.getContainer().getBoundingClientRect()
      const camera = editor.getCamera()

      return {
        x: Math.round((screen.x - area.left) / camera.z - camera.x),
        y: Math.round((screen.y - area.top) / camera.z - camera.y)
      }
    }, screen)

    return { screen, page }
  }

  /**
   * Waits until the camera and a design's main frame stop moving or changing, over a few frames, the zoom has settled so
   * boards have taken their size at it (PAR-655), and its board's frames are drawn where they would wake: frames asleep, as they are once zoomed far out, wake once the camera rests near
   * them above the far line (25% on a 1x screen, and a little past it coming back in), or on the selected board.
   * Components that load on demand have arrived too: until its module loads, one draws nothing and its frame doesn't
   * change, however many frames that takes. A reopened project has a new guest, and its frames sleep on kept bitmaps
   * without drawing, so the first design shown after it loads its components then (PAR-654).
   */
  async settle(design: string): Promise<void> {
    await this.page.evaluate(async (design) => {
      const e2e = window.e2e!
      const key = e2e.key(design)
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

      /** Where the frame and camera are and what the frame holds, and whether the board's frames have still to wake. */
      const look = () => {
        const host = e2e.frame(key)
        const { x, y, width, height } = host.getBoundingClientRect()
        const editor = e2e.session().editor!
        const camera = editor.getCamera()
        const elements = host.shadowRoot?.querySelectorAll("*").length
        const board = host.closest(".container-view")
        const wakes = camera.z > 0.1 * 1.15 || !!board?.hasAttribute("data-live")

        return {
          now: `${x},${y},${width},${height},${elements},${camera.x},${camera.y},${camera.z}`,
          asleep: wakes && !!board?.querySelector("[data-asleep]"),
          // Boards take the size their gutters give at a new zoom only once it settles (PAR-655), which the canvas's
          // efficient zoom says: a few frames and 150 ms after the camera stops, longer than four still frames.
          zooming: editor.getZoomLevel() !== editor.getEfficientZoomLevel()
        }
      }

      let last = ""

      for (let still = 0, tries = 0; still < 4 && tries < 400; tries++) {
        await frame()
        const { now, asleep, zooming } = look()
        still = now === last && !asleep && !zooming ? still + 1 : 0
        last = now

        // Still, it waits for what's loading on demand, which draws as it arrives, and counts again if that changed it.
        if (still === 4) {
          await e2e.session().loaded.guest.loaded?.()

          if (look().now !== last) {
            still = 0
          }
        }
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

    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }

  private pressed(): void {
    this.lastPress = Date.now()
  }

  async click(point: Point, modifiers: ("Shift" | "Control" | "Alt")[] = []): Promise<void> {
    await this.apart()

    for (const key of modifiers) {
      await this.page.keyboard.down(key)
    }

    await this.page.mouse.click(point.x, point.y)

    for (const key of modifiers) {
      await this.page.keyboard.up(key)
    }

    this.pressed()
    await this.frames(2)
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

      if (box && again && Math.abs(again.x - box.x) < 0.5 && Math.abs(again.y - box.y) < 0.5) {
        break
      }

      box = again
    }

    if (!box) {
      throw new Error(`${design}'s title isn't drawn`)
    }

    await this.click(center(box))

    if (!(await until(async () => JSON.stringify(await this.selection()) === JSON.stringify({ design: key })))) {
      throw new Error(
        `Clicking ${design}'s title selected ${JSON.stringify(await this.selection())}. ` +
          `There: ${await this.describe(center(box))}`
      )
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

    if (path.length < 2) {
      throw new Error(`${id} isn't a layer of ${design}`)
    }

    const point = at ?? center(await this.box(design, id))

    for (let level = 0; level < path.length; level++) {
      const { design: selected, node } = await this.selection()

      if (selected !== key || !node) {
        break
      }

      await this.page.keyboard.press("Escape")
    }

    await this.page.mouse.click(point.x, point.y)

    for (let level = 1; ; level++) {
      if (!(await until(async () => (await this.selection()).node === path[level]))) {
        const { node } = await this.selection()

        // Where each is drawn now, which says whether the layout moved since the point was measured.
        const drawnAt = (layer: string | undefined) =>
          layer ? this.box(design, layer).catch(() => undefined) : Promise.resolve(undefined)

        const [expected, got] = await Promise.all([drawnAt(path[level]), drawnAt(node)])
        throw new Error(
          `At ${point.x},${point.y} in ${design}, ${node} was selected where ${path[level]} should be. ` +
            `${path[level]} is drawn at ${JSON.stringify(expected)}, ${node} at ${JSON.stringify(got)}. ` +
            `There: ${await this.describe(point)}`
        )
      }

      // Store selection changes before the overlay measures and paints its resize handles.
      await this.frames(2)

      if (path[level] === id) {
        return
      }

      await this.page.mouse.dblclick(point.x, point.y)
    }
  }

  /**
   * Selects a design with a click on its row in Layers, as a person does zoomed so far out that its board is too narrow
   * on screen to show its title (PAR-151).
   */
  async selectDesignInLayers(design: string): Promise<void> {
    const key = await this.key(design)
    // Show Layers, whichever panel the left side had open.
    await this.page.keyboard.press("Alt+1")
    const row = await this.layersRow(key)
    const box = await row.boundingBox()

    if (!box) {
      throw new Error(`${design}'s row in Layers isn't drawn`)
    }

    await this.click(center(box))

    if (!(await until(async () => JSON.stringify(await this.selection()) === JSON.stringify({ design: key })))) {
      throw new Error(`Clicking ${design}'s row in Layers selected ${JSON.stringify(await this.selection())}`)
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
    const row = (layer: string) => this.layersRow(layer === key ? key : `${key}/${layer}`)

    for (const ancestor of [key, ...path.slice(0, -1)]) {
      const shown = await row(ancestor)

      if ((await shown.getAttribute("aria-expanded")) === "false") {
        await shown.getByRole("button", { name: "Expand" }).click()
      }
    }

    const box = await (await row(id)).boundingBox()

    if (!box) {
      throw new Error(`${id}'s row in Layers isn't drawn`)
    }

    await this.click(center(box), ["Control"])
  }

  /**
   * A row in Layers, by its id (a design's key, or the key and a layer's id), scrolled to with the mouse wheel over the
   * panel as a person scrolls to it: down, then up. The panel draws only the rows in view (PAR-187), so a row out of
   * sight isn't in the page until it's scrolled to.
   */
  private async layersRow(id: string): Promise<Locator> {
    const row = this.page.locator(`[id="layer-${id}"]`)

    const scroller = () =>
      this.page.evaluate(() => {
        const box = document.querySelector("[role=tree][aria-label=Layers]")!.parentElement!
        const rect = box.getBoundingClientRect()

        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, top: box.scrollTop }
      })

    for (const direction of [1, -1]) {
      const { x, y } = await scroller()
      await this.page.mouse.move(x, y)

      for (let step = 0; step < 200 && (await row.count()) === 0; step++) {
        const before = (await scroller()).top
        await this.page.mouse.wheel(0, direction * 400)
        await this.frames(2)

        if ((await scroller()).top === before) {
          break
        }
      }
    }

    if ((await row.count()) === 0) {
      throw new Error(`Layers has no row ${id}, at either end of the panel`)
    }

    await row.scrollIntoViewIfNeeded()

    return row
  }

  /**
   * Presses at one point and moves through others in small steps, as a hand does, then releases. `during` runs before
   * the release, to look at the drag in progress or press a key. Keys in `hold` go down once the press has begun and
   * come up after the release, as Ctrl is held to move freely.
   */
  async drag<T>(
    from: Point,
    to: Point | Point[],
    during?: () => Promise<T>,
    hold: ("Control" | "Shift" | "Alt")[] = []
  ): Promise<T | undefined> {
    await this.apart()
    await this.page.mouse.move(from.x, from.y)
    await this.page.mouse.down()

    for (const key of hold) {
      await this.page.keyboard.down(key)
    }

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

    for (const key of hold) {
      await this.page.keyboard.up(key)
    }

    this.pressed()
    // Let the release finish drawing and committing before the next input, particularly Undo.
    await this.frames(2)

    return seen
  }

  /**
   * Drags files from the system over the window and drops them, as from Explorer or Finder: Chromium's own drag events
   * through the DevTools protocol, carrying the files at `paths`, entering at the first point, moving through the rest
   * and dropping at the last. `during` runs before the drop, to look at the drag in progress; with `cancel`, the drag
   * is called off there instead of dropped.
   */
  async dropFiles<T>(
    paths: string[],
    at: Point | Point[],
    during?: () => Promise<T>,
    cancel = false
  ): Promise<T | undefined> {
    const points = Array.isArray(at) ? at : [at]
    const cdp = await this.page.context().newCDPSession(this.page)
    // Copy, as the system offers files dragged from a folder.
    const data = { items: [], files: paths, dragOperationsMask: 1 }

    const send = (type: "dragEnter" | "dragOver" | "drop" | "dragCancel", point: Point) =>
      cdp.send("Input.dispatchDragEvent", { type, x: point.x, y: point.y, data })

    const last = points.at(-1)!

    try {
      await send("dragEnter", points[0]!)

      for (const point of points) {
        await send("dragOver", point)
        await this.frames(1)
      }

      // A drag held still goes on sending dragover, as the system does, until it's dropped: the canvas stops showing
      // what a drop does once they stop.
      let holding = true

      const held = (async () => {
        while (holding) {
          await send("dragOver", last)
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      })()

      let seen: T | undefined

      try {
        // The canvas measures once a frame, and shows what a drop does the frame after.
        await this.frames(2)
        seen = during ? await during() : undefined
      } finally {
        holding = false
        await held
      }

      await send(cancel ? "dragCancel" : "drop", last)

      return seen
    } finally {
      await cdp.detach()
    }
  }

  /** Waits for the page to draw a few frames. */
  async frames(count = 1): Promise<void> {
    await this.page.evaluate(async (count) => {
      for (let index = 0; index < count; index++) {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }
    }, count)
  }
}

/**
 * Runs in the page: waits until the frames have mounted, loaded their components and sized themselves, when nothing
 * more is drawn in them for three seconds, as `pnpm perf` waits. Quick once they have.
 */
export async function settled(): Promise<void> {
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

/** Rejects when `promise` takes longer than `ms`, so a step that never finishes is named rather than timing out a hook. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${ms / 1000}s`)), ms)
  })

  return Promise.race([promise, late]).finally(() => clearTimeout(timer))
}

/** Whether `check` comes true within a few seconds, trying every 50ms. */
async function until(check: () => Promise<boolean>, timeout = 5000): Promise<boolean> {
  for (const deadline = Date.now() + timeout; Date.now() < deadline;) {
    if (await check()) {
      return true
    }

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
  if (window.e2e) {
    return
  }

  const { workspace, frames } = window.e2eModules!

  const session = () => {
    const current = workspace.getActive()?.session

    if (!current) {
      throw new Error("No project is open")
    }

    return current
  }

  const entry = (key: string) => {
    const found = session().store.getEntry(key)

    if (!found) {
      throw new Error(`No design ${key}`)
    }

    return found
  }

  const inside = (node: DesignNode): DesignNode[] => {
    if (node.type === "layout") {
      return node.children
    }

    return node.type === "component" ? Object.values(node.slots ?? {}).flat() : []
  }

  const path = (node: DesignNode, id: string): DesignNode[] | undefined => {
    if (node.id === id) {
      return [node]
    }

    for (const child of inside(node)) {
      const found = path(child, id)

      if (found) {
        return [node, ...found]
      }
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

  for (const type of ["copy", "cut", "paste"]) {
    document.addEventListener(type, (event) => event.preventDefault(), true)
  }

  // The window's page never scrolls; only panels do. Each time it scrolls away from the top is counted, and fails the
  // test (see `reset`). Putting it back isn't counted, so a test after one that failed this way starts clean.
  const scrolls = { count: 0 }
  document.addEventListener(
    "scroll",
    (event) => {
      const page = document.scrollingElement

      if (event.target === document && page && (page.scrollTop !== 0 || page.scrollLeft !== 0)) {
        scrolls.count++
      }
    },
    true
  )
  // An open tooltip takes a press meant for what it covers, and may have moved on by the time a failure is described
  // (PAR-657), so each press notes what it went to and the tooltips open then.
  const round = (rect: DOMRect) => [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value)).join(",")

  const tag = (element: Element) =>
    `${element.tagName.toLowerCase()}${[...element.classList]
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join("")} "${(element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40)}"`

  const tooltips = () => [
    ...[...document.querySelectorAll<HTMLElement>("[data-slot=tooltip-content]")].map((popup) => {
      const shown = getComputedStyle(popup.parentElement ?? popup).opacity

      return `tooltip "${popup.innerText.replace(/\s+/g, " ").trim().slice(0, 60)}" at ${round(popup.getBoundingClientRect())}, ${
        popup.getAttribute("data-side") ?? "unplaced"
      }, opacity ${shown}`
    }),
    ...[...document.querySelectorAll("[data-base-ui-tooltip-trigger][data-popup-open]")].map(
      (trigger) => `for ${tag(trigger)} at ${round(trigger.getBoundingClientRect())}`
    )
  ]

  const pressed: PageHelpers["pressed"] = {}
  window.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.composedPath()[0]
      pressed.at = { x: event.clientX, y: event.clientY }
      pressed.target = target instanceof Element ? tag(target) : target?.constructor.name
      pressed.tooltips = tooltips()
    },
    true
  )
  window.e2e = {
    session,
    key: (design) => {
      const found = session()
        .store.getEntries()
        .find((candidate) => candidate.container.name === design)

      if (!found) {
        throw new Error(`No design named ${design}`)
      }

      return found.key
    },
    node: (key, id) => path(entry(key).container.root, id)?.at(-1),
    path: (key, id) => (path(entry(key).container.root, id) ?? []).map((node) => node.id),
    frame: (key, mode) => {
      const host = frames
        .findFrames(document, key)
        .find((candidate) => (mode ? candidate.dataset.mode === mode : candidate.dataset.primary === "true"))

      if (!host) {
        throw new Error(`${key} has no ${mode ?? "main"} frame drawn`)
      }

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
        if (child instanceof HTMLElement && child.dataset.dropPreview !== undefined) {
          return "copy"
        }

        const layer = frames.nodeOfElement(host, child) ?? "?"

        return getComputedStyle(child).display === "none" ? `hidden:${layer}` : layer
      })
    },
    clipboard,
    scrolls,
    tooltips,
    pressed
  }
  document.title = "Parity (pnpm test:app is driving this copy, which closes by itself)"
}
