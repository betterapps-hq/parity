import { randomUUID } from "node:crypto"
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Worker } from "node:worker_threads"
import { CodedError } from "@parity-app/core"
import {
  crashLog,
  createDriverTracker,
  isCrash,
  type CrashSigns,
  crashedRendererReasons,
  isEarlierCrash,
  lastUnfinishedRun,
  recentLog,
  driverTags,
  createTelemetry,
  type Envelope,
  envelopeSchema,
  hangThresholdMs,
  lagCheck,
  leftoverHangs,
  MAIN_BLOCKED_FINGERPRINT,
  type OpenHangs,
  openHangsSchema,
  openHangsFile,
  openHangsOwner,
  openHangsRun,
  registeredEvents,
  serviceCrash,
  serviceExit,
  isSpanEnvelope,
  type ResolvedTelemetry,
  type RunVariables,
  runTags,
  type Sink,
  type Telemetry,
  type TelemetryEnvironment,
  type TelemetryLevel,
  telemetryEnvironment,
  telemetryRelease,
  telemetryUser,
  withGrouping
} from "@parity-app/telemetry"
import { createSentrySink, type SentryTarget, sentryScrubbing } from "@parity-app/telemetry"
import * as Sentry from "@sentry/electron/main"
import { app, type BrowserWindow, powerMonitor, type WebContents } from "electron"
import { z } from "zod"
import { recordInvalidData } from "../shared/invalid-data.ts"
import { secretScrubbing } from "../shared/secret-scrubbing.ts"
import type { TelemetryRun } from "../shared/telemetry-run.ts"
import { type FailedFramePicture, failedFrameFor } from "./frame-telemetry.ts"
import type { HangWatchMessage, HangWatchReport, HangWatchStart } from "./hang-watch.ts"
import { createLogFileSink, createLogFiles, readLogEvents } from "./log-files.ts"
import { createReportOnlyGate } from "./report-only.ts"
import { scrubRecorded, scrubReplays } from "./window-scrubbing.ts"

/**
 * Parity's errors, crashes and hangs go to Sentry's `parity-desktop` project, on by default (PAR-620). Windows and the
 * service send theirs through main, so this is the one place that decides whether anything is sent. See docs/sentry.md.
 */
const dsn = "https://1367d69a56a94bcd328db394a4a5a2d4@o4512381874274304.ingest.us.sentry.io/4512381906190336"

/** The frame that last failed to draw offscreen, pictured, for the errors about it. */
let lastFailedFrame: FailedFramePicture | undefined

/**
 * Keeps a picture of a frame that failed to draw offscreen, as a PNG, which the Sentry errors about that frame carry as
 * `failed-frame.png` for 10 minutes or until another frame fails (PAR-638, PAR-812): those from its offscreen window,
 * or in the trace that asked for it. `frame.failed` itself is a log, not an error, since a project's own code failing
 * isn't Parity's bug.
 */
export function keepFailedFrame(png: Uint8Array, traceId: string | undefined): void {
  lastFailedFrame = {
    attachment: { filename: "failed-frame.png", data: png, contentType: "image/png" },
    at: Date.now()
  }

  if (traceId) {
    lastFailedFrame.traceId = traceId
  }
}

/** The last minutes of events from every process, which a crash or fatal error carries (PAR-805). */
const recent = recentLog()

/** This run's session, once events have started, which an earlier run's crash is told apart from. */
let sessionId: string | undefined

/**
 * The local copy's last minutes as `logs.jsonl`, scrubbed, for a crash or fatal error (PAR-805): this run's, or for a
 * native crash found as the app starts, the crashed run's last minutes, read from the files. None for other events.
 */
function crashLogFile(
  event: Parameters<typeof isCrash>[0]
): { filename: string; data: string; contentType: string } | undefined {
  if (!isCrash(event)) {
    return undefined
  }

  let text = recent.text(Date.now())

  if (isEarlierCrash(event)) {
    const crashed = lastUnfinishedRun(readLogEvents(join(app.getPath("userData"), "logs")), sessionId ?? "")
    text = crashed ? crashLog(crashed.events, Date.parse(crashed.time)) : ""
  }

  return text ? { filename: "logs.jsonl", data: scrubber.value(text), contentType: "application/x-ndjson" } : undefined
}

export interface TelemetryStart {
  level: TelemetryLevel
  environment: TelemetryEnvironment
}

/**
 * Secrets are scrubbed from everything Sentry sends, the windows' and the service's events included (PAR-621), with the
 * open projects' `.env` values the service reads (PAR-672). Only main has those values: a project's code runs in every
 * window's page, so windows scrub without them and main scrubs them from what windows send (PAR-983).
 */
export const scrubber = secretScrubbing()

/** Whether this run sends, which Settings can change while it runs (PAR-626). */
let level: TelemetryLevel = "off"

/** The install every event reports as, and the variables that name its test pass and tester (PAR-630). */
let installId = "unknown"
let runVariables: RunVariables = {}

/** Who's driving, a person or an agent, which tags every event, span and replay from main's scope on (PAR-630). */
const driver = createDriverTracker({ onChange: () => tagDriver() })

/** Puts who's driving on main's scope, which windows' and the service's events join, and names Sentry's user by it. */
function tagDriver(): void {
  const now = driver.current()
  Sentry.setTags(driverTags(now))
  Sentry.setUser(telemetryUser(installId, runVariables, now))
  syncWatchdog()
}

/** The driver's tags on an event, checked as it's sent, since an agent that stopped calling hands back to the person. */
function withDriver<T extends { tags?: Record<string, unknown> | undefined }>(event: T): T {
  return { ...event, tags: { ...event.tags, ...definedTags(driverTags(driver.current())) } }
}

function definedTags(tags: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(tags).filter((entry): entry is [string, string] => entry[1] !== undefined))
}

/** An agent called the app through the service, which says who it is (PAR-630). What isn't a caller is ignored. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what the service sent, parsed here
export function agentCalled(sent: unknown): void {
  const read = agentCaller.safeParse(sent)

  if (!read.success) {
    return
  }

  const { name, id, client } = read.data
  const caller: Parameters<typeof driver.agentCalled>[0] = { name, id }

  if (client !== undefined) {
    caller.client = client
  }

  driver.agentCalled(caller)
}

/** An agent as the service names it when it calls: a client that isn't text is left out. */
const agentCaller = z.looseObject({
  name: z.string(),
  id: z.string(),
  client: z.string().optional().catch(undefined)
})

/** The person used the app's window, so what follows is theirs (PAR-630). */
export function personActed(): void {
  driver.personActed()
}

/**
 * Starts Sentry in main, which must happen before the app is ready, before any scheme is registered and before the
 * service is forked, so windows and the service can reach it. With telemetry off it still starts, so windows and the
 * service have somewhere to send, and so it can be turned on without a restart, but nothing leaves the computer.
 */
export function startTelemetry(
  env: NodeJS.ProcessEnv,
  {
    installed,
    published,
    promoted,
    commit,
    rendererName,
    sending
  }: {
    installed: boolean
    /** Whether the release workflow published this build, which names its release by version (PAR-625). */
    published: boolean
    /** Whether its release has been promoted to everyone, which reports it as `production` (PAR-779). */
    promoted: boolean
    /** The commit the build was made from, which names any other build's release. */
    commit: string | undefined
    rendererName: (contents: WebContents) => string | undefined
    /** The level, install ID and whether only errors go, from the setting and the variables (PAR-626, PAR-777). */
    sending: Pick<ResolvedTelemetry, "level" | "errorsOnly"> & { installId: string }
  }
): TelemetryStart {
  const environment = telemetryEnvironment(env, { installed, published, promoted })
  // CI sends only errors and reports, with their breadcrumbs; its spans and logs stay in the local copy (PAR-777).
  const scrubbing = sentryScrubbing(scrubber, Sentry, { errorsOnly: sending.errorsOnly })
  runVariables = { PARITY_TEST_RUN: env.PARITY_TEST_RUN, PARITY_TESTER: env.PARITY_TESTER }
  // Before Sentry starts, since it sends the minidumps it finds and deletes them.
  earlierMinidumps = minidumpTimes()
  Sentry.init({
    dsn,
    environment,
    release: telemetryRelease({ project: "parity-desktop", version: app.getVersion(), published, commit }),
    // Each platform's installer is its own build of the release.
    dist: `${process.platform}-${process.arch}`,
    getRendererName: rendererName,
    ...scrubbing,
    // The process an event came from, by the telemetry envelope's names. Windows and the service name theirs on each
    // event; a scope tag wouldn't do, since a window's scope is copied into main's.
    // Every process's errors, logs and spans come through here; whether any leave is `applyTelemetry`'s switch.
    beforeSend: (event, hint) =>
      reportGate.drop(event, () => {
        // The service, Parity's only utility process that exits with a code, reports its own exits with what it printed,
        // so Sentry's own report of it, which says nothing more, is dropped (PAR-950).
        if (event.message === utilityExited) {
          return null
        }

        // An error about the frame that last failed to draw offscreen carries its picture, while it's recent (PAR-812).
        const frame = failedFrameFor(lastFailedFrame, event, Date.now())

        if (frame) {
          hint.attachments = [...(hint.attachments ?? []), frame]
        }

        // A crash or fatal error carries the local copy's last minutes (PAR-805).
        const log = crashLogFile(event)

        if (log) {
          hint.attachments = [...(hint.attachments ?? []), log]
        }

        // Errors that are one problem however they're reached keep to one issue, so Linear gets one bug (PAR-879).
        return scrubber.value(withDriver(withGrouping({ ...event, tags: { process: "main", ...event.tags } })))
      }),
    beforeSendTransaction: (event) =>
      reportGate.drop(event, (kept) => scrubbing.beforeSendTransaction(withDriver(kept))),
    beforeSendLog: (log) => reportGate.drop(log, (kept) => scrubbing.beforeSendLog(kept)),
    integrations: [
      // A renderer that runs out of memory may leave no minidump, so it's reported as well as the default exits.
      Sentry.childProcessIntegration({ events: ["abnormal-exit", "launch-failed", "integrity-failure", "oom"] })
    ]
  })
  // Windows' replays go to the transport without `beforeSend`, so the `.env` values windows don't have are scrubbed
  // from them here (PAR-983).
  Sentry.getClient()?.on("beforeEnvelope", (envelope) => scrubReplays(envelope, scrubber))
  // The test pass tags everything from main's scope, which windows' and the service's events join (PAR-630).
  Sentry.setTags(runTags(runVariables))
  // Started enabled, so its integrations are set up, then turned to the level; every send checks it again.
  applyTelemetry(sending)
  watchMainLoop()
  // An agent that stops calling hands back to the person, which spans and logs, unlike errors, don't check as they're sent.
  setInterval(() => driver.current(), 1000).unref()

  return { level, environment }
}

/** Tags what follows with the update channel an installed build takes, stable or beta, as it starts and when it changes. */
export function tagUpdateChannel(beta: boolean): void {
  Sentry.setTag("update_channel", beta ? "beta" : "stable")
  syncWatchdog()
}

/** Main's Sentry as the sink sends to it. A log in a trace goes in a scope that continues it, so Sentry links them. */
const sentryTarget: SentryTarget = {
  addBreadcrumb: (breadcrumb) => Sentry.addBreadcrumb(breadcrumb),
  captureEvent: (event) => void Sentry.captureEvent(event),
  log: ({ level: logLevel, message, attributes, traceId }) =>
    Sentry.withScope((scope) => {
      if (traceId) {
        scope.setPropagationContext({ traceId, sampleRand: Math.random() })
      }

      Sentry.logger[logLevel](message, attributes)
    })
}

/** Where other processes' events go once main has them: Sentry's logs and spans, and the local copy. */
let forward: Sink | undefined

/** Main's own events, once `startEvents` has started them, which hangs and the service's exits are recorded to. */
let recorded: Telemetry<typeof registeredEvents> | undefined

/** Main's telemetry, and the run the other processes start theirs with. */
export interface MainEvents {
  run: TelemetryRun
  telemetry: Telemetry<typeof registeredEvents>
  /** Writes the local copy's waiting lines now, as a report reads it (PAR-635). */
  flushLogs: () => void
}

/**
 * Starts recording main's own events, and those other processes send, once the app's data folder is known. Main's go
 * to Sentry and the local copy, `<userData>/logs/parity-<date>.jsonl`, which is written at every level, Off included.
 * Gives main's telemetry, and the run the other processes start theirs with.
 */
export function startEvents({
  userData,
  installed,
  installId
}: {
  userData: string
  installed: boolean
  /** From the Telemetry setting's file (PAR-626). */
  installId: string
}): MainEvents {
  const run: TelemetryRun = {
    installId,
    sessionId: randomUUID(),
    check: !installed
  }

  const logFile = createLogFileSink(createLogFiles({ folder: join(userData, "logs") }), {
    testRun: process.env.PARITY_TEST_RUN?.trim() || undefined
  })

  // The file is written as the app quits, with what's waiting.
  app.on("will-quit", () => logFile.flush())
  const upload = createSentrySink(sentryTarget, { upload: true, scope: false })
  sessionId = run.sessionId
  forward = {
    event: (envelope) => {
      logFile.event(envelope)
      recent.add(envelope)
      upload.event(envelope)
    },
    span: (envelope) => {
      logFile.span(envelope)
      upload.span(envelope)
    }
  }

  const telemetry = recordInvalidData(
    createTelemetry({
      events: registeredEvents,
      context: { process: "main", installId: run.installId, sessionId: run.sessionId },
      sinks: [createSentrySink(sentryTarget), forward],
      check: run.check,
      onSinkError: (error) => console.warn("[telemetry] a sink failed:", error)
    })
  )

  scrubber.follow(telemetry)
  recorded = telemetry
  startHangWatch(join(userData, "hangs"))

  return { run, telemetry, flushLogs: () => logFile.flush() }
}

/**
 * Records an event or span another process sent: a window, a render window, or the service for itself and its worker.
 * What isn't an envelope is dropped, since it crossed a process boundary. Gives the envelope as recorded, or none.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what another process sent, parsed here
export function recordForwarded(sent: unknown, process?: Envelope["process"]): Envelope | undefined {
  const read = envelopeSchema.safeParse(sent)

  if (!read.success) {
    return undefined
  }

  // A window's events are named by the window that sent them, not by what the page says, and lose the `.env` values
  // the page never has (PAR-983).
  const envelope = scrubRecorded(process ? { ...read.data, process } : read.data, scrubber)

  if (!forward) {
    return envelope
  }

  try {
    if (isSpanEnvelope(envelope)) {
      forward.span(envelope)
    } else {
      forward.event(envelope)
    }
  } catch (error) {
    console.warn("[telemetry] couldn't record another process's event:", error)
  }

  return envelope
}

/**
 * Sends at this level from now on, reporting as this install. Sentry checks whether it's enabled on every send, so a
 * change needs no restart.
 */
/** Lets only a report leave while diagnostics are off (PAR-813). */
const reportGate = createReportOnlyGate()

/**
 * Runs `send`, which sends a report the person asked to send, with Sentry on for it even while diagnostics are off.
 * Then only the report leaves: errors, spans and logs recorded meanwhile are dropped, as they would be while off
 * (PAR-813).
 */
export async function whileSendingReport<T>(send: () => Promise<T>): Promise<T> {
  const options = Sentry.getClient()?.getOptions()

  if (!options) {
    throw new CodedError("Sentry isn't running, so the report can't be sent", { code: "app_error" })
  }

  return reportGate.run(options, send)
}

export function applyTelemetry(next: { level: TelemetryLevel; installId: string }): void {
  level = next.level
  const client = Sentry.getClient()

  if (client) {
    client.getOptions().enabled = level !== "off"
  }

  installId = next.installId
  tagDriver()
}

/** How a window's hang ended, as `window.hung` names it. */
type WindowHangEnd = "answered" | "closed" | "quit"

/** The windows stuck now, by window ID: what they are, since when, and how to end their hang. */
const stuckWindows = new Map<
  number,
  { kind: "renderer" | "render"; since: number; end: (how: WindowHangEnd) => void }
>()

/**
 * Reports a window that stops answering as it happens, as a Sentry message tagged `hang` and as `window.hang_started`
 * (PAR-804), and again once the hang ends, with how long it lasted: as a Sentry message, and as `window.hung`, whose
 * `stuckMs` can be searched and charted (PAR-771). It ends when the window answers, is closed or the app quits.
 */
export function watchWindowHangs(
  window: BrowserWindow,
  name: string,
  kind: "renderer" | "render",
  onHang?: () => void
): void {
  const id = window.id

  const end = (how: WindowHangEnd) => {
    const stuck = stuckWindows.get(id)

    if (!stuck) {
      return
    }

    stuckWindows.delete(id)
    keepStuckWindows()
    const stuckMs = Math.round(performance.now() - stuck.since)
    const until = { answered: "", closed: " until it was closed", quit: " until the app quit" }[how]
    Sentry.captureMessage(`The ${name} was unresponsive for ${(stuckMs / 1000).toFixed(1)}s${until}`, {
      level: "warning",
      tags: { process: kind, hang: "window" },
      extra: { stuckMs }
    })
    recorded?.track("window.hung", { window: kind, stuckMs, ended: how })
  }

  window.on("unresponsive", () => {
    if (stuckWindows.has(id)) {
      return
    }

    stuckWindows.set(id, { kind, since: performance.now(), end })
    keepStuckWindows()
    onHang?.()
    Sentry.captureMessage(`The ${name} stopped answering`, {
      level: "warning",
      tags: { process: kind, hang: "window" }
    })
    recorded?.track("window.hang_started", { window: kind })
  })
  window.on("responsive", () => end("answered"))
  window.on("closed", () => end(quitAsked ? "quit" : "closed"))
}

/** Whether the app was asked to quit and hasn't been told it was cancelled, so a stuck window that closes says `quit`. */
let quitAsked = false

app.on("before-quit", () => (quitAsked = true))

// What's still stuck as the app quits for good ends with it.
app.prependListener("will-quit", () => {
  for (const { end } of stuckWindows.values()) {
    end("quit")
  }
})

/**
 * The editor cancelled quitting, as when someone keeps unsaved changes: its hangs stay open, and a window that closes
 * later says `closed`.
 */
export function quitCancelled(): void {
  quitAsked = false
}

/** Where the stuck windows are kept while they last, for the next run if the app exits first: none until it starts. */
let stuckWindowsFile: string | undefined

/** Keeps the windows stuck now, and for how long, in their file, or removes it once none are. */
function keepStuckWindows(): void {
  if (!stuckWindowsFile) {
    return
  }

  try {
    if (stuckWindows.size === 0) {
      rmSync(stuckWindowsFile, { force: true })

      return
    }

    const now = performance.now()

    const options = Sentry.getClient()?.getOptions()

    const open: OpenHangs = {
      release: options?.release,
      environment: options?.environment,
      hangs: [...stuckWindows.values()].map(({ kind, since }) => ({ kind, stuckMs: Math.round(now - since) }))
    }

    writeFileSync(stuckWindowsFile, JSON.stringify(open))
  } catch (error) {
    console.warn("[telemetry] couldn't keep the stuck windows:", error)
  }
}

/** The thread that watches main's heartbeat, once it's started. */
let watchdog: Worker | undefined

/** Main's heartbeat, in milliseconds, which its own lag check and the watchdog both go by. */
const beatEveryMs = 500

/**
 * Reports the hangs earlier runs left open, since they exited before the hangs ended, then starts the watchdog thread
 * that records main's hangs while they last (PAR-804). Both keep their open hangs in `folder`, in files named by this
 * process, so another copy of the app sharing the folder keeps its own and isn't reported while it runs.
 */
function startHangWatch(folder: string): void {
  const mainFile = join(folder, openHangsFile("main", process.pid))
  const windowsFile = join(folder, openHangsFile("windows", process.pid))

  try {
    mkdirSync(folder, { recursive: true })
  } catch (error) {
    console.warn("[telemetry] couldn't make the folder for open hangs:", error)

    return
  }

  for (const file of exitedRunsHangs(folder)) {
    const kept = readOpenHangs(file)
    const keptAt = modifiedAt(file)

    if (keptAt !== undefined) {
      earlierOpenHangs.push(keptAt)
    }

    // Reported under the release that hung, not this run's, which may be an update (PAR-804).
    const run = openHangsRun(kept)

    for (const leftover of leftoverHangs(kept)) {
      const { stuckMs } = leftover.attributes

      const what =
        leftover.name === "main.blocked"
          ? "Main was blocked"
          : `A ${leftover.attributes.window} window was unresponsive`

      Sentry.captureEvent({
        message: `${what} for ${(stuckMs / 1000).toFixed(1)}s when the app exited`,
        level: "warning",
        tags: { hang: leftover.name === "main.blocked" ? "main" : "window" },
        extra: { ...leftover.attributes },
        ...(leftover.name === "main.blocked" && { fingerprint: [MAIN_BLOCKED_FINGERPRINT] }),
        ...run
      })

      if (leftover.name === "main.blocked") {
        recorded?.track(leftover.name, leftover.attributes)
      } else {
        recorded?.track(leftover.name, leftover.attributes)
      }
    }

    rmSync(file, { force: true })
  }

  stuckWindowsFile = windowsFile

  try {
    const start: HangWatchStart = {
      file: mainFile,
      every: beatEveryMs,
      threshold: hangThresholdMs,
      dsn,
      appRoot: app.getAppPath(),
      debugIds: debugIds()
    }

    watchdog = new Worker(new URL("./hang-watch.mjs", import.meta.url), { workerData: start })
    watchdog.on("error", (error) => console.warn("[telemetry] the hang watchdog stopped:", error))
    watchdog.on("message", (report: HangWatchReport) => (stuckAt = report.where))
    watchdog.unref()
    syncWatchdog()
  } catch (error) {
    console.warn("[telemetry] couldn't start the hang watchdog:", error)
  }
}

/** The open-hang files in `folder` whose process has exited. */
function exitedRunsHangs(folder: string): string[] {
  let names: string[]

  try {
    names = readdirSync(folder)
  } catch {
    return []
  }

  return names
    .filter((name) => {
      const owner = openHangsOwner(name)

      return owner !== undefined && owner !== process.pid && !running(owner)
    })
    .map((name) => join(folder, name))
}

/** When Crashpad wrote each minidump still waiting to be sent, read as the app starts, before Sentry sends them. */
let earlierMinidumps: number[] = []

/** When each hang an earlier run left open was last kept, read as the hang watch starts and reports them. */
const earlierOpenHangs: number[] = []

/**
 * What earlier runs left that says one crashed rather than being stopped (PAR-956): the minidumps waiting as the app
 * started, and the hangs still open as they exited.
 */
export function crashSigns(): CrashSigns {
  return { minidumps: earlierMinidumps, openHangs: earlierOpenHangs }
}

/** When each minidump in Crashpad's folders was written, where Sentry looks for them, in milliseconds since 1970. */
function minidumpTimes(): number[] {
  const folder = app.getPath("crashDumps")
  const folders = [join(folder, process.platform === "win32" ? "reports" : "completed"), join(folder, "pending")]

  return folders.flatMap((each) => {
    let names: string[]

    try {
      names = readdirSync(each)
    } catch {
      return []
    }

    return names.filter((name) => name.endsWith(".dmp")).flatMap((name) => modifiedAt(join(each, name)) ?? [])
  })
}

/** When a file was last written, in milliseconds since 1970, or nothing when it can't be read. */
function modifiedAt(file: string): number | undefined {
  try {
    return statSync(file).mtimeMs
  } catch {
    return undefined
  }
}

/**
 * Records a window's renderer going, as `window.gone`, when it crashed or exited abnormally rather than closing. The
 * editor's makes the next start offer a crash report (PAR-956).
 */
export function watchWindowGone(window: BrowserWindow, kind: "renderer" | "render"): void {
  window.webContents.on("render-process-gone", (_event, details) => {
    const reason = crashedRendererReasons.find((each) => each === details.reason)

    if (reason) {
      recorded?.track("window.gone", { window: kind, reason })
    }
  })
}

/** Whether a process is running: signal 0 checks without sending anything, and one we may not signal still runs. */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM"
  }
}

/** What an earlier run kept in an open-hang file, checked by `openHangsSchema`, or nothing when it can't be read. */
function readOpenHangs(file: string): OpenHangs | undefined {
  try {
    const read = openHangsSchema.safeParse(JSON.parse(readFileSync(file, "utf8")))

    return read.success ? read.data : undefined
  } catch {
    return undefined
  }
}

/** Tells the watchdog whether Sentry sends and what main's events carry now, so its message matches theirs. */
function syncWatchdog(): void {
  if (!watchdog) {
    return
  }

  const options = Sentry.getClient()?.getOptions()

  const tags = {
    ...Sentry.getGlobalScope().getScopeData().tags,
    ...Sentry.getIsolationScope().getScopeData().tags,
    ...Sentry.getCurrentScope().getScopeData().tags
  }

  const message: HangWatchMessage = {
    type: "scope",
    enabled: level !== "off",
    scope: scrubber.value({
      release: options?.release,
      environment: options?.environment,
      dist: options?.dist,
      tags: Object.fromEntries(Object.entries(tags).map(([key, value]) => [key, String(value)])),
      user: { id: Sentry.getIsolationScope().getUser()?.id?.toString() }
    })
  }

  watchdog.postMessage(message)
}

/**
 * Records a project service exiting, as `service.exited` with its code, how long it ran and whether a fresh one replaced
 * it, unless the app is quitting or it ended cleanly on its own (PAR-771).
 */
export function serviceExited(exit: { exitCode: number; ranMs: number; replaced: boolean; quitting: boolean }): void {
  const attributes = serviceExit(exit)

  if (attributes) {
    recorded?.track("service.exited", attributes)
  }
}

/** What Sentry's child process integration reports for a utility process that exited with an error code. */
const utilityExited = "'Utility' process exited with 'abnormal-exit'"

/**
 * Reports a project service that exited unexpectedly as an error named by what it printed, with its last 50 lines of
 * output, so Linear's bug says what went wrong (PAR-950). Expected exits report nothing.
 */
export function serviceCrashed(exit: Parameters<typeof serviceCrash>[0]): void {
  const crash = serviceCrash(exit)

  if (crash) {
    Sentry.captureMessage(crash.message, {
      level: "error",
      fingerprint: crash.fingerprint,
      tags: { process: "service" },
      contexts: { service: { exitCode: exit.exitCode, output: crash.output } }
    })
  }
}

/** Notes the service starting, or being replaced by a fresh one, for the events that follow. */
export function serviceStarted(restarted: boolean): void {
  Sentry.addBreadcrumb({
    category: "service",
    level: restarted ? "warning" : "info",
    message: restarted ? "The project service restarted" : "The project service started"
  })
}

/**
 * Reports main's own event loop being blocked, once it runs again, as a Sentry message tagged `hang` and as
 * `main.blocked` (PAR-771). Sentry's native hang detection needs a module built for Electron's ABI, which isn't shipped
 * yet, so this measures how late a timer fires instead: it says how long main was stuck, though not where. The same
 * timer is the heartbeat the watchdog thread watches, which reports the hang as it starts (PAR-804), and it keeps how
 * long any window has been stuck.
 */
function watchMainLoop(): void {
  const check = lagCheck({ every: beatEveryMs, threshold: hangThresholdMs, start: performance.now() })
  // A computer that slept leaves the timer late without main being stuck.
  let slept = false
  void app.whenReady().then(() => {
    powerMonitor.on("suspend", () => (slept = true))
    powerMonitor.on("resume", () => (slept = true))
  })
  setInterval(() => {
    watchdog?.postMessage({ type: "beat" } satisfies HangWatchMessage)

    if (stuckWindows.size > 0) {
      keepStuckWindows()
    }

    const stuckMs = check.tick(performance.now(), slept)
    slept = false

    if (stuckMs === undefined) {
      return
    }

    // Where the watchdog found main stuck arrives as main runs again, beside this timer, so it's read a moment later.
    setTimeout(() => {
      const where = stuckAt
      stuckAt = undefined
      Sentry.captureMessage(`Main was blocked for ${(stuckMs / 1000).toFixed(1)}s`, {
        level: "warning",
        tags: { hang: "main" },
        extra: where === undefined ? { stuckMs } : { stuckMs, where },
        fingerprint: [MAIN_BLOCKED_FINGERPRINT]
      })
      recorded?.track(
        "main.blocked",
        where === undefined ? { stuckMs, ended: "answered" } : { stuckMs, ended: "answered", where }
      )
    }, 100)
  }, beatEveryMs).unref()
}

/** Where the watchdog last found main stuck, until the hang it was in is recorded (PAR-805). */
let stuckAt: string | undefined

declare global {
  /** The table Sentry's build step injects into each bundle: its debug ID, by a stack whose first frame is the bundle. */
  var _sentryDebugIds: Record<string, string> | undefined
}

/** The debug IDs Sentry's build step injected into main's bundles, by the stacks they're kept by. */
function debugIds(): Record<string, string> {
  const read = z.record(z.string(), z.string()).safeParse(globalThis._sentryDebugIds)

  return read.success ? read.data : {}
}
