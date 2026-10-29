// Measures how the canvas copes with a project: the frame rate while the camera zooms and pans every frame, where each
// frame's time goes (style, layout, paint, raster), how long selecting a design takes to settle, and memory. It starts
// its own copy of the app on its own ports and profile, so a copy already running is left alone, and stops it after.
// Results go to .inspect/perf/<label>.json; --compare prints another run's numbers beside them.
// Usage: pnpm perf [--label name] [--compare name] [--project root] [--seconds 4] [--viewport 1439x901] [--css "rules"]
//                  [--profile] [--keep]
//   --viewport the page's size in CSS pixels, the same every run (the default is the first runs' window)
//   --css      adds a stylesheet to the page before measuring, to try an idea without changing the code
//   --profile  samples the page's JavaScript too, and lists the functions that took the most time in each run
//   --keep     leaves the app running afterwards, until the script is stopped
import { type ChildProcess, spawn } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { chromium, type CDPSession, type Page } from "playwright-core"
import type { ProjectSession, Workspace } from "../src/renderer/workspace.ts"

/** What the page holds for these measurements: the open tab's session. */
interface PerfWindow {
  perfSession: ProjectSession
}

const appDir = resolve(import.meta.dirname, "..")
const repoDir = resolve(appDir, "../..")
const outDir = join(repoDir, ".inspect/perf")
const uiPort = 5320
const debugPort = 9340

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
const profiling = args.includes("--profile")
const second = resolve(option("second") ?? join(repoDir, "fixtures/vite7-js"))

/** A function's own time over a run, with `--profile`. */
interface Hot {
  at: string
  ms: number
}

type Motion = "zoom" | "pan" | "hover" | "idle" | "pan at 100%"

interface Run {
  name: string
  fps: number
  frameMs: { p50: number; p90: number; max: number }
  /** Main-thread milliseconds per frame. */
  perFrame: Record<string, number>
  /** Elements whose style was recalculated, per frame. */
  styledPerFrame: number
  hot?: Hot[]
  /** The window was hidden, such as minimized, for some of the run, so it drew at a crawl or not at all. */
  hidden?: true
}

interface Result {
  label: string
  date: string
  project: string
  css?: string
  census: Record<string, number>
  runs: Run[]
  select: { medianMs: number; maxMs: number; mainMsPerSelect: number; hot?: Hot[] }
  /** Editing one design at a time; missing from runs made before it was measured. */
  edit?: Result["select"]
  memoryMb: Record<string, number>
  /** What the tab still holds while another is showing, and how long switching back takes to draw it. */
  hidden?: {
    nodesShown: number
    nodesHidden: number
    heapShownMb: number
    heapHiddenMb: number
    backMs: number
    /** The longest frame while switching back, until every frame has drawn. */
    backLongestMs: number
    /** Boards whose size differs from before the switch, once their frames have drawn and a few seconds later. */
    resizedDrawn: number
    resizedLater: number
    /** The boards counted in resizedLater, as `key: before → after`. */
    resized?: string[]
  }
}

await mkdir(outDir, { recursive: true })
const profileDir = join(tmpdir(), "parity-perf-profile")
await rm(profileDir, { recursive: true, force: true })

console.log(`Starting a copy of the app on ${project}`)
const runner = spawn(process.execPath, [join(appDir, "scripts/dev.ts"), project], {
  cwd: appDir,
  env: {
    ...process.env,
    PARITY_UI_PORT: String(uiPort),
    PARITY_UI_FROZEN: "1",
    PARITY_DEBUG_PORT: String(debugPort),
    PARITY_USER_DATA: profileDir,
    // The window opens at the size to measure, rather than the page being held at it, so the window still behaves like
    // a window if someone maximizes it.
    PARITY_WINDOW_SIZE: viewport,
    // Agents find the app through this file. The copy keeps its own, so agents keep working with the person's app and
    // can't change the copy while it's measured.
    PARITY_AGENT_FILE: join(profileDir, "agent.json")
  },
  stdio: ["ignore", "ignore", "inherit"]
})

let page: Page | undefined
try {
  page = await connect()
  const result = await measure(page)
  await writeFile(join(outDir, `${label}.json`), JSON.stringify(result, null, 2))
  const previous = compare ? (JSON.parse(await readFile(join(outDir, `${compare}.json`), "utf8")) as Result) : undefined
  report(result, previous)
  console.log(`\nSaved ${join(outDir, `${label}.json`)}`)
} finally {
  await page?.context().browser()?.close()
  // The runner stops the app once this script ends, so a kept app lasts until this script is stopped.
  if (keep) console.log(`The app keeps running, with DevTools on port ${debugPort}, until this script is stopped`)
  else stop(runner)
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
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error("The app's window didn't appear")
}

async function measure(page: Page): Promise<Result> {
  // The same size every run, since a larger window draws more. The window opens at it, give or take the few pixels
  // Windows rounds by, which the census reports; one that didn't, such as on a screen too small for it, is held at it.
  // Sizes come from the protocol, since code evaluated here reads the window's size as a frame's (see viewport.ts).
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
  // Bitmaps for zooming far out are taken one frame at a time in the background; measure once they're all there.
  const bitmapsReady = await page.evaluate(async () => {
    const started = performance.now()
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
    return { bitmaps: document.querySelectorAll("[data-bitmap]").length, seconds: (performance.now() - started) / 1000 }
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
    bitmaps: bitmapsReady.bitmaps,
    bitmapSeconds: Math.round(bitmapsReady.seconds)
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
  const runs: Run[] = []
  for (const motion of ["zoom", "pan", "hover", "idle", "pan at 100%"] as const) {
    const run = await moveCamera(page, cdp, motion)
    if (await hiddenSince()) {
      console.warn(`The window was hidden during ${motion}, so its numbers don't count`)
      run.hidden = true
    }
    runs.push(run)
    // What the camera rests on afterwards, to check by eye that the canvas still draws as it should.
    await page.waitForTimeout(1500)
    if (motion === "zoom" || motion === "pan at 100%")
      await page.screenshot({ path: join(outDir, `${label}-${motion.replace(/\W+/g, "-")}.png`) })
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
    label,
    date: new Date().toISOString(),
    project,
    ...(css ? { css } : {}),
    census,
    runs,
    select,
    edit,
    memoryMb,
    ...(hidden ? { hidden } : {})
  }
}

/**
 * Moves the camera every frame for a few seconds, from the whole project in view or from 100% on the first design. With
 * the whole project in view and nothing selected, `hover` moves the pointer across the canvas instead, and `idle` keeps
 * still.
 */
async function moveCamera(page: Page, cdp: CDPSession, motion: Motion): Promise<Run> {
  await page.evaluate((motion) => {
    const editor = perfEditor()
    if (motion === "pan at 100%") {
      const first = editor.getCurrentPageShapesSorted()[0]
      const bounds = first && editor.getShapePageBounds(first)
      if (bounds) editor.centerOnPoint(bounds.center, { animation: { duration: 0 } })
      editor.setCamera({ ...editor.getCamera(), z: 1 }, { immediate: true })
      if (bounds) editor.centerOnPoint(bounds.center, { animation: { duration: 0 } })
    } else editor.zoomToFit({ animation: { duration: 0 } })
    if (motion === "hover" || motion === "idle") (window as unknown as PerfWindow).perfSession.selection.set({})

    function perfEditor() {
      return (window as unknown as PerfWindow).perfSession.editor!
    }
  }, motion)
  // Whatever waits for the camera to stop, such as debounced styles, catches up first.
  await page.waitForTimeout(1500)

  const { trace, metrics, frames, hot } = await recorded(cdp, () =>
    page.evaluate(
      ([motion, seconds]) =>
        new Promise<number[]>((resolve) => {
          const editor = (window as unknown as PerfWindow).perfSession.editor!
          const start = editor.getCamera()
          const viewport = editor.getViewportScreenBounds()
          const center = { x: viewport.w / 2, y: viewport.h / 2 }
          const pageCenter = { x: center.x / start.z - start.x, y: center.y / start.z - start.y }
          const times: number[] = []
          let first: number | undefined
          const step = (now: number) => {
            first ??= now
            times.push(now)
            const t = (now - first) / 1000
            if (t >= seconds) return resolve(times)
            const wave = Math.sin(t * Math.PI)
            if (motion === "hover") {
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
        }),
      [motion, seconds] as const
    )
  )
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
    ...(hot ? { hot } : {})
  }
}

/**
 * Selects designs one after another, or edits them, timing how long each change takes to settle. An edit adds a space
 * to the design's name in memory, neither saved nor undoable, and takes it out again untimed.
 */
async function timeChanges(page: Page, cdp: CDPSession, change: "select" | "edit"): Promise<Result["select"]> {
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
async function hiddenTab(page: Page, cdp: CDPSession, frames: number): Promise<Result["hidden"]> {
  const counts = async () => {
    await cdp.send("HeapProfiler.collectGarbage")
    const { metrics } = await cdp.send("Performance.getMetrics")
    const value = (name: string) => metrics.find((metric) => metric.name === name)?.value ?? 0
    return { nodes: value("Nodes"), heapMb: Math.round(value("JSHeapUsedSize") / 1048576) }
  }
  const shown = await counts()
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
  const hidden = await counts()
  const back = await page.evaluate(
    async ([url, id, frames]) => {
      const { workspace } = (await import(url)) as { workspace: Workspace }
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
      const drawn = () =>
        [...document.querySelectorAll("[data-frame]")].filter(
          (host) => !host.closest("[hidden]") && host.shadowRoot?.querySelector("[data-canvas-node]")
        ).length
      const started = performance.now()
      let last = started
      let longest = 0
      workspace.activate(id)
      while (drawn() < frames && performance.now() - started < 10_000) {
        await frame()
        longest = Math.max(longest, performance.now() - last)
        last = performance.now()
      }
      await frame()
      await frame()
      return { ms: performance.now() - started, longest }
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
    backLongestMs: round(back.longest),
    resizedDrawn: resizedDrawn.length,
    resizedLater: resizedLater.length,
    resized: resizedLater
  }
}

async function memory(page: Page, cdp: CDPSession): Promise<Record<string, number>> {
  const { metrics } = await cdp.send("Performance.getMetrics")
  const heap = metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value ?? 0
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

/** The functions that spent the most time themselves in a sampled profile, by name and place in the source. */
function hottest(profile: {
  nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number } }[]
  samples?: number[]
  timeDeltas?: number[]
}): Hot[] {
  const byNode = new Map(profile.nodes.map((node) => [node.id, node.callFrame]))
  const totals = new Map<string, number>()
  for (const [index, id] of (profile.samples ?? []).entries()) {
    const frame = byNode.get(id)
    if (!frame || ["(idle)", "(program)", "(root)"].includes(frame.functionName)) continue
    const file = frame.url.replace(/^.*\/\/[^/]+/, "").replace(/\?.*$/, "")
    const at = `${frame.functionName || "(anonymous)"} ${file}:${frame.lineNumber + 1}`
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
  console.log(
    `${result.census.designs} designs, ${result.census.frames} frames, ${result.census.frameElements} elements in frames, ` +
      `${result.census.width}×${result.census.height} at ${result.census.pixelRatio}x`
  )
  if (result.census.bitmaps) {
    console.log(`${result.census.bitmaps} frames had bitmaps, ${result.census.bitmapSeconds}s after the frames settled`)
  }
  if (previous && previous.census.frameElements !== result.census.frameElements) {
    console.log(
      `  (the earlier run had ${previous.census.designs} designs and ${previous.census.frameElements} elements)`
    )
  }
  for (const run of result.runs) {
    const before = previous?.runs.find((candidate) => candidate.name === run.name)
    console.log(`\n${run.name}${run.hidden ? " (the window was hidden, so these don't count)" : ""}`)
    console.log(`  fps               ${column(run.fps, before?.fps)}`)
    console.log(`  frame p50 ms      ${column(run.frameMs.p50, before?.frameMs.p50)}`)
    console.log(`  frame p90 ms      ${column(run.frameMs.p90, before?.frameMs.p90)}`)
    console.log(`  frame max ms      ${column(run.frameMs.max, before?.frameMs.max)}`)
    for (const [key, value] of Object.entries(run.perFrame)) {
      console.log(`  ${`${key} ms/frame`.padEnd(18)}${column(value, before?.perFrame[key])}`)
    }
    console.log(`  styled/frame      ${column(run.styledPerFrame, before?.styledPerFrame)}`)
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
    console.log(`  back drawn ms     ${column(result.hidden.backMs, before?.backMs)}`)
    console.log(`  back longest ms   ${column(result.hidden.backLongestMs, before?.backLongestMs)}`)
    console.log(`  boards resized    ${result.hidden.resizedDrawn} once drawn, ${result.hidden.resizedLater} after 3 s`)
    for (const board of result.hidden.resized?.slice(0, 10) ?? []) console.log(`    ${board}`)
  }
  console.log(`\nmemory MB`)
  for (const [role, value] of Object.entries(result.memoryMb)) {
    console.log(`  ${role.padEnd(13)}${column(value, previous?.memoryMb[role])}`)
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
