import { z } from "zod"
import type { mainBlocked, windowHung } from "./app-events.ts"

/*
 * Hangs recorded while they last, not only once they end (PAR-804). Main can't record its own hang while it's stuck, so
 * a watchdog thread watches for its heartbeat and sends to Sentry itself. Every hang still open is kept in a small file
 * as it goes, which the next run reports if the app exited before the hang ended.
 */

/** What a check on main's heartbeat found: a hang that just `started`, or one still `ongoing`, stuck for `stuckMs`. */
export interface HangCheck {
  state: "started" | "ongoing"
  stuckMs: number
}

/** A watch on a heartbeat, which the watchdog thread keeps for main. */
export interface HangWatch {
  /** The heartbeat arrived. Gives how long the hang it ended lasted, if one was open. */
  beat(now: number): number | undefined
  /** Gives whether the heartbeat is overdue by over the threshold, and whether that's new. */
  check(now: number): HangCheck | undefined
}

/**
 * A watch on a heartbeat checked every `every` milliseconds, which is hung once the last beat is over `threshold` old.
 * A check that itself runs over `threshold` late means the whole computer stopped, as when it sleeps, so it starts
 * counting again rather than reporting a hang.
 */
export function hangWatch({ every, threshold, start }: { every: number; threshold: number; start: number }): HangWatch {
  let lastBeat = start
  let lastCheck = start
  let hungSince: number | undefined

  return {
    beat(now) {
      const ended = hungSince === undefined ? undefined : Math.max(0, Math.round(now - hungSince))
      lastBeat = now
      hungSince = undefined

      return ended
    },
    check(now) {
      const late = now - lastCheck - every
      lastCheck = now

      if (late > threshold && hungSince === undefined) {
        lastBeat = now

        return undefined
      }

      const stuckMs = Math.round(now - lastBeat)

      if (hungSince !== undefined) {
        return { state: "ongoing", stuckMs }
      }

      if (stuckMs <= threshold) {
        return undefined
      }

      hungSince = lastBeat

      return { state: "started", stuckMs }
    }
  }
}

/** The hangs still open, as each writer keeps them in its file while they last: main's, or windows' by `window.hung`'s names. */
export const openHangsSchema = z.object({
  hangs: z.array(
    z.object({
      kind: z.enum(["main", "renderer", "render"]),
      stuckMs: z.number().nonnegative()
    })
  )
})

export type OpenHangs = z.infer<typeof openHangsSchema>

/** Who keeps an open-hang file: main's watchdog, or main for its windows. */
export type OpenHangsWriter = "main" | "windows"

/**
 * The name of the file a writer keeps its open hangs in, per process, since two copies of the app can share a data
 * folder and each has its own hangs.
 */
export function openHangsFile(writer: OpenHangsWriter, pid: number): string {
  return `${writer}-${pid}.json`
}

/** The process that keeps an open-hang file, by its name, or none for a file that isn't one. */
export function openHangsOwner(name: string): number | undefined {
  const match = /^(?:main|windows)-(\d+)\.json$/.exec(name)

  return match ? Number(match[1]) : undefined
}

/** An event the next run records for a hang the app exited during. */
export type LeftoverHang =
  | { name: "main.blocked"; attributes: z.input<typeof mainBlocked.schema> }
  | { name: "window.hung"; attributes: z.input<typeof windowHung.schema> }

/**
 * The events for the hangs a previous run left open, read from its file: the app exited, as in a force-quit, before
 * they ended. What isn't a list of hangs gives none, since the file is from another run, maybe another version.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: a file an earlier run wrote
export function leftoverHangs(read: unknown): LeftoverHang[] {
  const parsed = openHangsSchema.safeParse(read)

  if (!parsed.success) {
    return []
  }

  return parsed.data.hangs.map(({ kind, stuckMs }) => {
    const rounded = Math.round(stuckMs)

    return kind === "main"
      ? { name: "main.blocked", attributes: { stuckMs: rounded, ended: "exited" } }
      : { name: "window.hung", attributes: { window: kind, stuckMs: rounded, ended: "exited" } }
  })
}

/** What a Sentry event from outside main's SDK carries, as main's scope has it. */
export interface SentryScopeCopy {
  release?: string | undefined
  environment?: string | undefined
  dist?: string | undefined
  tags: Record<string, string>
  user?: { id?: string | undefined } | undefined
}

/** A Sentry event, as much of one as the watchdog sends. */
export interface WatchdogEvent {
  event_id: string
  timestamp: number
  platform: "node"
  level: "warning"
  message: string
  tags: Record<string, string>
  extra: Record<string, number>
  release?: string
  environment?: string
  dist?: string
  user?: { id?: string }
}

/** The Sentry message the watchdog sends as main's hang passes the threshold, tagged as main's own hangs are. */
export function mainHangEvent({
  stuckMs,
  scope,
  eventId,
  now
}: {
  stuckMs: number
  scope: SentryScopeCopy
  eventId: string
  /** Seconds since 1970, as Sentry's timestamps are. */
  now: number
}): WatchdogEvent {
  const event: WatchdogEvent = {
    event_id: eventId,
    timestamp: now,
    platform: "node",
    level: "warning",
    message: "Main stopped answering",
    tags: { ...scope.tags, process: "main", hang: "main" },
    extra: { stuckMs }
  }

  if (scope.release !== undefined) {
    event.release = scope.release
  }

  if (scope.environment !== undefined) {
    event.environment = scope.environment
  }

  if (scope.dist !== undefined) {
    event.dist = scope.dist
  }

  if (scope.user?.id !== undefined) {
    event.user = { id: scope.user.id }
  }

  return event
}

/**
 * The request that sends `event` to Sentry's envelope endpoint for `dsn`, as the SDK would, for a thread without the
 * SDK. A DSN that can't be read gives none.
 */
export function sentryEnvelope(
  dsn: string,
  event: WatchdogEvent,
  sentAt: Date
): { url: string; body: string } | undefined {
  let parsed: URL

  try {
    parsed = new URL(dsn)
  } catch {
    return undefined
  }

  const project = parsed.pathname.split("/").findLast(Boolean)

  if (!parsed.username || !project) {
    return undefined
  }

  const url = `${parsed.protocol}//${parsed.host}/api/${project}/envelope/?sentry_key=${parsed.username}&sentry_version=7`
  const header = { event_id: event.event_id, sent_at: sentAt.toISOString(), dsn }
  const body = [JSON.stringify(header), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n")

  return { url, body }
}
