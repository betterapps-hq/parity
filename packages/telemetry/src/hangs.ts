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
  /** The Sentry release and environment of the run that kept them, which the next run, maybe updated, reports under. */
  release: z.string().optional(),
  environment: z.string().optional(),
  hangs: z.array(
    z.object({
      kind: z.enum(["main", "renderer", "render"]),
      stuckMs: z.number().nonnegative(),
      /** Where main was stuck, once the watchdog has found it (PAR-805). */
      where: z.string().optional()
    })
  )
})

export type OpenHangs = z.infer<typeof openHangsSchema>

/** The Sentry release and environment of the run that kept an open-hang file, as far as it says. */
export interface OpenHangsRun {
  release?: string
  environment?: string
}

/** The release and environment an open-hang file was kept under, or none for a file that doesn't say. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: a file an earlier run wrote
export function openHangsRun(read: unknown): OpenHangsRun {
  const parsed = openHangsSchema.safeParse(read)
  const run: OpenHangsRun = {}

  if (parsed.success && parsed.data.release !== undefined) {
    run.release = parsed.data.release
  }

  if (parsed.success && parsed.data.environment !== undefined) {
    run.environment = parsed.data.environment
  }

  return run
}

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

  return parsed.data.hangs.map(({ kind, stuckMs, where }) => {
    const rounded = Math.round(stuckMs)

    if (kind !== "main") {
      return { name: "window.hung", attributes: { window: kind, stuckMs: rounded, ended: "exited" } }
    }

    return {
      name: "main.blocked",
      attributes:
        where === undefined ? { stuckMs: rounded, ended: "exited" } : { stuckMs: rounded, ended: "exited", where }
    }
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
  /** Sentry's grouping key, which keeps every main hang in one issue whatever frame it was caught on (PAR-879). */
  fingerprint: string[]
  release?: string
  environment?: string
  dist?: string
  user?: { id?: string }
  exception?: { values: [WatchdogException] }
  debug_meta?: { images: DebugImage[] }
}

/** Main's stack as the watchdog found it, which Sentry shows and symbolicates like a thrown error's (PAR-805). */
export interface WatchdogException {
  type: "ApplicationNotResponding"
  value: string
  stacktrace: { frames: StackFrame[] }
  mechanism: { type: "hang_watchdog"; handled: true }
}

/** A frame of a Sentry stack trace. */
export interface StackFrame {
  filename: string
  function: string
  lineno: number
  colno: number
  in_app: boolean
}

/** A bundle's debug ID, which Sentry finds its uploaded source map by. */
export interface DebugImage {
  type: "sourcemap"
  code_file: string
  debug_id: string
}

/** A frame as the inspector's `Debugger.paused` gives it: lines and columns count from 0. */
export interface PausedFrame {
  functionName: string
  url: string
  location: { lineNumber: number; columnNumber: number }
}

/**
 * A file's URL as Sentry's Electron SDK names main's files: inside the app it's `app:///` and the path from the app's
 * folder, so the person's own folders stay out of it and frames match their uploaded source maps.
 */
export function appUrl(url: string, appRoot: string): string {
  let decoded = url

  try {
    decoded = decodeURI(url)
  } catch {
    // Left as it is.
  }

  const base = appRoot.replaceAll("\\", "/").replaceAll(/[|\\{}()[\]^$+*?.]/g, String.raw`\$&`)

  return decoded.replaceAll("\\", "/").replace(new RegExp(`(file://)?/*${base}/*`, "i"), "app:///")
}

/** Main's stack, innermost frame first as the inspector gives it, as Sentry's frames, outermost first. */
export function stackFrames(frames: readonly PausedFrame[], appRoot: string): StackFrame[] {
  return frames
    .map((frame) => {
      const filename = appUrl(frame.url, appRoot)

      return {
        filename,
        function: frame.functionName || "<anonymous>",
        lineno: frame.location.lineNumber + 1,
        colno: frame.location.columnNumber + 1,
        in_app: filename.startsWith("app:///") && !filename.includes("/node_modules/")
      }
    })
    .toReversed()
}

/** Where main was stuck, as one line: the innermost of Parity's own frames, else the innermost frame. */
export function stuckWhere(frames: readonly StackFrame[]): string | undefined {
  const frame = frames.findLast((each) => each.in_app) ?? frames.at(-1)

  return frame && `${frame.function} (${frame.filename}:${frame.lineno}:${frame.colno})`
}

/**
 * The debug IDs of main's bundles, by file, from the table each bundle's injected snippet keeps: its keys are stacks
 * whose first frame is the bundle's file.
 */
export function debugImages(table: Readonly<Record<string, string>>, appRoot: string): DebugImage[] {
  const images: DebugImage[] = []

  for (const [stack, debugId] of Object.entries(table)) {
    const line = stack.split("\n").find((each) => /^\s*at /.test(each))
    const file = line?.match(/\(?((?:file:\/\/|[A-Za-z]:|\/)[^()]*?):\d+:\d+\)?\s*$/)?.[1]

    if (file) {
      images.push({ type: "sourcemap", code_file: appUrl(file, appRoot), debug_id: debugId })
    }
  }

  return images
}

/**
 * Every main hang's Sentry fingerprint. Grouped by stack, each hang caught on another frame became its own issue, and
 * Sentry's alert filed each in Linear as a new bug (PAR-879). Each event still carries the frame it was caught on.
 */
export const MAIN_HANG_FINGERPRINT = "main-stopped-answering"

/** The Sentry message the watchdog sends as main's hang passes the threshold, tagged as main's own hangs are. */
export function mainHangEvent({
  stuckMs,
  scope,
  eventId,
  now,
  stack
}: {
  stuckMs: number
  scope: SentryScopeCopy
  eventId: string
  /** Seconds since 1970, as Sentry's timestamps are. */
  now: number
  /** Main's stack, if the watchdog could take it, with the bundles' debug IDs. */
  stack?: { frames: StackFrame[]; images: DebugImage[] } | undefined
}): WatchdogEvent {
  const event: WatchdogEvent = {
    event_id: eventId,
    timestamp: now,
    platform: "node",
    level: "warning",
    message: "Main stopped answering",
    tags: { ...scope.tags, process: "main", hang: "main" },
    extra: { stuckMs },
    fingerprint: [MAIN_HANG_FINGERPRINT]
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

  if (stack && stack.frames.length > 0) {
    const where = stuckWhere(stack.frames)
    event.exception = {
      values: [
        {
          type: "ApplicationNotResponding",
          value: where ? `Main stopped answering in ${where}` : "Main stopped answering",
          stacktrace: { frames: stack.frames },
          mechanism: { type: "hang_watchdog", handled: true }
        }
      ]
    }
    event.debug_meta = { images: stack.images }
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
