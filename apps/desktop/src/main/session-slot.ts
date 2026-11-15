import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"

/** How many copies running at once get a session folder of their own; more than that share the last one. */
export const slotCount = 8

const lockFile = z.object({ pid: z.number().int() })
const errorCode = z.object({ code: z.string() })

export interface SessionSlot {
  /** The partition for every window this copy opens, such as `persist:copy-1`. */
  partition: string
  /** Lets the slot go, as the copy quits. */
  release(): void
}

export interface SlotOptions {
  pid?: number
  /** Whether a process is still running, so a lock left by a copy that crashed is taken over. */
  alive?: (pid: number) => boolean
  /** How long to wait for another copy's claim, and when a claim is old enough to be a crashed copy's, in milliseconds. */
  waitMs?: number
  staleMs?: number
}

/** Whether `pid` is a running process. Signal 0 checks without sending anything. */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch (error) {
    // EPERM means it runs as someone else.
    return errorCode.safeParse(error).data?.code === "EPERM"
  }
}

/** The process that holds `file`, or none when there's no lock or it can't be read. */
function holder(file: string): number | undefined {
  try {
    return lockFile.safeParse(JSON.parse(readFileSync(file, "utf8"))).data?.pid
  } catch {
    return undefined
  }
}

/** Blocks for `ms`, which only startup does, before any window opens. */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Runs `work` while this copy alone claims a folder, so copies starting together take their slots in turn. The claim is
 * a folder, which only one process can make; taking a slot is safe without it, should two copies end up past it at once.
 * Synchronous, since Sentry needs the session before the app is ready.
 */
function whileClaiming(locks: string, work: () => SessionSlot, waitMs: number, staleMs: number): SessionSlot {
  const claim = join(locks, "claiming")
  const until = Date.now() + waitMs

  for (;;) {
    try {
      mkdirSync(claim)
      break
    } catch (error) {
      if (errorCode.safeParse(error).data?.code !== "EEXIST") {
        return shared
      }

      const made = statSync(claim, { throwIfNoEntry: false })?.mtimeMs

      // The other copy let go between the two calls, so try again.
      if (made === undefined) {
        continue
      }

      // A claim this old was left by a copy that crashed while starting.
      if (Date.now() - made > staleMs) {
        rmSync(claim, { recursive: true, force: true })
        continue
      }

      if (Date.now() > until) {
        return shared
      }

      pause(20)
    }
  }

  try {
    return work()
  } finally {
    rmSync(claim, { recursive: true, force: true })
  }
}

const shared: SessionSlot = { partition: `persist:copy-${slotCount}`, release: () => undefined }

/** Takes the first folder no running copy holds. */
function takeSlot(locks: string, pid: number, alive: (pid: number) => boolean): SessionSlot {
  for (let slot = 1; slot <= slotCount; slot++) {
    const file = join(locks, `copy-${slot}.lock`)

    if (!take(file, pid, alive)) {
      continue
    }

    return {
      partition: `persist:copy-${slot}`,
      release: () => {
        if (holder(file) === pid) {
          rmSync(file, { force: true })
        }
      }
    }
  }

  // Every folder is taken: this copy shares the last, and waits for it as copies did before.
  return shared
}

/**
 * Takes `file` for `pid` unless a running copy holds it, safely when copies try at once, even both past the claim: a free
 * lock is made only if it doesn't exist, which one copy alone can do, and a lock a gone copy left is taken over only by
 * the copy that takes a marker naming that copy. The marker is a lock too, so one a copy left as it crashed is taken over
 * in turn, the same way.
 */
function take(file: string, pid: number, alive: (pid: number) => boolean): boolean {
  const held = holder(file)

  if (held === undefined && !existsSync(file)) {
    return made(file, JSON.stringify({ pid }))
  }

  // A lock whose copy is gone, or that can't be read, is taken over; one that's held is passed by.
  if (held !== undefined && held !== pid && alive(held)) {
    return false
  }

  const marker = `${file}.from-${held ?? "unreadable"}`

  if (!take(marker, pid, alive)) {
    return false
  }

  try {
    // Another copy took it over between the two reads.
    if (holder(file) !== held) {
      return false
    }

    writeFileSync(file, JSON.stringify({ pid }))

    return true
  } finally {
    if (holder(marker) === pid) {
      rmSync(marker, { force: true })
    }
  }
}

/** Makes `file` holding `text` if it doesn't exist yet, which only one process can do. Whether this one did. */
function made(file: string, text: string): boolean {
  try {
    writeFileSync(file, text, { flag: "wx" })

    return true
  } catch {
    return false
  }
}

/**
 * The session this copy's windows use (`docs/proposals/settings.md`, The freeze). Chromium's storage in a session can be
 * used by one process at a time, so a second copy on a shared one waits for the first, about 3 s. Each copy running at
 * once takes the first free folder, under a lock file of ours, so none waits, and each keeps the code it compiled
 * between launches, as an in-memory session wouldn't.
 */
export function claimSessionSlot(folder: string, options: SlotOptions = {}): SessionSlot {
  const { pid = process.pid, alive = running, waitMs = 2000, staleMs = 10_000 } = options
  const locks = join(folder, "session-locks")

  try {
    mkdirSync(locks, { recursive: true })
  } catch {
    return shared
  }

  return whileClaiming(locks, () => takeSlot(locks, pid, alive), waitMs, staleMs)
}
