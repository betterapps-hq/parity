import {
  type TelemetryEnvironment,
  type TelemetryLevel,
  telemetryEnvironment,
  telemetryLevel
} from "@parity-app/telemetry"
import * as Sentry from "@sentry/electron/main"
import { app, type BrowserWindow, powerMonitor, type WebContents } from "electron"

/**
 * Parity's errors, crashes and hangs go to Sentry's `parity-desktop` project, on by default (PAR-620). Windows and the
 * service send theirs through main, so this is the one place that decides whether anything is sent. See docs/sentry.md.
 */
const dsn = "https://1367d69a56a94bcd328db394a4a5a2d4@o4512381874274304.ingest.us.sentry.io/4512381906190336"

/** How long a window or main may be stuck before it's reported, in milliseconds. */
const hangThreshold = 2000

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
  const level = telemetryLevel(env)
  const environment = telemetryEnvironment(env, installed)
  Sentry.init({
    dsn,
    environment,
    enabled: level !== "off",
    getRendererName: rendererName,
    // The process an event came from, by the telemetry envelope's names. Windows and the service name theirs on each
    // event; a scope tag wouldn't do, since a window's scope is copied into main's.
    beforeSend: (event) => ({ ...event, tags: { process: "main", ...event.tags } }),
    integrations: [
      // A renderer that runs out of memory may leave no minidump, so it's reported as well as the default exits.
      Sentry.childProcessIntegration({ events: ["abnormal-exit", "launch-failed", "integrity-failure", "oom"] })
    ]
  })
  if (level !== "off") watchMainLoop()
  return { level, environment }
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
