// Measures how smoothly other people's pointers move in a live room (PAR-1307; docs/editor.md, "A live room"). It starts
// two copies of the app on their own ports and one profile with Live room on, side by side, opens the same project in
// both, and has one person move their pointer over the canvas in a steady circle, up to 125 moves a second, while the other
// copy watches. For each direction it records:
//   - sent: how far apart the mover's copy posts batches with a pointer in them, from its network log
//   - arrived: how far apart those pointers reach the watching copy, from its stream of server-sent events
//   - drawn: in the watching copy, every frame's length and how far the mover's pointer moved on screen in it, so frames
//     where it stood still while positions kept coming ("stalls") and its biggest single-frame jump show
// Then, with the guest editing and the host watching (PAR-1325):
//   - edits: edit to screen, from the guest's edit to the first frame the host draws with it, for a board drag, a style
//     change, typing and a token change, each made 20 times through the guest's document, and the host's share of it,
//     from the change arriving to that frame, and to the last change it caused in the board's frames ("settled")
//   - drag: the host's frames and long tasks while the guest drags a board for --seconds, a write every frame in one
//     gesture, as a drag writes it
//   - join: how long the guest takes to open the project again on the host's snapshot, to its first board drawn, and
//     the snapshot's size
// The host's JavaScript is profiled during each kind of edit and the drag, saved as <label>.*.cpuprofile and summed by
// function, with and without what each called.
// Both copies close afterwards. Results go to .inspect/room-perf/<label>.json, with each frame's length and step in
// <label>.<mover>.frames.json; --compare prints another run's beside them. Both copies open a copy of the project, so
// the edits never reach the project given.
// Usage: node scripts/room-perf.ts [--label name] [--compare name] [--seconds 8] [--busy 0] [--project root] [--keep]
//                                   [--runs "pointer, edits, drag, join"]
//   --runs  only these measurements, by name; all of them unless given
//   --busy  keeps the moving copy's main thread busy for this many milliseconds every 250 ms, as rendering or an edit
//           does, which holds back the positions it sends
//   --keep  leaves both copies running afterwards, until the script is stopped
// PARITY_ROOM_PERF_PORTS chooses the first copy's UI and DevTools ports (5330,9350); the second takes the next of each.
import { type ChildProcess, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { type Browser, chromium, type Page } from "playwright-core"
import { print } from "../../../scripts/output.ts"
import {
  editKinds,
  editsToScreen,
  joinAgain,
  type ProfileSummary,
  profiled,
  remoteDrag,
  withDocs
} from "./room-edits.ts"

const appDir = resolve(import.meta.dirname, "..")
const repoDir = resolve(appDir, "../..")
const outDir = join(repoDir, ".inspect/room-perf")
const args = process.argv.slice(2)

const option = (name: string) => {
  const index = args.indexOf(`--${name}`)

  return index === -1 ? undefined : args[index + 1]
}

const label = option("label") ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")
const compare = option("compare")
const seconds = Number(option("seconds") ?? 8)
const busyMs = Number(option("busy") ?? 0)
const given = resolve(option("project") ?? join(repoDir, "examples/shadcn-vite"))
const keep = args.includes("--keep")
const runs = new Set((option("runs") ?? "pointer, edits, drag, join").split(",").map((each) => each.trim()))
const [firstUi, firstDebug] = (process.env.PARITY_ROOM_PERF_PORTS ?? "5330,9350").split(",").map(Number)
const profileDir = join(tmpdir(), `parity-room-perf-${firstUi}`)

/** What both copies open: a copy of the project, since the edits change it and its host may save them. */
const project = join(profileDir, "project")
const windowSize = { width: 940, height: 880 }

interface Copy {
  name: string
  uiPort: number
  debugPort: number
  child: ChildProcess
  browser?: Browser
  page?: Page
}

/** Spreads of milliseconds. */
interface Spread {
  count: number
  p50: number
  p95: number
  max: number
  /** Standard deviation. */
  sd: number
}

/** One direction: one person moves, the other watches. */
interface Direction {
  mover: string
  watcher: string
  /** Pointers posted per second, and how far apart. */
  sentPerSecond: number
  sent: Spread
  arrivedPerSecond: number
  arrived: Spread
  /** The watching copy's frames while the pointer moved. */
  frames: Spread
  /** The share of the watcher's frames, while positions kept coming, in which the pointer didn't move on screen. */
  stalledShare: number
  /** The longest run of frames in a row in which it didn't move, in milliseconds. */
  longestStallMs: number
  /** How far it moved in a frame, in pixels: the median and the most. */
  stepPx: { p50: number; max: number }
  /** The mover's own frames while moving. */
  moverFrames: Spread
}

interface Result {
  label: string
  date: string
  seconds: number
  busyMs: number
  directions: Direction[]
  /** Edit to screen, by edit, and the watcher's own share, from the change arriving to its frame. */
  edits?: { edit: string; toScreen: Spread; arrivedToScreen: Spread; toFrame: Spread }[]
  /** The watcher's frames and long tasks while the mover dragged a board. */
  drag?: { frames: Spread; longTasks: number; longTaskMs: number; longestTaskMs: number; changes: number }
  /** Where the watcher's main thread spent its time while the edits came in, and during the drag. */
  editsProfiles?: Record<string, ProfileSummary>
  dragProfile?: ProfileSummary
  /** The guest opening the project again on the host's snapshot. */
  join?: { ms: number; snapshotBytes: number }
}

await mkdir(outDir, { recursive: true })

// The link to the project's node_modules goes first, on its own, so clearing the folder never reaches through it.
await rm(join(project, "node_modules"), { force: true })

await rm(profileDir, { recursive: true, force: true })

await mkdir(profileDir, { recursive: true })

await cp(given, project, { recursive: true, filter: (from) => !/[\\/](node_modules|dist|\.git)$/.test(from) })

if (existsSync(join(given, "node_modules"))) {
  await symlink(join(given, "node_modules"), join(project, "node_modules"), "junction")
}

await writeFile(
  join(profileDir, "settings.json"),
  JSON.stringify({ extensions: { multiplayer: { liveRoom: true } } }, null, 2)
)

const copies: Copy[] = []

try {
  // The first copy hosts; the second joins once the first has the project open, as two people would.
  const host = launch("Andrew", firstUi!, firstDebug!)
  copies.push(host)
  await ready(host, 0)
  const guest = launch("Mia", firstUi! + 1, firstDebug! + 1)
  copies.push(guest)
  await ready(guest, 1)
  // Each sees the other's pointer once it's moved over the canvas.
  await guest.page!.waitForTimeout(3000)

  const directions = runs.has("pointer") ? [await measured(guest, host, 1), await measured(host, guest, 0)] : []
  const result: Result = { label, date: new Date().toISOString(), seconds, busyMs, directions }

  if (runs.has("edits") || runs.has("drag") || runs.has("join")) {
    await withDocs([host.page!, guest.page!])
  }

  // The guest edits and the host watches.
  if (runs.has("edits")) {
    print(`\n${guest.name} edits, ${host.name} watches`)

    result.edits = []
    result.editsProfiles = {}

    // Each kind of edit profiled on its own, so where each one's time goes shows apart.
    for (const kind of editKinds) {
      await inView(guest, host)
      const file = join(outDir, `${label}.edits.${kind.replace(" ", "-")}.cpuprofile`)

      const { result: edits, profile } = await profiled(host.page!, file, () =>
        editsToScreen(guest.page!, host.page!, [kind])
      )

      result.editsProfiles[kind] = profile

      for (const each of edits) {
        result.edits.push({
          edit: each.edit,
          toScreen: spread(each.toScreen),
          arrivedToScreen: spread(each.arrivedToScreen),
          toFrame: spread(each.toFrame)
        })
      }
    }
  }

  if (runs.has("drag")) {
    print(`\n${guest.name} drags a board, ${host.name} watches`)
    await inView(guest, host)

    const { result: drag, profile } = await profiled(host.page!, join(outDir, `${label}.drag.cpuprofile`), () =>
      remoteDrag(guest.page!, host.page!, seconds)
    )

    result.dragProfile = profile
    result.drag = {
      frames: spread(drag.frames),
      longTasks: drag.longTasks.length,
      longTaskMs: round(drag.longTasks.reduce((total, each) => total + each, 0)),
      longestTaskMs: round(Math.max(0, ...drag.longTasks)),
      changes: drag.changes
    }
  }

  if (runs.has("join")) {
    print(`\n${guest.name} opens the project again`)
    const join = await joinAgain(guest.page!)
    result.join = { ms: round(join.ms), snapshotBytes: join.snapshotBytes }
  }

  await writeFile(join(outDir, `${label}.json`), JSON.stringify(result, null, 2))
  // SAFETY: the file is an earlier run's result, which this script wrote from a `Result` as it writes this one.
  const previous = compare ? (JSON.parse(await readFile(join(outDir, `${compare}.json`), "utf8")) as Result) : undefined
  report(result, previous)
  print(`\nSaved ${join(outDir, `${label}.json`)}`)
} finally {
  for (const copy of copies) {
    await copy.browser?.close().catch(() => undefined)
  }

  if (keep) {
    print("Both copies keep running until this script is stopped")
  } else {
    for (const copy of copies) {
      stop(copy.child)
    }
  }
}

function launch(name: string, uiPort: number, debugPort: number): Copy {
  print(`Starting ${name}'s copy on ${uiPort}`)

  const child = spawn(process.execPath, [join(appDir, "scripts/dev.ts"), "--react", "production", project], {
    cwd: appDir,
    env: {
      ...process.env,
      PARITY_TEST_RUN: process.env.PARITY_TEST_RUN || `room-perf-${new Date().toISOString()}`,
      PARITY_UI_PORT: String(uiPort),
      PARITY_UI_FROZEN: "1",
      PARITY_DEBUG_PORT: String(debugPort),
      // One profile, so Live room is on in both, as docs/editor.md runs two copies.
      PARITY_USER_DATA: profileDir,
      PARITY_ROOM_NAME: name,
      PARITY_SIGNED_IN_AS: JSON.stringify({ email: "room-perf@parity.test", name }),
      PARITY_CACHE_DIR: join(profileDir, `detection-${uiPort}`),
      PARITY_WINDOW_SIZE: `${windowSize.width}x${windowSize.height}`,
      PARITY_AGENT_FILE: join(profileDir, `agent-${uiPort}.json`)
    },
    stdio: ["ignore", "ignore", "inherit"]
  })

  return { name, uiPort, debugPort, child }
}

/** Waits for the copy's window to show the project's canvas, and puts it on the screen's left or right half. */
async function ready(copy: Copy, side: 0 | 1): Promise<void> {
  const deadline = Date.now() + 240_000

  while (!copy.page && Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${copy.debugPort}`)

      const page = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((each) => each.url().startsWith(`http://localhost:${copy.uiPort}`) && !each.url().includes("render"))

      if (page) {
        copy.browser = browser
        copy.page = page
      } else {
        await browser.close()
      }
    } catch {
      // Not listening yet.
    }

    if (!copy.page) {
      await new Promise((done) => setTimeout(done, 500))
    }
  }

  const page = copy.page

  if (!page) {
    throw new Error(`${copy.name}'s window didn't appear`)
  }

  await page.waitForSelector(".tl-canvas", { state: "attached", timeout: 240_000 })
  await page.evaluate((name) => {
    document.title = `Parity (room-perf: ${name}, closes by itself)`
  }, copy.name)

  // Side by side, both in view and on top, as two people trying a room on one screen see them: a covered window draws
  // one frame a second. Electron's DevTools can't move windows, so on Windows it's done by the window's title; elsewhere
  // they stay where they open, and nothing should cover them.
  if (process.platform === "win32") {
    await placeWindow(`room-perf: ${copy.name}`, side)
  }

  await page.waitForTimeout(2000)
  print(`${copy.name}'s copy has the project open`)
}

/** Puts the window whose title has `title` on the left or right half of the main screen's working area. */
/**
 * Puts both windows back side by side and on top, and checks the watcher draws at the screen's rate: a covered or
 * minimized window draws a frame a second, which would count as the room being slow.
 */
async function inView(mover: Copy, watcher: Copy): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (process.platform === "win32") {
      await placeWindow(`room-perf: ${mover.name}`, 1)
      await placeWindow(`room-perf: ${watcher.name}`, 0)
    }

    await watcher.page!.waitForTimeout(500)

    const frameMs = await watcher.page!.evaluate(
      () =>
        new Promise<number>((done) => {
          const times: number[] = []

          const frame = (now: number) => {
            times.push(now)

            if (times.length < 11) {
              requestAnimationFrame(frame)
            } else {
              done((times.at(-1)! - times[0]!) / 10)
            }
          }

          requestAnimationFrame(frame)
        })
    )

    if (frameMs < 40) {
      return
    }

    print(`${watcher.name}'s window drew a frame every ${Math.round(frameMs)} ms, so it's put on top again`)
  }

  throw new Error(`${watcher.name}'s window won't draw at the screen's rate, so these numbers wouldn't count`)
}

async function placeWindow(title: string, side: 0 | 1): Promise<void> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Place {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int ht, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int how);
}
'@
[Place]::SetProcessDPIAware() | Out-Null
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$half = [int]($area.Width / 2)
$window = Get-Process | Where-Object { $_.MainWindowTitle -like '*${title}*' } | Select-Object -First 1
# A window that's minimized or covered draws one frame a second, so it's restored (9) and kept on top (-1) until it closes.
if ($window) {
  [Place]::ShowWindow($window.MainWindowHandle, 9) | Out-Null
  [Place]::SetWindowPos($window.MainWindowHandle, [IntPtr](-1), $area.X + ${side} * $half, $area.Y, $half, $area.Height, 0x40) | Out-Null
}
`

  await new Promise((done) => {
    spawn("powershell", ["-NoProfile", "-Command", script], { stdio: "ignore" }).once("exit", done)
  })
}

/**
 * One direction, measured again once if either window was drawing a frame a second, as a minimized or covered one does:
 * both are put back side by side and on top first.
 */
async function measured(mover: Copy, watcher: Copy, moverSide: 0 | 1): Promise<Direction> {
  for (let attempt = 0; ; attempt++) {
    if (process.platform === "win32") {
      await placeWindow(`room-perf: ${mover.name}`, moverSide)
      await placeWindow(`room-perf: ${watcher.name}`, moverSide === 0 ? 1 : 0)
      await mover.page!.waitForTimeout(500)
    }

    const result = await direction(mover, watcher)
    const throttled = result.frames.p50 > 40 || result.moverFrames.p50 > 40

    if (!throttled || attempt === 1) {
      if (throttled) {
        console.warn(`A window drew a frame a second while ${mover.name} moved, so these numbers don't count`)
      }

      return result
    }

    print("A window drew a frame a second, so this is measured again")
  }
}

/** `mover` moves their pointer in a circle over the canvas while `watcher` records what arrives and what it draws. */
async function direction(mover: Copy, watcher: Copy): Promise<Direction> {
  const moverPage = mover.page!
  const watcherPage = watcher.page!
  print(`${mover.name} moves, ${watcher.name} watches`)

  const sent: number[] = []
  const arrived: number[] = []
  /** What arrived, to replay by hand: when, and the pointer as sent. */
  const pointers: unknown[] = []
  const moverCdp = await moverPage.context().newCDPSession(moverPage)
  const watcherCdp = await watcherPage.context().newCDPSession(watcherPage)
  await moverCdp.send("Network.enable")
  await watcherCdp.send("Network.enable")

  moverCdp.on("Network.requestWillBeSent", ({ request, timestamp }) => {
    if (request.url.includes("/send?") && request.postData?.includes('"pointer"')) {
      sent.push(timestamp * 1000)
    }
  })

  watcherCdp.on("Network.eventSourceMessageReceived", ({ data, timestamp }) => {
    if (data.includes('"pointer"') && data.includes(`"name":"${mover.name}"`)) {
      arrived.push(timestamp * 1000)
      pointers.push([timestamp * 1000, JSON.parse(data).data.presence.pointer])
    }
  })

  // The canvas's middle, in each page's own coordinates.
  const area = await moverPage.evaluate(() => {
    const box = document.querySelector(".tl-canvas")!.getBoundingClientRect()

    return { x: box.left + box.width / 2, y: box.top + box.height / 2, r: Math.min(box.width, box.height) / 4 }
  })

  await moverPage.mouse.move(area.x + area.r, area.y)
  await moverPage.waitForTimeout(1000)
  await startSampling(watcherPage, mover.name)
  await startSampling(moverPage, undefined)

  if (busyMs > 0) {
    await moverPage.evaluate((ms) => {
      const busy = setInterval(() => {
        const until = performance.now() + ms

        while (performance.now() < until) {
          // Held, as a long task holds it.
        }
      }, 250)

      window.roomPerfBusy = () => clearInterval(busy)
    }, busyMs)
  }

  // Only what's sent while moving counts, not the pause before.
  sent.length = 0
  arrived.length = 0
  pointers.length = 0

  // A circle every two seconds, a move every 8 ms, as a person's mouse sends them. Like a mouse, it doesn't wait for the
  // page: each move is stamped with when it happened, and a busy page takes it in when it can.
  const began = Date.now()
  const moves: Promise<unknown>[] = []

  while (Date.now() - began < seconds * 1000) {
    const angle = ((Date.now() - began) / 2000) * Math.PI * 2

    moves.push(
      moverCdp
        .send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: area.x + Math.cos(angle) * area.r,
          y: area.y + Math.sin(angle) * area.r,
          timestamp: Date.now() / 1000
        })
        .catch(() => undefined)
    )
    await new Promise((done) => setTimeout(done, 8))
  }

  await Promise.all(moves)

  const watched = await stopSampling(watcherPage)
  const own = await stopSampling(moverPage)
  await moverPage.evaluate(() => window.roomPerfBusy?.())
  await moverCdp.detach()
  await watcherCdp.detach()
  // The pointer goes still between runs, so the next run's first gap isn't this one's tail.
  await moverPage.waitForTimeout(1500)

  const steps = watched.steps
  // Every frame's step, to look at by hand.
  await writeFile(
    join(outDir, `${label}.${mover.name}.frames.json`),
    JSON.stringify({
      frames: steps.map((step) => [Math.round(step.ms * 10) / 10, Math.round(step.px * 100) / 100]),
      pointers
    })
  )
  // Frames while positions kept coming: from the first in which the pointer moved, since it's drawn a little behind on
  // purpose, to the last.
  const started = steps.findIndex((step) => step.seen && step.px >= 0.05)

  // A pointer that never arrived or never moved would read as perfectly smooth, so the run doesn't count.
  if (started === -1 || arrived.length === 0) {
    throw new Error(
      `${watcher.name} never saw ${mover.name}'s pointer move (${arrived.length} positions arrived), so the room or the pointer isn't working`
    )
  }

  const moving = steps.slice(started)
  let stalled = 0
  let run = 0
  let longest = 0

  for (const step of moving) {
    if (step.px < 0.05) {
      stalled += 1
      run += step.ms
      longest = Math.max(longest, run)
    } else {
      run = 0
    }
  }

  const px = moving.map((step) => step.px).toSorted((a, b) => a - b)

  return {
    mover: mover.name,
    watcher: watcher.name,
    sentPerSecond: round(sent.length / seconds),
    sent: spread(gaps(sent)),
    arrivedPerSecond: round(arrived.length / seconds),
    arrived: spread(gaps(arrived)),
    frames: spread(steps.map((step) => step.ms)),
    stalledShare: round(moving.length === 0 ? 0 : stalled / moving.length),
    longestStallMs: round(longest),
    stepPx: { p50: round(px[Math.floor(px.length / 2)] ?? 0), max: round(px.at(-1) ?? 0) },
    moverFrames: spread(own.steps.map((step) => step.ms))
  }
}

interface Sampled {
  steps: { ms: number; px: number; seen: boolean }[]
}

declare global {
  interface Window {
    /** What the page records while it's measured. */
    roomPerf?: Sampled & { running: boolean }
    /** Stops `--busy` holding the main thread. */
    roomPerfBusy?: () => void
  }
}

/**
 * Starts recording, every frame, its length and how far `name`'s pointer moved on screen in it, read from where it's
 * drawn (its bounding box, which a CSS transition or a per-frame transform both move).
 */
async function startSampling(page: Page, name: string | undefined): Promise<void> {
  await page.evaluate((watched) => {
    const steps: Sampled["steps"] = []
    const state = { steps, running: true }
    window.roomPerf = state
    let last = performance.now()
    let at: { x: number; y: number } | undefined

    const find = () =>
      watched === undefined
        ? undefined
        : [...document.querySelectorAll<HTMLElement>("[data-remote-pointer], .group\\/cursor")].find((each) =>
            each.textContent?.includes(watched)
          )

    const frame = (now: number) => {
      if (!state.running) {
        return
      }

      const box = find()?.getBoundingClientRect()
      const next = box && { x: box.left, y: box.top }
      const px = at && next ? Math.hypot(next.x - at.x, next.y - at.y) : 0
      state.steps.push({ ms: now - last, px, seen: at !== undefined && next !== undefined })
      at = next
      last = now
      requestAnimationFrame(frame)
    }

    requestAnimationFrame(frame)
  }, name)
}

async function stopSampling(page: Page): Promise<Sampled> {
  return page.evaluate(() => {
    const state = window.roomPerf ?? { steps: [], running: false }
    state.running = false

    return { steps: state.steps.slice(1) }
  })
}

function gaps(times: number[]): number[] {
  return times.slice(1).map((time, index) => time - times[index]!)
}

function spread(values: number[]): Spread {
  const sorted = values.toSorted((a, b) => a - b)
  const mean = sorted.reduce((total, each) => total + each, 0) / Math.max(1, sorted.length)
  const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0

  return {
    count: sorted.length,
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    max: round(sorted.at(-1) ?? 0),
    sd: round(Math.sqrt(sorted.reduce((total, each) => total + (each - mean) ** 2, 0) / Math.max(1, sorted.length)))
  }
}

function report(result: Result, previous: Result | undefined): void {
  const ms = (each: Spread) => `p50 ${each.p50} ms, p95 ${each.p95} ms, max ${each.max} ms`

  for (const each of result.edits ?? []) {
    print(`\n${each.edit}: edit to first frame ${ms(each.toScreen)}; arriving to it ${ms(each.arrivedToScreen)}`)
    print(`  edit to settled in its frames ${ms(each.toFrame)}`)
  }

  if (result.drag) {
    const { frames, longTasks, longTaskMs, longestTaskMs, changes } = result.drag
    print(`\nRemote drag, ${changes} changes drawn: frames ${ms(frames)}`)
    print(`  ${longTasks} long tasks, ${longTaskMs} ms in all, the longest ${longestTaskMs} ms`)
  }

  for (const [name, profile] of [
    ...Object.entries(result.editsProfiles ?? {}),
    ["drag", result.dragProfile] as const
  ]) {
    if (profile) {
      print(`
The watcher's JavaScript during the ${name}, ${profile.sampledMs} ms sampled; the most with what it called:`)
      profile.total.slice(0, 20).forEach((each) => print(`  ${String(each.ms).padStart(8)} ms  ${each.name}`))
      print("  The most by itself:")
      profile.self.slice(0, 15).forEach((each) => print(`  ${String(each.ms).padStart(8)} ms  ${each.name}`))
    }
  }

  if (result.join) {
    print(`\nJoining again: ${result.join.ms} ms, on a snapshot of ${Math.round(result.join.snapshotBytes / 1024)} KB`)
  }

  for (const each of result.directions) {
    const before = previous?.directions.find((other) => other.mover === each.mover)
    const was = (value: number | undefined) => (value === undefined ? "" : `  (was ${value})`)

    const line = (name: string, now: Spread, then: Spread | undefined) =>
      print(
        `  ${name.padEnd(16)} p50 ${now.p50} ms, p95 ${now.p95} ms, max ${now.max} ms, sd ${now.sd} ms${was(then?.p95)}`
      )

    print(`\n${each.mover} moves, ${each.watcher} watches`)
    print(`  sent             ${each.sentPerSecond}/s${was(before?.sentPerSecond)}`)
    line("  apart", each.sent, before?.sent)
    print(`  arrived          ${each.arrivedPerSecond}/s${was(before?.arrivedPerSecond)}`)
    line("  apart", each.arrived, before?.arrived)
    line("watcher frames", each.frames, before?.frames)
    line("mover frames", each.moverFrames, before?.moverFrames)
    print(`  stalled frames   ${Math.round(each.stalledShare * 100)}%${was(before?.stalledShare)}`)
    print(`  longest stall    ${each.longestStallMs} ms${was(before?.longestStallMs)}`)
    print(`  step             p50 ${each.stepPx.p50} px, max ${each.stepPx.max} px${was(before?.stepPx.max)}`)
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function stop(child: ChildProcess): void {
  // On Windows only a tree kill ends the runner's Electron and servers at once.
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"])
  } else {
    child.kill()
  }
}
