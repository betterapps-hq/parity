import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs"
import { join } from "node:path"
import type { Breadcrumb, Event, SentryLog, SentryTarget, TraceContext } from "@parity-app/telemetry"
import { z } from "zod"

/*
 * The CLI's way to Sentry's `parity-cli` project (PAR-642). Loading `@sentry/node` takes about 300 ms, longer than many
 * commands, so a command never loads it: what it would send is kept here, written to `~/.parity/outbox` as it exits,
 * and sent by a detached `parity` process of its own (`send.ts`), which the command doesn't wait for.
 */

/** What a batch reports as, the same for everything in it. */
export interface BatchRun {
  environment: string
  /** The CLI's version, and whether `npm publish` built it, which alone names its release by version (PAR-719). */
  version: string
  published: boolean
  /** The commit a build was made from, which names an unpublished build's release. */
  commit?: string
  /** The folder whose Git commit names the release of a checkout run from source, read by the sender. */
  source?: string
  /** The folder the command ran in, whose project's `.env` values the sender scrubs (PAR-815). */
  folder?: string
  tags: Record<string, string>
  user: { id: string; username?: string }
}

/** A thrown error, as its stack reads, so Sentry parses its frames in the sender. */
export interface ThrownError {
  name: string
  message: string
  stack?: string
}

/** An error thrown in the CLI, in the trace it was thrown in. */
export interface ExceptionItem {
  kind: "exception"
  error: ThrownError
  tags: Record<string, string>
  trace?: TraceContext
  /** Whether nothing caught it, so the CLI stopped with it. */
  uncaught?: boolean
}

export type OutboxItem =
  | { kind: "breadcrumb"; breadcrumb: Breadcrumb }
  | { kind: "event"; event: Event }
  | { kind: "log"; log: SentryLog }
  | ExceptionItem

export interface Batch {
  run: BatchRun
  items: OutboxItem[]
  /**
   * The debug IDs the command's bundles registered as they loaded, keyed by a stack that names each bundle, as
   * `sentry-cli sourcemaps inject` writes them (PAR-719). The sender never loads the command's bundles, so it takes
   * these on to resolve their frames.
   */
  debugIds?: Record<string, string>
}

/** Where the bundles' injected code registers their debug IDs, which Sentry's SDK reads as it captures an error. */
interface DebugIdGlobal {
  _sentryDebugIds?: Record<string, string>
}

/** The debug IDs this process's bundles registered, none when it runs from source. */
export function loadedDebugIds(
  // SAFETY: the global object is where bundles register their debug IDs, an optional field it may not have yet.
  global: DebugIdGlobal = globalThis as DebugIdGlobal
): Record<string, string> | undefined {
  return global._sentryDebugIds
}

/**
 * Adds a batch's debug IDs to this process's, so Sentry's SDK attaches each frame's bundle's debug ID to an error the
 * sender captures, as it would in the command, and the frame resolves through that bundle's uploaded source map.
 */
export function adoptDebugIds(
  batch: Batch,
  // SAFETY: the global object is where Sentry's SDK reads debug IDs, an optional field it may not have yet.
  global: DebugIdGlobal = globalThis as DebugIdGlobal
): void {
  if (batch.debugIds) {
    global._sentryDebugIds = { ...global._sentryDebugIds, ...batch.debugIds }
  }
}

/** Keeps what the CLI's Sentry sink sends, in order, until it's written. */
export function createOutbox() {
  let items: OutboxItem[] = []

  const target: SentryTarget = {
    addBreadcrumb: (breadcrumb) => items.push({ kind: "breadcrumb", breadcrumb }),
    captureEvent: (event) => items.push({ kind: "event", event }),
    log: (log) => items.push({ kind: "log", log })
  }

  return {
    /** The target `createSentrySink` sends to. */
    target,
    /** Keeps an error thrown in the CLI, in the trace it was thrown in. */
    exception(cause: unknown, trace?: TraceContext, uncaught = false): void {
      const item: ExceptionItem = { kind: "exception", error: thrownError(cause), tags: { process: "cli" } }

      if (trace) {
        item.trace = { traceId: trace.traceId, spanId: trace.spanId }
      }

      if (uncaught) {
        item.uncaught = uncaught
      }

      items.push(item)
    },
    /** Hands over what's waiting, emptying the outbox. */
    take(): OutboxItem[] {
      const taken = items
      items = []

      return taken
    }
  }
}

export type Outbox = ReturnType<typeof createOutbox>

export function thrownError(cause: unknown): ThrownError {
  if (!(cause instanceof Error)) {
    return { name: "Error", message: String(cause) }
  }

  const thrown: ThrownError = { name: cause.name, message: cause.message }

  if (cause.stack) {
    thrown.stack = cause.stack
  }

  return thrown
}

/** Batches older than this are dropped unsent, as from a computer that's been offline. */
const keptMs = 24 * 60 * 60 * 1000

let written = 0

/**
 * Writes a batch to the folder, whole or not at all, so the sender never reads half of one. Synchronous, since it runs
 * as the process exits. Nothing is written for an empty batch.
 */
export function writeBatch(folder: string, batch: Batch): string | undefined {
  if (batch.items.length === 0) {
    return undefined
  }

  mkdirSync(folder, { recursive: true })
  // The count keeps a process's batches in order when two are written in the same millisecond.
  written += 1
  const name = `${Date.now()}-${String(written).padStart(6, "0")}-${randomUUID()}.json`
  const partial = join(folder, `${name}.partial`)
  writeFileSync(partial, JSON.stringify(batch))
  renameSync(partial, join(folder, name))

  return name
}

/** Starts the sender for the folder, detached, so the command exits without waiting for it. */
export function startSender(folder: string, sender: string): void {
  spawn(process.execPath, [sender, folder], { detached: true, stdio: "ignore", windowsHide: true }).unref()
}

/** What the sender sends a batch's items with: `@sentry/node`, or a fake in tests. */
export interface BatchTarget {
  send(batch: Batch): void
  /** Waits until what's been sent has left, or the time runs out. */
  flush(timeoutMs: number): Promise<void>
}

const lockName = ".sending"

/** A lock that hasn't been touched in this long is from a sender that died. */
const staleLockMs = 2 * 60 * 1000

function takeLock(folder: string, now: number): boolean {
  const lock = join(folder, lockName)

  try {
    closeSync(openSync(lock, "wx"))

    return true
  } catch {
    try {
      if (now - statSync(lock).mtimeMs < staleLockMs) {
        return false
      }

      rmSync(lock, { force: true })
      closeSync(openSync(lock, "wx"))

      return true
    } catch {
      return false
    }
  }
}

function waiting(folder: string): string[] {
  try {
    return readdirSync(folder)
      .filter((name) => name.endsWith(".json"))
      .sort()
  } catch {
    return []
  }
}

/**
 * Sends every batch in the folder, one sender at a time. Each file is removed before it's sent, so a batch that breaks
 * the sender isn't sent again on every run. Once the folder is empty the lock is let go, then the folder is read again,
 * so a batch written while the lock was held is never left behind: either this sender sees it, or the one started for
 * it takes the lock.
 */
export async function sendBatches(
  folder: string,
  target: BatchTarget,
  { now = () => Date.now(), timeoutMs = 10_000 } = {}
): Promise<number> {
  let sent = 0

  while (waiting(folder).length > 0 && takeLock(folder, now())) {
    try {
      for (let names = waiting(folder); names.length > 0; names = waiting(folder)) {
        for (const name of names) {
          const file = join(folder, name)
          let text: string

          try {
            text = readFileSync(file, "utf8")
            rmSync(file, { force: true })
          } catch {
            continue
          }

          const batch = readBatch(text)

          if (!batch || now() - Number.parseInt(name, 10) > keptMs) {
            continue
          }

          target.send(batch)
          sent += 1
        }

        await target.flush(timeoutMs)
      }
    } finally {
      rmSync(join(folder, lockName), { force: true })
    }
  }

  return sent
}

/** What tells a batch from a file of another kind: a run, and a list of items. */
const batchFile = z.looseObject({ run: z.looseObject({}), items: z.array(z.unknown()) })

/** A batch as the CLI wrote it, or nothing for a file that isn't one, as from another version. */
function readBatch(text: string): Batch | undefined {
  try {
    const value = JSON.parse(text)

    if (!batchFile.safeParse(value).success) {
      return undefined
    }

    // SAFETY: only the CLI writes the outbox, so a file with a run and its items is a batch it wrote.
    return value as Batch
  } catch {
    return undefined
  }
}
