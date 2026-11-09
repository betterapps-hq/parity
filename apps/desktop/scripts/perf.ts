// Measures how the canvas copes with a project: how long it takes to open, the frame rate while the camera zooms and pans
// every frame, where each frame's time goes (style, layout, paint, raster), how long selecting a design takes to settle,
// and memory. It starts its own copy of the app on its own ports and profile, so a copy already running is left alone,
// and stops it after. Opening is timed three ways: the first launch, on a fresh profile; reopening the project in the
// same window; and starting the app again on the same profile, as someone does each day.
// Results go to .inspect/perf/<label>.json; --compare prints another run's numbers beside them.
// Usage: pnpm perf [--label name] [--compare name] [--project root] [--seconds 4] [--viewport 1439x901] [--css "rules"]
//                  [--profile] [--keep] [--open-only] [--runs "zoom, pan"] [--react development] [--soak 60]
//   --react     the window's React build: production, as `pnpm dev:prod` runs it, unless this says development, as
//               `pnpm dev` runs it; each result says which it ran
//   --viewport  the page's size in CSS pixels, the same every run (the default is the first runs' window)
//   --css       adds a stylesheet to the page before measuring, to try an idea without changing the code
//   --profile   samples the page's JavaScript too, and lists the functions that took the most time in each run
//   --keep      leaves the app running afterwards, until the script is stopped
//   --open-only times opening the project and nothing else
//   --runs      only these camera runs, by name (see `motions`), and nothing else once the project has opened
//   --soak      works the project for this many minutes instead, zooming, waking every board, selecting and editing
//               over and over, and reads the window's memory after each round (PAR-683); PARITY_TELEMETRY=all or off
//               chooses whether Session Replay records it
// PARITY_PERF_UI_PORT and PARITY_PERF_DEBUG_PORT choose the copy's ports (5320 and 9340), so two sessions can measure at
// once.
import { type ChildProcess, spawn } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { chromium, type CDPSession, type Page } from "playwright-core"
import type { ProjectSession, Workspace } from "../src/renderer/workspace.ts"
import { type ReactBuild, reactBuild } from "./react-build.ts"

/** What the page holds for these measurements: the open tab's session. */
interface PerfWindow {
  perfSession: ProjectSession
  /** The layer a zoom over a layer outlines, and where the pointer rests on it (see `pointAtLayer`). */
  perfLayer?: { design: string; node: string; mode: string; state: string; point: { x: number; y: number } }
  perfNodeBox: (host: Element, node: string) => DOMRect | undefined
}

const appDir = resolve(import.meta.dirname, "..")
const repoDir = resolve(appDir, "../..")
const outDir = join(repoDir, ".inspect/perf")
// Others can be given, for a second run alongside, such as another session's.
const uiPort = Number(process.env.PARITY_PERF_UI_PORT ?? 5320)
const debugPort = Number(process.env.PARITY_PERF_DEBUG_PORT ?? 9340)
const testRun = `perf-${new Date().toISOString()}`

const args = process.argv.slice(2)
const option = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const label = option("label") ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")
const compare = option("compare")
const project = resolve(option("project") ?? join(repoDir, "examples/shadcn-vite"))
const seconds = Number(option("seconds") ?? 4)
const css = option("css")
const viewport = option("viewport") ?? "1439x901"
const keep = args.includes("--keep")
const openOnly = args.includes("--open-only")
const profiling = args.includes("--profile")
const soakMinutes = option("soak") === undefined ? undefined : Number(option("soak"))
const second = resolve(option("second") ?? join(repoDir, "fixtures/vite7-js"))
// The production build unless asked otherwise, so runs compare with those since PAR-519.
const react = option("react") === undefined ? "production" : reactBuild(option("react"))

/** A function's own time over a run, with `--profile`. */
interface Hot {
  at: string
  ms: number
}

const motions = [
  "zoom",
  "pan",
  "hover",
  "idle",
  "pan at 100%",
  "zoom at 100%",
  "zoom hovering a layer",
  "zoom with a layer selected"
] as const
type Motion = (typeof motions)[number]
// Only these camera runs, by name, with nothing else measured once the project has opened, for a quick look at one.
const only = option("runs")
  ?.split(",")
  .map((name) => name.trim())
  .map((name) => {
    const motion = motions.find((candidate) => candidate === name)
    if (!motion) throw new Error(`--runs takes these, separated by commas: ${motions.join(", ")}`)
    return motion
  })

interface Run {
  name: string
  fps: number
  frameMs: { p50: number; p90: number; max: number }
  /**
   * Zooming over a layer: the frames whose outline was drawn somewhere other than its layer when the frame was painted,
   * of those checked. Missing from other runs, and from runs made before it was measured.
   */
  outlineOff?: { frames: number; checked: number; maxPx: number }
  /** Main-thread milliseconds per frame. */
  perFrame: Record<string, number>
  /** Elements whose style was recalculated, per frame. */
  styledPerFrame: number
  hot?: Hot[]
  /** The window was hidden, such as minimized, for some of the run, so it drew at a crawl or not at all. */
  hidden?: true
}

/**
 * How long a project took to open, in milliseconds: until every frame on the canvas showed its design, its bitmap or,
 * zoomed far out, the placeholder it shows until its bitmap comes, so the canvas can be worked on; and until every frame
 * had its bitmap, which zooming out shows.
 */
interface Opening {
  usableMs: number
  previewsMs: number
  frames: number
  /** Frames showing their bitmaps by then: fewer than `frames` when some never got one. */
  bitmaps: number
}

/** What's measured once the project has opened, which `--open-only` skips. */
interface Measured {
  census: Record<string, number>
  runs: Run[]
  select: { medianMs: number; maxMs: number; mainMsPerSelect: number; hot?: Hot[] }
  /** Editing one design at a time; missing from runs made before it was measured. */
  edit?: Measured["select"]
  memoryMb: Record<string, number>
  /** What the tab still holds while another is showing, and how long switching back takes to draw it. */
  /** With `--soak`: what the window held after each round of work, after collecting garbage. */
  soak?: Soaked[]
  hidden?: {
    nodesShown: number
    nodesHidden: number
    heapShownMb: number
    heapHiddenMb: number
    /** Switching back, until every frame shows its design, or its bitmap while asleep. */
    backMs: number
    /** Switching back, until the last frame near the view woke; missing from runs made before frames slept there. */
    backWokenMs?: number
    /** Frames drawing their design once those near the view woke. */
    backAwake?: number
    /** The longest frame while switching back, until the frames near the view woke. */
    backLongestMs: number
    /** Boards whose size differs from before the switch, once their frames have drawn and a few seconds later. */
    resizedDrawn: number
    resizedLater: number
    /** The boards counted in resizedLater, as `key: before → after`. */
    resized?: string[]
  }
}

/** The window after a round of `--soak`, at a minute into it. */
interface Soaked {
  minute: number
  rounds: number
  nodes: number
  heapMb: number
  /** The editor window's private memory, as the system counts it. */
  windowMb: number
  /** Whether Session Replay was recording the page then, paused, or not running at all. */
  replay: ReplayState
}

type ReplayState = "recording" | "paused" | "off"

interface Result extends Partial<Measured> {
  label: string
  date: string
  project: string
  /** The window's React build; missing from runs made before PAR-519, all development. */
  react?: ReactBuild
  /** Diagnostics' level, when PARITY_TELEMETRY chose it, as `--soak` runs ask it to. */
  telemetry?: string
  css?: string
  /**
   * Opening the project: on the first launch, timed from the window's page loading; again in the same window, from the
   * open; and in the app started again on the same profile, from its page loading. Missing from runs made before it was
   * measured.
   */
  open?: { launch: Opening; reopen?: Opening; restart?: Opening }
}

await mkdir(outDir, { recursive: true })
const profileDir = join(tmpdir(), uiPort === 5320 ? "parity-perf-profile" : `parity-perf-profile-${uiPort}`)
await rm(profileDir, { recursive: true, force: true })

console.log(`Starting a copy of the app on ${project}, on React's ${react} build`)
let runner = launch()
let page: Page | undefined
try {
  page = await connect()
  const open: NonNullable<Result["open"]> = { launch: await opened(page) }
  const measured = openOnly ? {} : await measure(page)
  if (!only && soakMinutes === undefined) {
    open.reopen = await opened(page, project)
    // Started again on the same profile, it restores the tab and finds the bitmaps it kept.
    console.log("Starting the copy again on the same profile")
    await quit(page, runner)
    runner = launch()
    page = await connect()
    open.restart = await opened(page)
  }
  const result: Result = {
    label,
    date: new Date().toISOString(),
    project,
    react,
    ...(process.env.PARITY_TELEMETRY ? { telemetry: process.env.PARITY_TELEMETRY } : {}),
    ...(css ? { css } : {}),
    open,
    ...measured
  }
  await writeFile(join(outDir, `${label}.json`), JSON.stringify(result, null, 2))
  const previous = compare ? (JSON.parse(await readFile(join(outDir, `${compare}.json`), "utf8")) as Result) : undefined
  report(result, previous)
  console.log(`
Saved ${join(outDir, `${label}.json`)}`)
} finally {
  await page?.context().browser()?.close()
  // The runner stops the app once this script ends, so a kept app lasts until this script is stopped.
  if (keep) console.log(`The app keeps running, with DevTools on port ${debugPort}, until this script is stopped`)
  else stop(runner)
}

function launch(): ChildProcess {
  return spawn(process.execPath, [join(appDir, "scripts/dev.ts"), "--react", react, project], {
    cwd: appDir,
    env: {
      ...process.env,
      // One measuring pass's events group together in Sentry, unless the agent running it named its own (PAR-630).
      PARITY_TEST_RUN: process.env.PARITY_TEST_RUN || testRun,
      PARITY_UI_PORT: String(uiPort),
      PARITY_UI_FROZEN: "1",
      PARITY_DEBUG_PORT: String(debugPort),
      PARITY_USER_DATA: profileDir,
      // What the type checker found is kept with the profile too, so the first launch finds none, as on a fresh install,
      // and the person's own cache is left alone.
      PARITY_CACHE_DIR: join(profileDir, "detection"),
      // The window opens at the size to measure, rather than the page being held at it, so the window still behaves
      // like a window if someone maximizes it.
      PARITY_WINDOW_SIZE: viewport,
      // Agents find the app through this file. The copy keeps its own, so agents keep working with the person's app and
      // can't change the copy while it's measured.
      PARITY_AGENT_FILE: join(profileDir, "agent.json")
    },
    stdio: ["ignore", "ignore", "inherit"]
  })
}

/**
 * Closes the copy's window as someone would, so it saves its tabs, and waits for the app to end; one that hasn't ended
 * after 20 seconds is stopped.
 */
async function quit(page: Page, child: ChildProcess): Promise<void> {
  const ended = new Promise((resolve) => child.once("exit", resolve))
  await page.evaluate(() => window.close()).catch(() => undefined)
  await page
    .context()
    .browser()
    ?.close()
    .catch(() => undefined)
  const timer = setTimeout(() => stop(child), 20_000)
  await ended
  clearTimeout(timer)
}

async function connect(): Promise<Page> {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`)
      const page = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find(
          (candidate) => candidate.url().startsWith(`http://localhost:${uiPort}`) && !candidate.url().includes("render")
        )
      if (page) return page
      await browser.close()
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error("The app's window didn't appear")
}

async function measure(page: Page): Promise<Partial<Measured>> {
  // The same size every run, since a larger window draws more. The window opens at it, give or take the few pixels
  // Windows rounds by, which the census reports; one that didn't, such as on a screen too small for it, is held at it.
  // Sizes come from the protocol, which reads the window itself.
  const cdp = await page.context().newCDPSession(page)
  const pageSize = async () => {
    const { cssLayoutViewport } = await cdp.send("Page.getLayoutMetrics")
    return { width: cssLayoutViewport.clientWidth, height: cssLayoutViewport.clientHeight }
  }
  const [width, height] = viewport.split("x").map(Number)
  const opened = await pageSize()
  if (Math.abs(opened.width - width!) > 8 || Math.abs(opened.height - height!) > 8) {
    console.warn(`The window opened at ${opened.width}x${opened.height}, so the page is held at ${viewport}`)
    await page.setViewportSize({ width: width!, height: height! })
  }
  // The copy's window comes to the front and looks like the person's own, so its title says what it is.
  await page.evaluate(() => {
    document.title = "Parity (pnpm perf is measuring this copy, which closes by itself)"
  })
  await page.waitForSelector(".container-view", { state: "attached", timeout: 180_000 })
  // Frames mount, load their lazy components and size themselves; wait until nothing more is drawn for a while.
  await page.evaluate(async () => {
    const count = () =>
      [...document.querySelectorAll("[data-frame]")].reduce(
        (total, host) => total + (host.shadowRoot?.querySelectorAll("*").length ?? 0),
        0
      )
    let last = -1
    let still = 0
    while (still < 6) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      const now = count()
      still = now === last ? still + 1 : 0
      last = now
    }
    await document.fonts.ready
  })
  // Bitmaps for zooming far out are read from disk or taken one frame at a time in the background, which opening waited
  // for; any a frame still lacks after settling, measure once they're all there.
  const bitmapsReady = await page.evaluate(async () => {
    const frames = document.querySelectorAll("[data-frame]").length
    let last = -1
    let still = 0
    while (still < 10) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      const now = document.querySelectorAll("[data-bitmap]").length
      if (now >= frames) break
      still = now === last ? still + 1 : 0
      last = now
    }
    return document.querySelectorAll("[data-bitmap]").length
  })
  // The app's own module instance, as Vite serves it to the page. Sessions are replaced as they change (the editor
  // mounting, the type checker's results), so the open tab's is looked up each time.
  await page.evaluate(async (url) => {
    const { workspace } = (await import(url)) as { workspace: Workspace }
    Object.defineProperty(window, "perfSession", { get: () => workspace.getActive()?.session })
  }, "/workspace.ts")
  if (css) {
    await page.addStyleTag({ content: css })
  }
  await page.bringToFront()

  const census = await page.evaluate(() => {
    const frames = [...document.querySelectorAll<HTMLElement>("[data-frame]")]
    return {
      designs: document.querySelectorAll(".container-view").length,
      frames: frames.length,
      frameElements: frames.reduce((total, host) => total + (host.shadowRoot?.querySelectorAll("*").length ?? 0), 0),
      pageElements: document.querySelectorAll("*").length,
      pixelRatio: devicePixelRatio
    }
  })
  Object.assign(census, {
    ...(await pageSize()),
    bitmaps: bitmapsReady
  })

  await cdp.send("Performance.enable")
  // The copy keeps drawing while covered, but not minimized; a run measured then is marked, not mistaken for slow.
  const hiddenSince = () =>
    page.evaluate(() => {
      const watched = window as unknown as { perfHidden?: boolean }
      const hidden = Boolean(watched.perfHidden) || document.hidden
      if (watched.perfHidden === undefined) {
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) watched.perfHidden = true
        })
      }
      watched.perfHidden = false
      return hidden
    })
  await hiddenSince()
  if (soakMinutes !== undefined) {
    const soak = await soaked(page, cdp, soakMinutes)
    await cdp.detach()
    return { census, soak }
  }
  const runs: Run[] = []
  for (const motion of only ?? motions) {
    const run = await moveCamera(page, cdp, motion)
    if (await hiddenSince()) {
      console.warn(`The window was hidden during ${motion}, so its numbers don't count`)
      run.hidden = true
    }
    runs.push(run)
    // What the camera rests on afterwards, to check by eye that the canvas still draws as it should.
    await page.waitForTimeout(1500)
    if (motion !== "pan" && motion !== "hover" && motion !== "idle")
      await page.screenshot({ path: join(outDir, `${label}-${motion.replace(/\W+/g, "-")}.png`) })
  }
  if (only) {
    await cdp.detach()
    return { census, runs }
  }
  const select = await timeChanges(page, cdp, "select")
  const edit = await timeChanges(page, cdp, "edit")
  const memoryMb = await memory(page, cdp)
  // Last, since it opens another project in a second tab.
  const hidden = await hiddenTab(page, cdp, census.frames!).catch((error: unknown) => {
    console.error("The hidden tab wasn't measured:", error)
    return undefined
  })
  await cdp.detach()
  return {
    census,
    runs,
    select,
    edit,
    memoryMb,
    ...(hidden ? { hidden } : {})
  }
}

/**
 * Times opening the project: until every frame on the canvas shows its design, its bitmap or its placeholder (a frame
 * asleep, or waiting for its bitmap without drawing, shows one of the last two), then until every frame shows its
 * bitmap. Given a project, it closes every tab and opens that project again in this window, timed from the open;
 * otherwise it times the page's own load, from when it started, with the tabs it restores.
 */
async function opened(page: Page, reopen?: string): Promise<Opening> {
  const opening = await page.evaluate(
    async ([url, root]) => {
      const frame = () => new Promise((resolve) => setTimeout(resolve, 25))
      const frames = () => [...document.querySelectorAll("[data-frame]")]
      let start = 0
      if (root) {
        const { workspace } = (await import(url)) as { workspace: Workspace }
        for (const tab of workspace.getTabs()) await workspace.close(tab.id)
        while (frames().length > 0) await frame()
        start = performance.now()
        void workspace.open(root)
      }
      const drawn = (host: Element) =>
        Boolean(host.closest("[data-bitmap], [data-asleep]") ?? host.shadowRoot?.querySelector("[data-canvas-node]"))
      let usable: number | undefined
      let count = { frames: 0, bitmaps: 0 }
      while (performance.now() - start < 180_000) {
        const all = frames()
        count = { frames: all.length, bitmaps: document.querySelectorAll("[data-bitmap]").length }
        if (all.length > 0) {
          usable ??= all.every(drawn) ? performance.now() : undefined
          if (usable !== undefined && count.bitmaps >= all.length) {
            return { usableMs: usable - start, previewsMs: performance.now() - start, ...count }
          }
        }
        await frame()
      }
      return { usableMs: (usable ?? performance.now()) - start, previewsMs: performance.now() - start, ...count }
    },
    ["/workspace.ts", reopen] as const
  )
  return {
    ...opening,
    usableMs: Math.round(opening.usableMs),
    previewsMs: Math.round(opening.previewsMs)
  }
}

/**
 * Moves the camera every frame for a few seconds, from the whole project in view or from 100% on the first design. With
 * the whole project in view and nothing selected, `hover` moves the pointer across the canvas instead, and `idle` keeps
 * still.
 */
async function moveCamera(page: Page, cdp: CDPSession, motion: Motion): Promise<Run> {
  const overLayer = motion.startsWith("zoom ")
  await page.evaluate((motion) => {
    const editor = perfEditor()
    if (motion !== "zoom" && motion !== "pan" && motion !== "hover" && motion !== "idle") {
      const first = editor.getCurrentPageShapesSorted()[0]
      const bounds = first && editor.getShapePageBounds(first)
      if (bounds) editor.centerOnPoint(bounds.center, { animation: { duration: 0 } })
      editor.setCamera({ ...editor.getCamera(), z: 1 }, { immediate: true })
      if (bounds) editor.centerOnPoint(bounds.center, { animation: { duration: 0 } })
    } else editor.zoomToFit({ animation: { duration: 0 } })
    if (motion !== "zoom" && motion !== "pan" && motion !== "pan at 100%")
      (window as unknown as PerfWindow).perfSession.selection.set({})

    function perfEditor() {
      return (window as unknown as PerfWindow).perfSession.editor!
    }
  }, motion)
  if (overLayer) {
    // The design draws at 100% before a layer in it is picked.
    await page.waitForTimeout(1500)
    const outlines = { "zoom at 100%": "none", "zoom hovering a layer": "hover" } as const
    await pointAtLayer(page, motion in outlines ? outlines[motion as keyof typeof outlines] : "select")
  }
  // Whatever waits for the camera to stop, such as debounced styles, catches up first.
  await page.waitForTimeout(1500)

  const {
    trace,
    metrics,
    frames: run,
    hot
  } = await recorded(cdp, () =>
    page.evaluate(
      ([motion, seconds]) =>
        new Promise<{ times: number[]; off?: Run["outlineOff"] }>((resolve, reject) => {
          const perf = window as unknown as PerfWindow
          const editor = perf.perfSession.editor!
          const start = editor.getCamera()
          const viewport = editor.getViewportScreenBounds()
          const center = { x: viewport.w / 2, y: viewport.h / 2 }
          const pageCenter = { x: center.x / start.z - start.x, y: center.y / start.z - start.y }
          const times: number[] = []
          const layer = motion.startsWith("zoom ") ? perf.perfLayer : undefined
          const stopWatching = layer && motion !== "zoom at 100%" ? watchOutline(layer) : undefined
          // What the pointer is over, as for the wheel of a mouse held still.
          const wheeled = layer && (document.elementFromPoint(layer.point.x, layer.point.y) ?? document.body)
          let first: number | undefined
          let last: number | undefined
          let farthest = 0
          const step = (now: number) => {
            first ??= now
            times.push(now)
            const t = (now - first) / 1000
            const elapsed = now - (last ?? now)
            last = now
            if (t >= seconds) {
              const off = stopWatching?.()
              if (layer && farthest < 0.1) return reject(new Error("The wheel didn't zoom the canvas"))
              return resolve({ times, ...(off ? { off } : {}) })
            }
            const wave = Math.sin(t * Math.PI)
            if (layer && wheeled) {
              // Ctrl and the wheel, as a mouse zooms, in and out about the layer: to about 3x and back, then to a third.
              // Each event's step follows the time since the last frame, so a slow run zooms as far as a quick one.
              farthest = Math.max(farthest, Math.abs(editor.getCamera().z - start.z))
              wheeled.dispatchEvent(
                new WheelEvent("wheel", {
                  clientX: layer.point.x,
                  clientY: layer.point.y,
                  deltaY: -Math.max(-10, Math.min(10, 2 * Math.cos(t * Math.PI) * (elapsed / (1000 / 60)))),
                  ctrlKey: true,
                  bubbles: true,
                  cancelable: true,
                  composed: true
                })
              )
            } else if (motion === "hover") {
              const x = viewport.x + viewport.w * (0.5 + 0.45 * wave)
              const y = viewport.y + viewport.h * 0.5
              document.elementFromPoint(x, y)?.dispatchEvent(
                new PointerEvent("pointermove", {
                  clientX: x,
                  clientY: y,
                  bubbles: true,
                  composed: true,
                  pointerType: "mouse"
                })
              )
            } else if (motion === "idle") {
              // Nothing moves.
            } else if (motion === "zoom") {
              const z = Math.max(0.01, start.z * (1 + 0.5 * wave))
              editor.setCamera(
                { x: center.x / z - pageCenter.x, y: center.y / z - pageCenter.y, z },
                { immediate: true }
              )
            } else {
              const distance = motion === "pan" ? 400 : 1500
              editor.setCamera(
                { x: start.x + (wave * distance) / start.z, y: start.y, z: start.z },
                { immediate: true }
              )
            }
            requestAnimationFrame(step)
          }
          requestAnimationFrame(step)

          /**
           * Checks each frame, as it's about to be painted, that an outline the overlay draws lies on the layer, and
           * returns how many were off. A ResizeObserver's callbacks run after the frame's animation frame callbacks and
           * its layout, just before paint, so what they find is what the frame shows. A 1px element changes width each
           * frame to call them.
           */
          function watchOutline(watched: NonNullable<PerfWindow["perfLayer"]>) {
            const host = [...document.querySelectorAll<HTMLElement>("[data-frame]")].find(
              (candidate) =>
                candidate.dataset.design === watched.design &&
                candidate.dataset.mode === watched.mode &&
                candidate.dataset.state === watched.state
            )
            const ticker = document.body.appendChild(document.createElement("div"))
            ticker.style.cssText = "position: fixed; left: 0; top: 0; height: 1px; width: 1px; pointer-events: none"
            let frames = 0
            let checked = 0
            let maxPx = 0
            let done = false
            const observer = new ResizeObserver(() => {
              const box = host && perf.perfNodeBox(host, watched.node)
              if (!box) return
              checked++
              const outlines = [...document.querySelectorAll<HTMLElement>(".z-\\[300\\] > div")]
                .filter((element) => element.style.outline !== "")
                .map((element) => element.getBoundingClientRect())
              const distance = Math.min(
                Infinity,
                ...outlines.map((rect) =>
                  Math.max(
                    Math.abs(rect.left - box.left),
                    Math.abs(rect.top - box.top),
                    Math.abs(rect.width - box.width),
                    Math.abs(rect.height - box.height)
                  )
                )
              )
              if (distance <= 1) return
              frames++
              if (Number.isFinite(distance)) maxPx = Math.max(maxPx, distance)
            })
            observer.observe(ticker)
            const tick = () => {
              ticker.style.width = ticker.style.width === "1px" ? "2px" : "1px"
              if (!done) requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
            return () => {
              done = true
              observer.disconnect()
              ticker.remove()
              return { frames, checked, maxPx: Math.round(maxPx) }
            }
          }
        }),
      [motion, seconds] as const
    )
  )
  const { times: frames, off } = run
  const intervals = frames
    .slice(1)
    .map((time, index) => time - frames[index]!)
    .sort((a, b) => a - b)
  const percentile = (p: number) => round(intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * p))]!)
  const count = Math.max(1, frames.length - 1)
  const perFrame: Record<string, number> = {
    style: round((metrics.RecalcStyleDuration! * 1000) / count),
    layout: round((metrics.LayoutDuration! * 1000) / count),
    script: round((metrics.ScriptDuration! * 1000) / count),
    main: round((metrics.TaskDuration! * 1000) / count)
  }
  for (const [name, key] of [
    ["Paint", "paint"],
    ["PrePaint", "prePaint"],
    ["Layerize", "layerize"],
    ["Commit", "commit"],
    ["RasterTask", "raster"]
  ] as const) {
    perFrame[key] = round((trace.durations[name] ?? 0) / count)
  }
  return {
    name: motion,
    fps: round(count / seconds),
    frameMs: { p50: percentile(0.5), p90: percentile(0.9), max: round(intervals.at(-1) ?? 0) },
    perFrame,
    styledPerFrame: Math.round(trace.styledElements / count),
    ...(off ? { outlineOff: off } : {}),
    ...(hot ? { hot } : {})
  }
}

/**
 * Points at a layer near the middle of the first design, at 100%: the pointer moves over it, so the canvas outlines what
 * a click there would select; with `select`, that's selected and the pointer stays on it, and with `none`, nothing is
 * outlined, for a zoom to compare with. What's outlined, and where the pointer is, are kept on the window for the zoom
 * that follows.
 */
async function pointAtLayer(page: Page, outline: "none" | "hover" | "select"): Promise<void> {
  const found = await page.evaluate(
    async ([url, outline]) => {
      const perf = window as unknown as PerfWindow
      const { nodeBox } = (await import(url)) as { nodeBox: PerfWindow["perfNodeBox"] }
      perf.perfNodeBox = nodeBox
      const { editor, selection } = perf.perfSession
      const first = editor!.getCurrentPageShapesSorted()[0]
      const key = first && (first.props as { key?: string }).key
      const view = editor!.getViewportScreenBounds()
      const middle = { x: view.x + view.w / 2, y: view.y + view.h / 2 }
      const onScreen = (rect: DOMRect) =>
        rect.left >= view.x && rect.top >= view.y && rect.right <= view.x + view.w && rect.bottom <= view.y + view.h
      // A layer of a frame of the first design, wholly in view, neither tiny nor most of its frame, nearest the middle.
      const hosts = [...document.querySelectorAll<HTMLElement>("[data-frame]")].filter(
        (host) => host.dataset.design === key
      )
      const candidates = hosts.flatMap((host) => {
        const frame = host.getBoundingClientRect()
        return [...(host.shadowRoot?.querySelectorAll<HTMLElement>("[data-canvas-node]") ?? [])].flatMap((element) => {
          const rect = element.getBoundingClientRect()
          const area = rect.width * rect.height
          return area > 1500 && area < frame.width * frame.height * 0.3 && onScreen(rect) ? [rect] : []
        })
      })
      const distance = (rect: DOMRect) =>
        Math.hypot(rect.left + rect.width / 2 - middle.x, rect.top + rect.height / 2 - middle.y)
      const best = candidates.sort((a, b) => distance(a) - distance(b))[0]
      if (!best) return `no layer in view in ${key ?? "the first design"}`
      const point = { x: best.left + best.width / 2, y: best.top + best.height / 2 }
      const move = () =>
        document.elementFromPoint(point.x, point.y)?.dispatchEvent(
          new PointerEvent("pointermove", {
            clientX: point.x,
            clientY: point.y,
            bubbles: true,
            composed: true,
            pointerType: "mouse"
          })
        )
      move()
      const hover = selection.getHover()
      if (!hover?.node || hover.mode === undefined || hover.state === undefined)
        return "nothing outlined under the pointer"
      if (outline === "select") {
        selection.set({ design: hover.design, node: hover.node, mode: hover.mode, state: hover.state })
        move()
      }
      if (outline === "none") selection.setHover(undefined)
      perf.perfLayer = { design: hover.design, node: hover.node, mode: hover.mode, state: hover.state, point }
      return undefined
    },
    ["/frame.ts", outline] as const
  )
  if (found) throw new Error(`No layer to zoom over: ${found}`)
}

/**
 * Selects designs one after another, or edits them, timing how long each change takes to settle. An edit adds a space
 * to the design's name in memory, neither saved nor undoable, and takes it out again untimed.
 */
async function timeChanges(page: Page, cdp: CDPSession, change: "select" | "edit"): Promise<Measured["select"]> {
  await page.evaluate(() => {
    const editor = (window as unknown as PerfWindow).perfSession.editor!
    editor.zoomToFit({ animation: { duration: 0 } })
  })
  await page.waitForTimeout(1000)
  const {
    metrics,
    frames: times,
    hot
  } = await recorded(cdp, () =>
    page.evaluate(async (change) => {
      const session = (window as unknown as PerfWindow).perfSession
      const keys = session.store
        .getEntries()
        .slice(0, 20)
        .map((entry) => entry.key)
      const rename = (key: string, name: (name: string) => string) =>
        session.store.updateContainer(key, "Rename", (container) => ({ ...container, name: name(container.name) }), {
          history: false,
          persist: false
        })
      // React renders a store change in a microtask; a timeout runs after it and its effects.
      const settled = () => new Promise((resolve) => setTimeout(resolve, 0))
      const times: number[] = []
      for (const key of keys) {
        await new Promise((resolve) => requestAnimationFrame(resolve))
        const start = performance.now()
        if (change === "select") session.selection.set({ design: key })
        else rename(key, (name) => `${name} `)
        await settled()
        times.push(performance.now() - start)
        if (change === "edit") {
          rename(key, (name) => name.slice(0, -1))
          await settled()
        }
      }
      session.selection.set({})
      return times
    }, change)
  )
  const sorted = [...times].sort((a, b) => a - b)
  return {
    medianMs: round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    maxMs: round(sorted.at(-1) ?? 0),
    mainMsPerSelect: round((metrics.TaskDuration! * 1000) / Math.max(1, times.length)),
    ...(hot ? { hot } : {})
  }
}

/**
 * Opens a second project so this one's tab is hidden, and counts what the hidden tab still holds after collecting
 * garbage; then switches back and times how long until every frame has drawn its design again, and checks that the
 * boards kept their sizes.
 */
async function hiddenTab(page: Page, cdp: CDPSession, frames: number): Promise<Measured["hidden"]> {
  // Zoomed out, frames already sleep, and hiding the tab would free nothing more.
  await visitEveryBoard(page)
  const shown = await counts(cdp)
  // Keyed by design, since the shapes' ids aren't kept across sessions.
  const boards = () =>
    page.evaluate(() => {
      const editor = (window as unknown as PerfWindow).perfSession.editor!
      return Object.fromEntries(
        editor.getCurrentPageShapes().map((shape) => {
          const box = editor.getShapePageBounds(shape)!
          return [(shape.props as { key: string }).key, `${Math.round(box.w)}×${Math.round(box.h)}`]
        })
      )
    })
  const changed = (before: Record<string, string>, after: Record<string, string>) =>
    Object.keys(before)
      .filter((key) => before[key] !== after[key])
      .map((key) => `${key}: ${before[key]} → ${after[key] ?? "gone"}`)
  // The runs before this one may leave boards still settling, so the sizes to keep are the ones that hold still.
  let sizes = await boards()
  for (let tries = 0; tries < 20; tries++) {
    await page.waitForTimeout(500)
    const now = await boards()
    if (changed(sizes, now).length === 0) break
    sizes = now
  }
  const resized = async () => changed(sizes, await boards())
  const first = await page.evaluate(
    async ([url, root]) => {
      const { workspace } = (await import(url)) as { workspace: Workspace }
      const first = workspace.getActive()!.id
      const tab = await workspace.open(root)
      if (tab.status !== "ready") throw new Error(`${root} didn't open: ${tab.message ?? tab.status}`)
      return first
    },
    ["/workspace.ts", second] as const
  )
  await page.waitForTimeout(5000)
  const hidden = await counts(cdp)
  const back = await page.evaluate(
    async ([url, id, frames]) => {
      const { workspace } = (await import(url)) as { workspace: Workspace }
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
      const hosts = () => [...document.querySelectorAll("[data-frame]")].filter((host) => !host.closest("[hidden]"))
      const awake = () => hosts().filter((host) => host.shadowRoot?.querySelector("[data-canvas-node]")).length
      // A frame shows its design, or, asleep, its bitmap: frames away from the view stay asleep (PAR-153).
      const shown = () =>
        hosts().filter(
          (host) =>
            host.shadowRoot?.querySelector("[data-canvas-node]") ||
            host.closest("[data-asleep]")?.hasAttribute("data-bitmap")
        ).length
      const started = performance.now()
      let last = started
      let longest = 0
      let shownMs: number | undefined
      // Done once every frame shows something and no frame has woken for half a second.
      let woken = { count: -1, at: started }
      workspace.activate(id)
      while (performance.now() - started < 10_000) {
        await frame()
        const now = performance.now()
        longest = Math.max(longest, now - last)
        last = now
        if (shownMs === undefined && shown() >= frames) shownMs = now - started
        const count = awake()
        if (count !== woken.count) woken = { count, at: now }
        if (shownMs !== undefined && now - woken.at >= 500) break
      }
      await frame()
      await frame()
      return { ms: shownMs ?? performance.now() - started, wokenMs: woken.at - started, awake: woken.count, longest }
    },
    ["/workspace.ts", first, frames] as const
  )
  const resizedDrawn = await resized()
  await page.waitForTimeout(3000)
  const resizedLater = await resized()
  await page.screenshot({ path: join(outDir, `${label}-back.png`) })
  return {
    nodesShown: shown.nodes,
    nodesHidden: hidden.nodes,
    heapShownMb: shown.heapMb,
    heapHiddenMb: hidden.heapMb,
    backMs: round(back.ms),
    backWokenMs: round(back.wokenMs),
    backAwake: back.awake,
    backLongestMs: round(back.longest),
    resizedDrawn: resizedDrawn.length,
    resizedLater: resizedLater.length,
    resized: resizedLater
  }
}

/**
 * Brings each board into view in turn at 100%, so its frames wake, as after working across the project, and those left
 * behind go back to sleep; then the camera rests on the first.
 */
async function visitEveryBoard(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const editor = (window as unknown as PerfWindow).perfSession.editor!
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    const shapes = editor.getCurrentPageShapesSorted()
    for (const shape of [...shapes, shapes[0]]) {
      const bounds = shape && editor.getShapePageBounds(shape)
      if (!bounds) continue
      editor.setCamera({ ...editor.getCamera(), z: 1 }, { immediate: true })
      editor.centerOnPoint(bounds.center, { animation: { duration: 0 } })
      await wait(400)
    }
    await wait(1500)
  })
}

/** The page's DOM nodes and JS heap once garbage has been collected. */
async function counts(cdp: CDPSession): Promise<{ nodes: number; heapMb: number }> {
  await cdp.send("HeapProfiler.collectGarbage")
  const { metrics } = await cdp.send("Performance.getMetrics")
  const value = (name: string) => metrics.find((metric) => metric.name === name)?.value ?? 0
  return { nodes: value("Nodes"), heapMb: Math.round(value("JSHeapUsedSize") / 1048576) }
}

/**
 * Works the project for `minutes`, round after round: zooming the whole project in and out, waking every board at 100%
 * and leaving it to sleep, then selecting and editing designs, as `pnpm perf` measures each once. After each round it
 * reads what the window holds, so growth that never levels off shows as a rising line (PAR-683). The work goes through
 * the editor, not input, and Replay pauses after five minutes without a click or a key, so each round also presses
 * Shift, which does nothing on the canvas, and each reading says whether Replay was recording.
 */
async function soaked(page: Page, cdp: CDPSession, minutes: number): Promise<Soaked[]> {
  const started = Date.now()
  const readings: Soaked[] = []
  const read = async (rounds: number) => {
    const { nodes, heapMb } = await counts(cdp)
    const windowMb = (await memory(page, cdp))["this-window"] ?? 0
    const replay = await replayState(page)
    const reading = { minute: round((Date.now() - started) / 60_000), rounds, nodes, heapMb, windowMb, replay }
    readings.push(reading)
    console.log(
      `  ${reading.minute} min, ${rounds} rounds: ${nodes} nodes, ${heapMb} MB heap, ${windowMb} MB window, replay ${replay}`
    )
  }
  await read(0)
  for (let rounds = 1; Date.now() - started < minutes * 60_000; rounds++) {
    await page.keyboard.press("Shift")
    await moveCamera(page, cdp, "zoom")
    await visitEveryBoard(page)
    await timeChanges(page, cdp, "select")
    await timeChanges(page, cdp, "edit")
    await read(rounds)
  }
  return readings
}

/**
 * Whether Session Replay is recording the page, through the window's own instance of Sentry: the module `replay.ts`
 * imports, as Vite serves it to the page. Replay keeps its page recorder to itself, as `holdRecording` finds it.
 */
async function replayState(page: Page): Promise<ReplayState> {
  return page.evaluate(async () => {
    const source = await (await fetch("/replay.ts")).text()
    const url = /from\s+"([^"]*sentry_electron_renderer[^"]*)"/.exec(source)?.[1]
    if (!url) throw new Error("replay.ts doesn't import Sentry as perf expects")
    const { getReplay } = (await import(url)) as {
      getReplay: () => { _replay?: { isEnabled(): boolean; isPaused(): boolean } } | undefined
    }
    const recorder = getReplay()?._replay
    if (!recorder?.isEnabled()) return "off"
    return recorder.isPaused() ? "paused" : "recording"
  })
}

async function memory(page: Page, cdp: CDPSession): Promise<Record<string, number>> {
  const { metrics } = await cdp.send("Performance.getMetrics")
  const heap = metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value ?? 0
  // The first reading starts what reads each process's private memory on Windows, so the second is the one kept.
  await page.evaluate(() => window.canvasHost.metrics())
  const processes = await page.evaluate(() => window.canvasHost.metrics())
  const byRole: Record<string, number> = { "js heap": Math.round(heap / 2 ** 20) }
  for (const usage of processes) {
    byRole[usage.role] = (byRole[usage.role] ?? 0) + Math.round(usage.memory / 2 ** 20)
  }
  byRole.total = processes.reduce((total, usage) => total + Math.round(usage.memory / 2 ** 20), 0)
  return byRole
}

/** Runs `work` with a trace and the page's performance counters recording, and returns what changed during it. */
async function recorded<T>(
  cdp: CDPSession,
  work: () => Promise<T>
): Promise<{
  frames: T
  metrics: Record<string, number>
  trace: { durations: Record<string, number>; styledElements: number }
  hot?: Hot[]
}> {
  const events: { name: string; ph: string; dur?: number; args?: { elementCount?: number } }[] = []
  const collect = (event: { value: object[] }) => events.push(...(event.value as typeof events))
  cdp.on("Tracing.dataCollected", collect)
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline,disabled-by-default-devtools.timeline",
    transferMode: "ReportEvents"
  })
  if (profiling) {
    await cdp.send("Profiler.enable")
    await cdp.send("Profiler.setSamplingInterval", { interval: 250 })
    await cdp.send("Profiler.start")
  }
  const counters = async () =>
    Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((metric) => [metric.name, metric.value]))
  const before = await counters()
  const frames = await work()
  const after = await counters()
  const hot = profiling ? hottest((await cdp.send("Profiler.stop")).profile) : undefined
  const complete = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve))
  await cdp.send("Tracing.end")
  await complete
  cdp.off("Tracing.dataCollected", collect)

  const durations: Record<string, number> = {}
  let styledElements = 0
  for (const event of events) {
    if (event.ph !== "X" || event.dur === undefined) continue
    durations[event.name] = (durations[event.name] ?? 0) + event.dur / 1000
    if (event.name === "UpdateLayoutTree") styledElements += event.args?.elementCount ?? 0
  }
  const metrics = Object.fromEntries(Object.keys(after).map((name) => [name, after[name]! - (before[name] ?? 0)]))
  return { frames, metrics, trace: { durations, styledElements }, ...(hot ? { hot } : {}) }
}

/**
 * The functions that spent the most time themselves in a sampled profile, by name and place in the source. A function of
 * the browser's own, such as `getBoundingClientRect`, is named with the script that called it.
 */
function hottest(profile: {
  nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }[]
  samples?: number[]
  timeDeltas?: number[]
}): Hot[] {
  const byNode = new Map(profile.nodes.map((node) => [node.id, node.callFrame]))
  const parents = new Map(profile.nodes.flatMap((node) => (node.children ?? []).map((child) => [child, node.id])))
  const place = (frame: { functionName: string; url: string; lineNumber: number }) =>
    `${frame.functionName || "(anonymous)"} ${frame.url.replace(/^.*\/\/[^/]+/, "").replace(/\?.*$/, "")}:${frame.lineNumber + 1}`
  const caller = (id: number) => {
    for (let parent = parents.get(id); parent !== undefined; parent = parents.get(parent)) {
      const frame = byNode.get(parent)
      if (frame?.url) return frame
    }
    return undefined
  }
  const totals = new Map<string, number>()
  for (const [index, id] of (profile.samples ?? []).entries()) {
    const frame = byNode.get(id)
    if (!frame || ["(idle)", "(program)", "(root)"].includes(frame.functionName)) continue
    const from = frame.url ? undefined : caller(id)
    const at = from ? `${frame.functionName} ← ${place(from)}` : place(frame)
    totals.set(at, (totals.get(at) ?? 0) + (profile.timeDeltas?.[index] ?? 0) / 1000)
  }
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([at, ms]) => ({ at, ms: round(ms) }))
}

function report(result: Result, previous: Result | undefined): void {
  const column = (value: number, before: number | undefined) => {
    if (before === undefined) return String(value)
    const change =
      before === 0 ? "" : ` (${value >= before ? "+" : ""}${Math.round(((value - before) / before) * 100)}%)`
    return `${before} → ${value}${change}`
  }
  console.log(`\n${result.label}${previous ? ` compared with ${previous.label}` : ""}`)
  const { census } = result
  if (census) {
    console.log(
      `${census.designs} designs, ${census.frames} frames, ${census.frameElements} elements in frames, ` +
        `${census.width}×${census.height} at ${census.pixelRatio}x, ${census.bitmaps} with bitmaps`
    )
  }
  if (census && previous?.census && previous.census.frameElements !== census.frameElements) {
    console.log(
      `  (the earlier run had ${previous.census.designs} designs and ${previous.census.frameElements} elements)`
    )
  }
  if (result.open) {
    console.log(
      `\nopening, ms until every frame shows its design, bitmap or placeholder, then until every frame has its bitmap`
    )
    for (const [name, now] of Object.entries(result.open)) {
      const before = previous?.open?.[name as keyof NonNullable<Result["open"]>]
      const missing = now.bitmaps < now.frames ? `, ${now.frames - now.bitmaps} of ${now.frames} never got one` : ""
      console.log(`  ${`${name} usable`.padEnd(18)}${column(now.usableMs, before?.usableMs)}`)
      console.log(`  ${`${name} previews`.padEnd(18)}${column(now.previewsMs, before?.previewsMs)}${missing}`)
    }
  }
  for (const run of result.runs ?? []) {
    const before = previous?.runs?.find((candidate) => candidate.name === run.name)
    console.log(`\n${run.name}${run.hidden ? " (the window was hidden, so these don't count)" : ""}`)
    console.log(`  fps               ${column(run.fps, before?.fps)}`)
    console.log(`  frame p50 ms      ${column(run.frameMs.p50, before?.frameMs.p50)}`)
    console.log(`  frame p90 ms      ${column(run.frameMs.p90, before?.frameMs.p90)}`)
    console.log(`  frame max ms      ${column(run.frameMs.max, before?.frameMs.max)}`)
    for (const [key, value] of Object.entries(run.perFrame)) {
      console.log(`  ${`${key} ms/frame`.padEnd(18)}${column(value, before?.perFrame[key])}`)
    }
    console.log(`  styled/frame      ${column(run.styledPerFrame, before?.styledPerFrame)}`)
    if (run.outlineOff) {
      const { frames, checked, maxPx } = run.outlineOff
      const was = before?.outlineOff ? ` (was ${before.outlineOff.frames} of ${before.outlineOff.checked})` : ""
      console.log(`  outline off       ${frames} of ${checked} frames, by up to ${maxPx}px${was}`)
    }
    printHot(run.hot)
  }
  for (const [name, now, before] of [
    ["select a design", result.select, previous?.select],
    ["edit a design", result.edit, previous?.edit]
  ] as const) {
    if (!now) continue
    console.log(`\n${name}`)
    console.log(`  median ms         ${column(now.medianMs, before?.medianMs)}`)
    console.log(`  max ms            ${column(now.maxMs, before?.maxMs)}`)
    console.log(`  main ms each      ${column(now.mainMsPerSelect, before?.mainMsPerSelect)}`)
    printHot(now.hot)
  }
  if (result.hidden) {
    const before = previous?.hidden
    console.log(`\nwith another tab showing`)
    console.log(`  nodes shown       ${column(result.hidden.nodesShown, before?.nodesShown)}`)
    console.log(`  nodes hidden      ${column(result.hidden.nodesHidden, before?.nodesHidden)}`)
    console.log(`  heap shown MB     ${column(result.hidden.heapShownMb, before?.heapShownMb)}`)
    console.log(`  heap hidden MB    ${column(result.hidden.heapHiddenMb, before?.heapHiddenMb)}`)
    console.log(`  back shown ms     ${column(result.hidden.backMs, before?.backMs)}`)
    if (result.hidden.backWokenMs !== undefined) {
      console.log(`  back woken ms     ${column(result.hidden.backWokenMs, before?.backWokenMs)}`)
      console.log(`  frames awake      ${column(result.hidden.backAwake ?? 0, before?.backAwake)}`)
    }
    console.log(`  back longest ms   ${column(result.hidden.backLongestMs, before?.backLongestMs)}`)
    console.log(`  boards resized    ${result.hidden.resizedDrawn} once drawn, ${result.hidden.resizedLater} after 3 s`)
    for (const board of result.hidden.resized?.slice(0, 10) ?? []) console.log(`    ${board}`)
  }
  if (result.soak?.length) {
    const [first, last] = [result.soak[0]!, result.soak.at(-1)!]
    console.log(`\n${last.minute} minutes, ${last.rounds} rounds, with diagnostics ${result.telemetry ?? "as set"}`)
    console.log(`  nodes             ${first.nodes} → ${last.nodes}`)
    console.log(`  heap MB           ${first.heapMb} → ${last.heapMb}`)
    console.log(`  window MB         ${first.windowMb} → ${last.windowMb}`)
    const recording = result.soak.filter((reading) => reading.replay === "recording").length
    console.log(`  replay recording  ${recording} of ${result.soak.length} readings`)
  }
  if (result.memoryMb) {
    console.log(`\nmemory MB`)
    for (const [role, value] of Object.entries(result.memoryMb)) {
      console.log(`  ${role.padEnd(13)}${column(value, previous?.memoryMb?.[role])}`)
    }
  }
}

function printHot(hot: Hot[] | undefined): void {
  if (!hot?.length) return
  console.log("  most time in")
  for (const { at, ms } of hot) console.log(`    ${String(ms).padStart(7)} ms  ${at}`)
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function stop(child: ChildProcess): void {
  // The runner stops Electron and its servers when it ends; on Windows only a tree kill ends them all at once.
  if (process.platform === "win32" && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"])
  else child.kill()
}
