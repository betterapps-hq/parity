// Watches main's heartbeat from its own thread, so a hang in main is recorded while it lasts (PAR-804).
import { randomUUID } from "node:crypto"
import { rmSync, writeFileSync } from "node:fs"
import { parentPort, workerData } from "node:worker_threads"
import { hangWatch, mainHangEvent, type OpenHangs, type SentryScopeCopy, sentryEnvelope } from "@parity-app/telemetry"
import { z } from "zod"

/** What main starts the watchdog with: where it keeps main's open hang, how often main beats and Sentry's DSN. */
const hangWatchStart = z.object({
  file: z.string(),
  every: z.number().positive(),
  threshold: z.number().positive(),
  dsn: z.string()
})

export type HangWatchStart = z.infer<typeof hangWatchStart>

/** Whether Sentry sends, and what the watchdog's events carry. */
interface Sending {
  enabled: boolean
  scope: SentryScopeCopy
}

/** What main sends: a heartbeat, or whether Sentry sends and what its events carry, as main's scope has it now. */
export type HangWatchMessage = { type: "beat" } | { type: "scope"; enabled: boolean; scope: SentryScopeCopy }

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

if (parentPort) {
  const { file, every, threshold, dsn } = hangWatchStart.parse(workerData)
  const watch = hangWatch({ every, threshold, start: performance.now() })
  let sending: Sending = { enabled: false, scope: { tags: {} } }

  const keep = (stuckMs: number) => {
    const open: OpenHangs = { hangs: [{ kind: "main", stuckMs }] }

    try {
      writeFileSync(file, JSON.stringify(open))
    } catch {
      // The next run just won't know about this hang.
    }
  }

  parentPort.on("message", (sent) => {
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
      rmSync(file, { force: true })
    }
  })

  setInterval(() => {
    const found = watch.check(performance.now())

    if (!found) {
      return
    }

    keep(found.stuckMs)

    if (found.state === "started" && sending.enabled) {
      const event = mainHangEvent({
        stuckMs: found.stuckMs,
        scope: sending.scope,
        eventId: randomUUID().replaceAll("-", ""),
        now: Date.now() / 1000
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
  }, every)
}
