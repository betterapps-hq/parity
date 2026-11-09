import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { type Envelope, type LoggedEvent, parseLogLines, type Sink } from "@parity-app/telemetry"

/** How large a log file grows before the next one starts. */
export const logFileBytes = 5 * 2 ** 20

/** How many log files are kept, newest first. */
export const logFilesKept = 10

/** How long events wait to be written together, in milliseconds. */
const flushMs = 1000

/** `parity-<date>.jsonl`, then `parity-<date>.2.jsonl` and on once a day's first file is full. */
const fileName = /^parity-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.jsonl$/

interface LogFile {
  name: string
  date: string
  part: number
}

function readName(name: string): LogFile | undefined {
  const match = fileName.exec(name)

  if (!match?.[1]) {
    return undefined
  }

  return { name, date: match[1], part: match[2] ? Number(match[2]) : 1 }
}

const nameOf = (date: string, part: number) => `parity-${date}${part > 1 ? `.${part}` : ""}.jsonl`

/** The log files in a folder, oldest first. */
function logFiles(folder: string): LogFile[] {
  let names: string[]

  try {
    names = readdirSync(folder)
  } catch {
    return []
  }

  return names
    .map(readName)
    .filter((file) => file !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date) || a.part - b.part)
}

function sizeOf(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

export interface LogFilesOptions {
  folder: string
  maxBytes?: number
  keep?: number
  /** The time in milliseconds since 1970, for tests. */
  now?: () => number
}

/**
 * Appends lines to the day's log file in `folder`, starting another when it would pass `maxBytes` or the day changes,
 * and deleting the oldest so `keep` are left. Every write is synchronous, so what's written is on disk when it returns.
 */
export function createLogFiles({
  folder,
  maxBytes = logFileBytes,
  keep = logFilesKept,
  now = Date.now
}: LogFilesOptions) {
  let current: { file: LogFile; size: number } | undefined

  /** The file the next `bytes` go to, rolling on to another when they don't fit. */
  function fileFor(bytes: number): string {
    const date = new Date(now()).toISOString().slice(0, 10)

    if (!current || current.file.date !== date) {
      mkdirSync(folder, { recursive: true })
      const last = logFiles(folder).findLast((file) => file.date === date)
      const file = last ?? { name: nameOf(date, 1), date, part: 1 }
      current = { file, size: sizeOf(join(folder, file.name)) }
    }

    if (current.size > 0 && current.size + bytes > maxBytes) {
      const part = current.file.part + 1
      current = { file: { name: nameOf(date, part), date, part }, size: 0 }
    }

    return join(folder, current.file.name)
  }

  function prune(): void {
    const files = logFiles(folder)

    for (const file of files.slice(0, Math.max(0, files.length - keep))) {
      rmSync(join(folder, file.name), { force: true })
    }
  }

  return {
    /** Writes `text`, whole lines, to the current file. */
    append(text: string): void {
      if (!text) {
        return
      }

      const bytes = Buffer.byteLength(text)
      const path = fileFor(bytes)
      const started = current?.size === 0
      appendFileSync(path, text)

      if (current) {
        current.size += bytes
      }

      if (started) {
        prune()
      }
    }
  }
}

export type LogFiles = ReturnType<typeof createLogFiles>

/**
 * The local copy: every event and span, from every process, as a line of JSON. Lines are written together each second,
 * and at once for a `fatal` event, which may be the last thing a process does. `flush` writes what's waiting. A
 * `testRun` (`PARITY_TEST_RUN`) goes on every line, so `parity logs --test-run` finds a pass's events (PAR-636).
 */
export function createLogFileSink(
  files: LogFiles,
  { delayMs = flushMs, testRun }: { delayMs?: number; testRun?: string | undefined } = {}
): Sink & { flush(): void } {
  let waiting = ""
  let timer: ReturnType<typeof setTimeout> | undefined

  function flush(): void {
    clearTimeout(timer)
    timer = undefined
    const text = waiting
    waiting = ""

    try {
      files.append(text)
    } catch (error) {
      // A full disk or a folder that can't be written loses the local copy, never the app.
      console.warn("[telemetry] couldn't write the log file:", error)
    }
  }

  function write(envelope: Envelope): void {
    waiting += `${JSON.stringify(testRun ? { ...envelope, testRun } : envelope)}\n`

    if (envelope.level === "fatal") {
      flush()
    } else if (!timer) {
      timer = setTimeout(flush, delayMs)
      timer.unref?.()
    }
  }

  return { event: write, span: write, flush }
}

/** Every event in the folder's log files, oldest first, for a report (PAR-635). A file that can't be read is skipped. */
export function readLogEvents(folder: string): LoggedEvent[] {
  const events: LoggedEvent[] = []

  for (const file of logFiles(folder)) {
    try {
      events.push(...parseLogLines(readFileSync(join(folder, file.name), "utf8")))
    } catch {
      // Deleted as the oldest while it was being read.
    }
  }

  return events.sort((a, b) => a.time.localeCompare(b.time))
}
