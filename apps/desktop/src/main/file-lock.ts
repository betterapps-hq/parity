import { randomUUID } from "node:crypto"
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { z } from "zod"

export interface LockOptions {
  /** How long to wait for another copy to let go, in milliseconds, before giving up. */
  waitMs?: number
  /** How old a lock must be to count as left behind by a copy that died, in milliseconds. */
  staleMs?: number
  now?: () => number
}

const errorCode = z.object({ code: z.string() })

/**
 * Runs `work` holding `<file>.lock`, so copies of Parity sharing a data folder change `file` one at a time. The lock is
 * made with an exclusive create. A copy waits for one another holds, with growing gaps, and fails after `waitMs`. One
 * older than `staleMs` was left by a copy that died: it's renamed to a name of this copy's own, which only one copy
 * can do, then taken.
 */
export async function withFileLock<T>(file: string, work: () => Promise<T>, options: LockOptions = {}): Promise<T> {
  const { waitMs = 2000, staleMs = 10_000, now = Date.now } = options
  const lock = `${file}.lock`
  const started = now()

  for (let gap = 10; ; gap = Math.min(gap * 2, 200)) {
    try {
      await writeFile(lock, JSON.stringify({ pid: process.pid, at: now() }), { flag: "wx" })
      break
    } catch (error) {
      if (errorCode.safeParse(error).data?.code !== "EEXIST") {
        throw error
      }
    }

    if (await takeStale(lock, staleMs, now)) {
      continue
    }

    if (now() - started >= waitMs) {
      throw new Error(`${lock} is held by another copy of Parity.`)
    }

    await new Promise((resolve) => setTimeout(resolve, gap))
  }

  try {
    return await work()
  } finally {
    await rm(lock, { force: true })
  }
}

/** Whether `lock` was left behind and this copy moved it aside; only one copy's rename can find it there. */
async function takeStale(lock: string, staleMs: number, now: () => number): Promise<boolean> {
  try {
    const at = await lockTime(lock)

    if (now() - at < staleMs) {
      return false
    }

    const aside = `${lock}.${process.pid}-${randomUUID()}`
    await rename(lock, aside)
    await rm(aside, { force: true })

    return true
  } catch {
    // It went while this looked, or another copy moved it first: try for it again.
    return false
  }
}

/** When the lock was taken: what it says, or its modified time when it was cut short. */
async function lockTime(lock: string): Promise<number> {
  const text = await readFile(lock, "utf8")
  let json: unknown

  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }

  const said = z.object({ at: z.number() }).safeParse(json)

  return said.success ? said.data.at : (await stat(lock)).mtimeMs
}
