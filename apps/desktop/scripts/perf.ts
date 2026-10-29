// Measures how the canvas copes with a project: the frame rate while the camera zooms and pans every frame, where each
// frame's time goes (style, layout, paint, raster), how long selecting a design takes to settle, and memory. It starts
// its own copy of the app on its own ports and profile, so a copy already running is left alone, and stops it after.
// Results go to .inspect/perf/<label>.json; --compare prints another run's numbers beside them.
// Usage: pnpm perf [--label name] [--compare name] [--project root] [--seconds 4] [--css "rules"] [--profile] [--keep]
//   --css      adds a stylesheet to the page before measuring, to try an idea without changing the code
//   --profile  samples the page's JavaScript too, and lists the functions that took the most time in each run
//   --keep     leaves the app running afterwards
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
const keep = args.includes("--keep")
const profiling = args.includes("--profile")

/** A function's own time over a run, with `--profile`. */
interface Hot {
  at: string
  ms: number
}

interface Run {
  name: string
  fps: number
  frameMs: { p50: number; p90: number; max: number }
  /** Main-thread milliseconds per frame. */
  perFrame: Record<string, number>
  /** Elements whose style was recalculated, per frame. */
  styledPerFrame: number
  hot?: Hot[]
}

interface Result {
  label: string
  date: string
  project: string
  css?: string
  census: Record<string, number>
  runs: Run[]
  select: { medianMs: number; maxMs: number; mainMsPerSelect: number; hot?: Hot[] }
  memoryMb: Record<string, number>
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
    PARITY_DEBUG_PORT: String(debugPort),
    PARITY_USER_DATA: profileDir
  },
  stdio: ["ignore", "ignore", "inherit"]
})

try {
  const page = await connect()
  const result = await measure(page)
  await writeFile(join(outDir, `${label}.json`), JSON.stringify(result, null, 2))
  const previous = compare ? (JSON.parse(await readFile(join(outDir, `${compare}.json`), "utf8")) as Result) : undefined
  report(result, previous)
  console.log(`\nSaved ${join(outDir, `${label}.json`)}`)
} finally {
  if (!keep) stop(runner)
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
  // The app's own module instance, as Vite serves it to the page.
  await page.evaluate(async (url) => {
    const { workspace } = (await import(url)) as { workspace: Workspace }
    ;(window as unknown as { perfSession: unknown }).perfSession = workspace.getActive()?.session
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
      width: innerWidth,
      height: innerHeight,
      pixelRatio: devicePixelRatio
    }
  })

  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Performance.enable")
  const runs: Run[] = []
  for (const motion of ["zoom", "pan", "pan at 100%"] as const) {
    runs.push(await moveCamera(page, cdp, motion))
    // What the camera rests on afterwards, to check by eye that the canvas still draws as it should.
    await page.waitForTimeout(1500)
    if (motion !== "pan") await page.screenshot({ path: join(outDir, `${label}-${motion.replace(/\W+/g, "-")}.png`) })
  }
  const select = await selectDesigns(page, cdp)
  const memoryMb = await memory(page, cdp)
  await cdp.detach()
  return {
    label,
    date: new Date().toISOString(),
    project,
    ...(css ? { css } : {}),
    census,
    runs,
    select,
    memoryMb
  }
}

/** Moves the camera every frame for a few seconds, from the whole project in view or from 100% on the first design. */
async function moveCamera(page: Page, cdp: CDPSession, motion: "zoom" | "pan" | "pan at 100%"): Promise<Run> {
  await page.evaluate((motion) => {
    const editor = perfEditor()
    if (motion === "pan at 100%") {
      const first = editor.getCurrentPageShapesSorted()[0]
      const bounds = first && editor.getShapePageBounds(first)
      if (bounds) editor.centerOnPoint(bounds.center, { animation: { duration: 0 } })
      editor.setCamera({ ...editor.getCamera(), z: 1 }, { immediate: true })
      if (bounds) editor.centerOnPoint(bounds.center, { animation: { duration: 0 } })
    } else editor.zoomToFit({ animation: { duration: 0 } })

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
            if (motion === "zoom") {
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

/** Selects designs one after another, timing how long each takes to settle. */
async function selectDesigns(page: Page, cdp: CDPSession): Promise<Result["select"]> {
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
    page.evaluate(async () => {
      const session = (window as unknown as PerfWindow).perfSession
      const keys = session.store
        .getEntries()
        .slice(0, 20)
        .map((entry) => entry.key)
      const times: number[] = []
      for (const key of keys) {
        await new Promise((resolve) => requestAnimationFrame(resolve))
        const start = performance.now()
        session.selection.set({ design: key })
        // React renders a store change in a microtask; a timeout runs after it and its effects.
        await new Promise((resolve) => setTimeout(resolve, 0))
        times.push(performance.now() - start)
      }
      session.selection.set({})
      return times
    })
  )
  const sorted = [...times].sort((a, b) => a - b)
  return {
    medianMs: round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    maxMs: round(sorted.at(-1) ?? 0),
    mainMsPerSelect: round((metrics.TaskDuration! * 1000) / Math.max(1, times.length)),
    ...(hot ? { hot } : {})
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
  if (previous && previous.census.frameElements !== result.census.frameElements) {
    console.log(
      `  (the earlier run had ${previous.census.designs} designs and ${previous.census.frameElements} elements)`
    )
  }
  for (const run of result.runs) {
    const before = previous?.runs.find((candidate) => candidate.name === run.name)
    console.log(`\n${run.name}`)
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
  console.log(`\nselect a design`)
  console.log(`  median ms         ${column(result.select.medianMs, previous?.select.medianMs)}`)
  console.log(`  max ms            ${column(result.select.maxMs, previous?.select.maxMs)}`)
  console.log(`  main ms each      ${column(result.select.mainMsPerSelect, previous?.select.mainMsPerSelect)}`)
  printHot(result.select.hot)
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
