import type { LoggedEvent } from "./diagnostics.ts"
import type { Envelope } from "./envelope.ts"

/*
 * A crash or fatal error carries the last minutes of the local copy as `logs.jsonl` (PAR-805), as the plan
 * (proposals/product-telemetry.md) had it, so what led up to it is beside it in Sentry without asking for a report.
 */

/** How far back the local copy a crash carries goes, in milliseconds. */
export const crashLogMs = 5 * 60_000

/** How many events a crash carries at most, the latest kept. */
export const crashLogEvents = 2000

/** As much of a Sentry event as decides whether it's a crash. */
export interface CrashCheck {
  level?: string | undefined
  platform?: string | undefined
  tags?: { "exit.reason"?: unknown } | undefined
  exception?: { values?: { mechanism?: { handled?: boolean | undefined } | undefined }[] | undefined } | undefined
}

/**
 * Whether a Sentry event is a crash or fatal error: `fatal`, as native crashes, abnormal exits and uncaught errors in
 * main are, or an error nothing caught.
 */
export function isCrash(event: CrashCheck): boolean {
  return event.level === "fatal" || (event.exception?.values ?? []).some((value) => value.mechanism?.handled === false)
}

/**
 * Whether a crash happened in an earlier run: a native crash found as the app starts, which, unlike a window or child
 * process that crashes as the app runs, has no `exit.reason`.
 */
export function isEarlierCrash(event: CrashCheck): boolean {
  return event.platform === "native" && event.tags?.["exit.reason"] === undefined
}

/** The events of the last `keepMs` before `until`, in milliseconds since 1970, at most `max` of them, as JSON lines. */
export function crashLog(
  events: readonly LoggedEvent[],
  until: number,
  { keepMs = crashLogMs, max = crashLogEvents }: { keepMs?: number; max?: number } = {}
): string {
  const since = until - keepMs

  return events
    .filter((event) => {
      const time = Date.parse(event.time)

      return time >= since && time <= until
    })
    .slice(-max)
    .map((event) => JSON.stringify(event))
    .join("\n")
}

/** The events of the last few minutes, kept as they're recorded, for a crash to carry. */
export interface RecentLog {
  add(envelope: Envelope): void
  /** The events of the last `crashLogMs` before `now`, as JSON lines. */
  text(now: number): string
}

/** Keeps the events of the last `keepMs`, at most `max` of them, dropping older ones as new ones come. */
export function recentLog({
  keepMs = crashLogMs,
  max = crashLogEvents
}: { keepMs?: number; max?: number } = {}): RecentLog {
  let events: LoggedEvent[] = []

  return {
    add(envelope) {
      events.push(envelope)

      if (events.length > max * 2) {
        events = events.slice(-max)
      }
    },
    text(now) {
      events = events.filter((event) => Date.parse(event.time) >= now - keepMs).slice(-max)

      return crashLog(events, now, { keepMs, max })
    }
  }
}
