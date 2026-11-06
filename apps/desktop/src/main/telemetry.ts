import { randomUUID } from "node:crypto"
import { join } from "node:path"
import {
  createScrubber,
  createTelemetry,
  type Envelope,
  envelopeSchema,
  registeredEvents,
  isSpanEnvelope,
  type Sink,
  sendsToSentry,
  type Telemetry,
  type TelemetryEnvironment,
  type TelemetryLevel,
  telemetryEnvironment,
  telemetryLevel
} from "@parity-app/telemetry"
import * as Sentry from "@sentry/electron/main"
import { app, type BrowserWindow, powerMonitor, type WebContents } from "electron"
import { createSentrySink, type SentryTarget } from "../shared/sentry-sink.ts"
import type { TelemetryRun } from "../shared/telemetry-run.ts"
import { readInstallId } from "./install-id.ts"
import { createLogFileSink, createLogFiles } from "./log-files.ts"

/**
 * Parity's errors, crashes and hangs go to Sentry's `parity-desktop` project, on by default (PAR-620). Windows and the
 * service send theirs through main, so this is the one place that decides whether anything is sent. See docs/sentry.md.
 */
const dsn = "https://1367d69a56a94bcd328db394a4a5a2d4@o4512381874274304.ingest.us.sentry.io/4512381906190336"

/** How long a window or main may be stuck before it's reported, in milliseconds. */
const hangThreshold = 2000

/** What reaches Sentry, which `sendsToSentry` decides from: errors only, logs and spans too, or nothing. */
let level: TelemetryLevel = "all"

export interface TelemetryStart {
  level: TelemetryLevel
  environment: TelemetryEnvironment
}

/**
 * Starts Sentry in main, which must happen before the app is ready, before any scheme is registered and before the
 * service is forked, so windows and the service can reach it. With telemetry off it still starts, so windows and the
 * service have somewhere to send, but nothing leaves the computer.
 */
export function startTelemetry(
  env: NodeJS.ProcessEnv,
  { installed, rendererName }: { installed: boolean; rendererName: (contents: WebContents) => string | undefined }
): TelemetryStart {
  level = telemetryLevel(env)
  const environment = telemetryEnvironment(env, installed)
  // Secrets are scrubbed from everything Sentry sends, the windows' and the service's events included (PAR-621).
  const scrubber = createScrubber()
  Sentry.init({
    dsn,
    environment,
    enabled: level !== "off",
    getRendererName: rendererName,
    // The process an event came from, by the telemetry envelope's names. Windows and the service name theirs on each
    // event; a scope tag wouldn't do, since a window's scope is copied into main's.
    // The level decides what leaves, for every process's errors, logs and spans, which all come through here.
    beforeSend: (event) =>
      sendsToSentry(level, "error") ? scrubber.value({ ...event, tags: { process: "main", ...event.tags } }) : null,
    beforeSendTransaction: (event) => (sendsToSentry(level, "span") ? scrubber.value(event) : null),
    beforeSendLog: (log) => (sendsToSentry(level, "log") ? scrubber.value(log) : null),
    beforeBreadcrumb: (breadcrumb) => scrubber.value(breadcrumb),
    integrations: [
      // A renderer that runs out of memory may leave no minidump, so it's reported as well as the default exits.
      Sentry.childProcessIntegration({ events: ["abnormal-exit", "launch-failed", "integrity-failure", "oom"] })
    ]
  })
  if (level !== "off") watchMainLoop()
  return { level, environment }
}

/** Main's Sentry as the sink sends to it. A log in a trace goes in a scope that continues it, so Sentry links them. */
const sentryTarget: SentryTarget = {
  addBreadcrumb: (breadcrumb) => Sentry.addBreadcrumb(breadcrumb),
  captureEvent: (event) => void Sentry.captureEvent(event),
  log: ({ level: logLevel, message, attributes, traceId }) =>
    Sentry.withScope((scope) => {
      if (traceId) scope.setPropagationContext({ traceId, sampleRand: Math.random() })
      Sentry.logger[logLevel](message, attributes)
    })
}

/** Where other processes' events go once main has them: Sentry's logs and spans, and the local copy. */
let forward: Sink | undefined

/**
 * Starts recording main's own events, and those other processes send, once the app's data folder is known. Main's go
 * to Sentry and the local copy, `<userData>/logs/parity-<date>.jsonl`, which is written at every level, Off included.
 * Gives main's telemetry, and the run the other processes start theirs with.
 */
export function startEvents({ userData, installed }: { userData: string; installed: boolean }): {
  run: TelemetryRun
  telemetry: Telemetry<typeof registeredEvents>
} {
  const run: TelemetryRun = {
    installId: readInstallId(join(userData, "install-id")),
    sessionId: randomUUID(),
    check: !installed
  }
  const logFile = createLogFileSink(createLogFiles({ folder: join(userData, "logs") }))
  // The file is written as the app quits, with what's waiting.
  app.on("will-quit", () => logFile.flush())
  const upload = createSentrySink(sentryTarget, { upload: true, scope: false })
  forward = {
    event: (envelope) => {
      logFile.event(envelope)
      upload.event(envelope)
    },
    span: (envelope) => {
      logFile.span(envelope)
      upload.span(envelope)
    }
  }
  const telemetry = createTelemetry({
    events: registeredEvents,
    context: { process: "main", installId: run.installId, sessionId: run.sessionId },
    sinks: [createSentrySink(sentryTarget), forward],
    check: run.check,
    onSinkError: (error) => console.warn("[telemetry] a sink failed:", error)
  })
  return { run, telemetry }
}

/**
 * Records an event or span another process sent: a window, a render window, or the service for itself and its worker.
 * What isn't an envelope is dropped, since it crossed a process boundary.
 */
export function recordForwarded(sent: unknown, process?: Envelope["process"]): void {
  if (!forward) return
  const read = envelopeSchema.safeParse(sent)
  if (!read.success) return
  // A window's events are named by the window that sent them, not by what the page says.
  const envelope = process ? { ...read.data, process } : read.data
  try {
    if (isSpanEnvelope(envelope)) forward.span(envelope)
    else forward.event(envelope)
  } catch (error) {
    console.warn("[telemetry] couldn't record another process's event:", error)
  }
}

/** Reports a window that stops answering, once it answers again, with how long it was stuck. */
export function watchWindowHangs(window: BrowserWindow, name: string, kind: "renderer" | "render"): void {
  let since: number | undefined
  window.on("unresponsive", () => {
    since = performance.now()
    Sentry.addBreadcrumb({ category: "window", level: "warning", message: `The ${name} stopped answering` })
  })
  window.on("responsive", () => {
    if (since === undefined) return
    const stuckMs = Math.round(performance.now() - since)
    since = undefined
    Sentry.captureMessage(`The ${name} was unresponsive for ${(stuckMs / 1000).toFixed(1)}s`, {
      level: "warning",
      tags: { process: kind, hang: "window" },
      extra: { stuckMs }
    })
  })
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
 * Reports main's own event loop being blocked, once it runs again. Sentry's native hang detection needs a module built
 * for Electron's ABI, which isn't shipped yet, so this measures how late a timer fires instead: it says how long main
 * was stuck, though not where.
 */
function watchMainLoop(): void {
  const every = 500
  let expected = performance.now() + every
  // A computer that slept leaves the timer late without main being stuck.
  let slept = false
  void app.whenReady().then(() => {
    powerMonitor.on("suspend", () => (slept = true))
    powerMonitor.on("resume", () => (slept = true))
  })
  setInterval(() => {
    const now = performance.now()
    const lateMs = Math.round(now - expected)
    expected = now + every
    if (slept) {
      slept = false
      return
    }
    if (lateMs < hangThreshold) return
    Sentry.captureMessage(`Main was blocked for ${(lateMs / 1000).toFixed(1)}s`, {
      level: "warning",
      tags: { hang: "main" },
      extra: { stuckMs: lateMs }
    })
  }, every).unref()
}
