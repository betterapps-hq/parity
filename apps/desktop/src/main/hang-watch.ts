// Watches main's heartbeat from its own thread, so a hang in main is recorded while it lasts (PAR-804), with where
// main was stuck (PAR-805).
import { randomUUID } from "node:crypto"
import { rmSync, writeFileSync } from "node:fs"
import { Session } from "node:inspector"
import { parentPort, workerData } from "node:worker_threads"
import {
  debugImages,
  hangWatch,
  mainHangEvent,
  type OpenHangs,
  type PausedFrame,
  type SentryScopeCopy,
  sentryEnvelope,
  stackFrames,
  stuckWhere
} from "@parity-app/telemetry"
import { z } from "zod"

/**
 * What main starts the watchdog with: where it keeps main's open hang, how often main beats, Sentry's DSN, the app's
 * folder and the debug IDs of main's bundles, by the stacks the bundles keep them by.
 */
const hangWatchStart = z.object({
  file: z.string(),
  every: z.number().positive(),
  threshold: z.number().positive(),
  dsn: z.string(),
  appRoot: z.string(),
  debugIds: z.record(z.string(), z.string())
})

export type HangWatchStart = z.infer<typeof hangWatchStart>

/** Whether Sentry sends, and what the watchdog's events carry. */
interface Sending {
  enabled: boolean
  scope: SentryScopeCopy
}

/** Main's hang while it lasts, and where main was stuck once the watchdog has found it. */
interface OpenMainHang {
  where?: string
}

/** What main sends: a heartbeat, or whether Sentry sends and what its events carry, as main's scope has it now. */
export type HangWatchMessage = { type: "beat" } | { type: "scope"; enabled: boolean; scope: SentryScopeCopy }

/** What the watchdog tells main: where it was stuck, which main reads once it runs again. */
export interface HangWatchReport {
  type: "where"
  where: string
}

const message = z.discriminatedUnion("type", [
  z.object({ type: z.literal("beat") }),
  z.object({
    type: z.literal("scope"),
    enabled: z.boolean(),
    scope: z.object({
      release: z.string().optional(),
      environment: z.string().optional(),
      dist: z.string().optional(),
      tags: z.record(z.string(), z.string()),
      user: z.object({ id: z.string().optional() }).optional()
    })
  })
])

/** The frames in the inspector's `Debugger.paused`, with the script's URL found by its ID when a frame leaves it out. */
const pausedFrames = z.array(
  z.object({
    functionName: z.string(),
    url: z.string().optional(),
    location: z.object({ scriptId: z.string(), lineNumber: z.number(), columnNumber: z.number() })
  })
)

/** How long the watchdog waits for main to pause, which it can't while it's stuck outside JavaScript. */
const pauseWaitMs = 2000

/**
 * Pauses main through the inspector, from this thread, takes its stack and lets it go on. Opens no port: the session is
 * this process's own. Gives nothing when main doesn't pause in time, as when it's stuck in native code.
 */
function mainStack(): Promise<PausedFrame[] | undefined> {
  return new Promise((resolve) => {
    const session = new Session()
    const scripts = new Map<string, string>()
    let done = false

    const finish = (frames: PausedFrame[] | undefined) => {
      if (done) {
        return
      }

      done = true
      clearTimeout(timer)

      try {
        // Disconnecting also lets main go on, if it's still paused.
        session.disconnect()
      } catch {
        // Already gone.
      }

      resolve(frames)
    }

    const timer = setTimeout(() => finish(undefined), pauseWaitMs)

    try {
      session.connectToMainThread()
      session.on("Debugger.scriptParsed", ({ params }) => scripts.set(params.scriptId, params.url))
      session.once("Debugger.paused", ({ params }) => {
        const read = pausedFrames.safeParse(params.callFrames)

        const frames = read.success
          ? read.data.map(({ functionName, url, location }) => ({
              functionName,
              url: url || scripts.get(location.scriptId) || "<unknown>",
              location
            }))
          : undefined

        session.post("Debugger.resume", () => finish(frames))
      })
      session.post("Debugger.enable", (error) => {
        if (error) {
          finish(undefined)

          return
        }

        session.post("Debugger.pause", (pauseError) => pauseError && finish(undefined))
      })
    } catch {
      finish(undefined)
    }
  })
}

if (parentPort) {
  const port = parentPort
  const { file, every, threshold, dsn, appRoot, debugIds } = hangWatchStart.parse(workerData)
  const watch = hangWatch({ every, threshold, start: performance.now() })
  const images = debugImages(debugIds, appRoot)
  let sending: Sending = { enabled: false, scope: { tags: {} } }
  let hang: OpenMainHang | undefined

  const keep = (stuckMs: number) => {
    const { release, environment } = sending.scope
    const open: OpenHangs = { release, environment, hangs: [{ kind: "main", stuckMs, ...hang }] }

    try {
      writeFileSync(file, JSON.stringify(open))
    } catch {
      // The next run just won't know about this hang.
    }
  }

  const started = async (stuckMs: number) => {
    const current: OpenMainHang = {}
    hang = current
    const paused = await mainStack()
    const frames = paused ? stackFrames(paused, appRoot) : []
    const where = stuckWhere(frames)

    if (where !== undefined && hang === current) {
      current.where = where
      port.postMessage({ type: "where", where } satisfies HangWatchReport)
    }

    if (!sending.enabled) {
      return
    }

    const event = mainHangEvent({
      stuckMs,
      scope: sending.scope,
      eventId: randomUUID().replaceAll("-", ""),
      now: Date.now() / 1000,
      stack: { frames, images }
    })

    const request = sentryEnvelope(dsn, event, new Date())

    if (request) {
      fetch(request.url, {
        method: "POST",
        headers: { "Content-Type": "application/x-sentry-envelope" },
        body: request.body
      }).catch(() => undefined)
    }
  }

  port.on("message", (sent) => {
    const read = message.safeParse(sent)

    if (!read.success) {
      return
    }

    if (read.data.type === "scope") {
      sending = { enabled: read.data.enabled, scope: read.data.scope }

      return
    }

    // Main reports the hang's end itself, now it runs again.
    if (watch.beat(performance.now()) !== undefined) {
      hang = undefined
      rmSync(file, { force: true })
    }
  })

  setInterval(() => {
    const found = watch.check(performance.now())

    if (!found) {
      return
    }

    if (found.state === "started") {
      void started(found.stuckMs)
    }

    keep(found.stuckMs)
  }, every)
}
