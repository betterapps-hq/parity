import { z } from "zod"
import { ms } from "./attributes.ts"
import { defineEvent } from "./events.ts"

/*
 * The app's own life: starting, quitting, updates, memory and the hangs and long tasks that make it feel slow
 * (PAR-631). The definitions are here, with the rules that decide when each is sent, so they're tested without
 * Electron; the app measures and records them.
 */

const channel = z.enum(["stable", "beta"]).describe("The update channel this install takes")
const version = z.string().describe("The version running now")

export const appStarted = defineEvent(
  "app.started",
  z.object({
    mainReadyMs: ms("From the process starting to Electron being ready"),
    windowShownMs: ms("From the process starting to the first window being created and shown"),
    firstPaintMs: ms("From the process starting to the first window's first paint"),
    serviceReadyMs: ms("From the process starting to the project service starting to run")
  }),
  { level: "info", sentBy: ["main"], when: "The first window has painted and the project service is running." }
)

export const appFirstProject = defineEvent(
  "app.first_project",
  z.object({
    firstProjectMs: ms("From the process starting to the first project's tab being ready to draw"),
    restored: z
      .boolean()
      .describe("Whether the window opened it as it started, as last time's tabs, rather than the person choosing it")
  }),
  { level: "info", sentBy: ["main"], when: "The first project opened since the app started has its tab ready to draw." }
)

export const appQuit = defineEvent(
  "app.quit",
  z.object({
    reason: z
      .enum(["window closed", "update", "other"])
      .describe("How it quit: the last window closed, to install an update, or otherwise, as from the menu"),
    sessionMs: ms("How long this run lasted")
  }),
  { level: "info", sentBy: ["main"], when: "The app quits." }
)

export const updateChecked = defineEvent(
  "update.checked",
  z.object({
    channel,
    version,
    available: z.string().optional().describe("The newer version found, if there was one")
  }),
  { level: "info", sentBy: ["main"], when: "A check for an update finds one or finds none." }
)

export const updateDownloaded = defineEvent(
  "update.downloaded",
  z.object({ channel, version, available: z.string().describe("The version downloaded") }),
  { level: "info", sentBy: ["main"], when: "An update finishes downloading." }
)

export const updateInstalled = defineEvent(
  "update.installed",
  z.object({ channel, version, available: z.string().describe("The version being installed") }),
  { level: "info", sentBy: ["main"], when: "The app quits to install a downloaded update." }
)

export const updateFailed = defineEvent(
  "update.failed",
  z.object({
    channel,
    version,
    stage: z.enum(["check", "download", "install"]).describe("What was under way when it failed"),
    message: z.string().describe("What went wrong")
  }),
  { level: "warn", sentBy: ["main"], when: "Checking for, downloading or installing an update fails." }
)

const bytes = (meaning: string) => z.number().int().nonnegative().describe(meaning)

export const processMemory = defineEvent(
  "process.memory",
  z.object({
    reason: z.enum(["interval", "hang"]).describe("Whether it's the regular reading or one taken as a window hung"),
    mainBytes: bytes("The app's main process's private memory in bytes"),
    serviceBytes: bytes("The project service's private memory in bytes, or 0 while none runs"),
    editorBytes: bytes("Every editor window's private memory together, in bytes"),
    renderBytes: bytes("The offscreen renderers' private memory together, in bytes"),
    totalBytes: bytes("Every process's private memory together, in bytes, counting builders, the GPU and helpers"),
    processes: z
      .array(
        z.object({
          role: z.string().describe("What the process does: app, window, offscreen, service, builder, gpu or helper"),
          memory: z.number().int().nonnegative().describe("Its private memory in bytes")
        })
      )
      .describe("Each process's role and private memory in bytes, as the system's monitor counts it")
  }),
  { level: "info", sentBy: ["main"], when: "Every 5 minutes, and when a window stops answering." }
)

export const serviceLag = defineEvent(
  "service.lag",
  z.object({ lateMs: ms("How late the service's timer ran, which is how long its event loop was blocked") }),
  { level: "warn", sentBy: ["service"], when: "The project service's event loop is late by over 200 ms." }
)

export const serviceExited = defineEvent(
  "service.exited",
  z.object({
    exitCode: z.number().int().describe("The code the project service exited with"),
    ranMs: ms("How long it ran before it exited"),
    restarted: z
      .boolean()
      .describe(
        "Whether a fresh service took its place as it exited. A crashed one is started again when a window loads"
      )
  }),
  {
    level: "warn",
    sentBy: ["main"],
    when: "The project service exits while the app runs: it failed, or a fresh one replaced it. Not as the app quits."
  }
)

export const windowHung = defineEvent(
  "window.hung",
  z.object({
    window: z
      .enum(["renderer", "render"])
      .describe("Which window: `renderer` for the editor's, `render` for an offscreen one drawing frames"),
    stuckMs: ms("How long the window didn't answer")
  }),
  { level: "warn", sentBy: ["main"], when: "A window that stopped answering answers again." }
)

export const mainBlocked = defineEvent(
  "main.blocked",
  z.object({ stuckMs: ms("How late main's timer ran, which is how long its event loop was blocked") }),
  { level: "warn", sentBy: ["main"], when: "Main's event loop runs again after being blocked for over 2 seconds." }
)

export const rendererLongTask = defineEvent(
  "renderer.long_task",
  z.object({
    durationMs: ms("How long the task ran"),
    action: z.string().optional().describe("The input that started it, such as `pointerdown` or `keydown`, if any")
  }),
  { level: "info", sentBy: ["renderer"], when: "A task in the editor window runs for over 200 ms." }
)

export const appEvents = [
  appStarted,
  appFirstProject,
  appQuit,
  updateChecked,
  updateDownloaded,
  updateInstalled,
  updateFailed,
  processMemory,
  serviceLag,
  serviceExited,
  windowHung,
  mainBlocked,
  rendererLongTask
] as const

/** How late the service's loop or a window's task may run before it's recorded, in milliseconds. */
export const slowThresholdMs = 200

/** How long a window or main may be stuck before it's recorded as hung, in milliseconds. */
export const hangThresholdMs = 2000

/**
 * The `service.exited` attributes for a project service that exited with `exitCode`, or nothing when the exit is
 * expected: the app quitting, or the service ending cleanly on its own. One `replaced` by a fresh service is restarted.
 */
export function serviceExit({
  exitCode,
  ranMs,
  replaced,
  quitting
}: {
  exitCode: number
  ranMs: number
  replaced: boolean
  quitting: boolean
}): z.input<typeof serviceExited.schema> | undefined {
  if (quitting || (exitCode === 0 && !replaced)) {
    return undefined
  }

  return { exitCode, ranMs: Math.max(0, Math.round(ranMs)), restarted: replaced }
}

/** How often each process's memory is recorded, in milliseconds. */
export const memoryEveryMs = 5 * 60_000

/** A process's role, as the performance stats name it, and its private memory in bytes. */
export interface ProcessMemory {
  role: string
  memory: number
}

/** Which of `process.memory`'s totals each role counts toward, besides `totalBytes`. */
const roleTotals: Record<string, "mainBytes" | "serviceBytes" | "editorBytes" | "renderBytes"> = {
  app: "mainBytes",
  service: "serviceBytes",
  window: "editorBytes",
  "this-window": "editorBytes",
  offscreen: "renderBytes"
}

/**
 * `process.memory`'s attributes from each process's memory: a whole number of bytes per role, which Sentry's logs can
 * chart, and the list they're summed from.
 */
export function memoryRecord(
  reason: "interval" | "hang",
  readings: readonly ProcessMemory[]
): z.input<typeof processMemory.schema> {
  const processes = readings.map(({ role, memory }) => ({ role, memory: Math.round(memory) }))
  const totals = { mainBytes: 0, serviceBytes: 0, editorBytes: 0, renderBytes: 0, totalBytes: 0 }

  for (const { role, memory } of processes) {
    const total = roleTotals[role]

    if (total) {
      totals[total] += memory
    }

    totals.totalBytes += memory
  }

  return { reason, ...totals, processes }
}

/** The steps `app.started` times, and `firstProject`, which `app.first_project` times. */
export type StartupStep = "mainReady" | "windowShown" | "firstPaint" | "serviceReady" | "firstProject"

/** A startup event to record: `app.started` once its steps are in, or `app.first_project`. */
export type StartupRecord =
  | { name: "app.started"; attributes: z.input<typeof appStarted.schema> }
  | { name: "app.first_project"; attributes: z.input<typeof appFirstProject.schema> }

/**
 * Times startup from `origin`, the process starting. Each step counts the first time it's marked. `mark` gives
 * `app.started` once, when its last step is in, and `app.first_project` once, when the first project shows, saying
 * whether it was `restored` from last time.
 */
export function startupTimer(
  origin: number
): (step: StartupStep, at: number, how?: { restored: boolean }) => StartupRecord | undefined {
  const marks = new Map<StartupStep, number>()
  let sent = false

  return (step, at, how) => {
    if (marks.has(step)) {
      return undefined
    }

    const elapsed = Math.max(0, Math.round(at - origin))
    marks.set(step, elapsed)

    if (step === "firstProject") {
      return { name: "app.first_project", attributes: { firstProjectMs: elapsed, restored: how?.restored ?? false } }
    }

    if (sent) {
      return undefined
    }

    const [mainReadyMs, windowShownMs, firstPaintMs, serviceReadyMs] = (
      ["mainReady", "windowShown", "firstPaint", "serviceReady"] as const
    ).map((name) => marks.get(name))

    if (mainReadyMs === undefined || windowShownMs === undefined) {
      return undefined
    }

    if (firstPaintMs === undefined || serviceReadyMs === undefined) {
      return undefined
    }

    sent = true

    return { name: "app.started", attributes: { mainReadyMs, windowShownMs, firstPaintMs, serviceReadyMs } }
  }
}

/**
 * A check on an event loop, from a timer meant to run every `every` milliseconds: each tick says how late it ran when
 * that's over `threshold`. `skip` drops a tick, as after the computer slept.
 */
export function lagCheck({ every, threshold, start }: { every: number; threshold: number; start: number }): {
  tick(now: number, skip?: boolean): number | undefined
} {
  let expected = start + every

  return {
    tick(now, skip = false) {
      const lateMs = Math.round(now - expected)
      expected = now + every

      return !skip && lateMs > threshold ? lateMs : undefined
    }
  }
}

/** The update state each update event is read from: `UpdateState` in `@parity-app/core`. */
export type UpdatePhase =
  | { phase: "disabled" | "idle" | "checking" | "current" }
  | { phase: "downloading" | "ready" | "manual" | "installing"; version: string }
  | { phase: "error"; message: string }

/** An update event to record for a change in the update state, if the change is one. */
export type UpdateRecord =
  | { name: "update.checked"; attributes: z.input<typeof updateChecked.schema> }
  | { name: "update.downloaded" | "update.installed"; attributes: z.input<typeof updateDownloaded.schema> }
  | { name: "update.failed"; attributes: z.input<typeof updateFailed.schema> }

/** The event a change from `previous` to `next` makes, with the running version and the channel. */
export function updateRecord(
  previous: UpdatePhase,
  next: UpdatePhase,
  { version, beta }: { version: string; beta: boolean }
): UpdateRecord | undefined {
  const base = { channel: beta ? ("beta" as const) : ("stable" as const), version }

  if (previous.phase === "checking") {
    if (next.phase === "current") {
      return { name: "update.checked", attributes: base }
    }

    if (next.phase === "downloading" || next.phase === "manual") {
      return { name: "update.checked", attributes: { ...base, available: next.version } }
    }
  }

  if (previous.phase === "downloading" && next.phase === "ready") {
    return { name: "update.downloaded", attributes: { ...base, available: next.version } }
  }

  if (previous.phase !== "installing" && next.phase === "installing") {
    return { name: "update.installed", attributes: { ...base, available: next.version } }
  }

  if (next.phase === "error" && previous.phase !== "error") {
    const stages = { downloading: "download", installing: "install" } as const
    const stage = stages[previous.phase as keyof typeof stages] ?? "check"

    return { name: "update.failed", attributes: { ...base, stage, message: next.message } }
  }

  return undefined
}
