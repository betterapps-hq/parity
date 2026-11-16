import { readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { desktopDataFolder, type Envelope, type Level, type Process } from "@parity-app/telemetry"
import { z } from "zod"
import { invalidInput } from "./errors.ts"
import type { OperationInput } from "./operations.ts"

/**
 * `parity logs` and `get_logs`: Parity's own events from the local copy main writes at every level, Off included,
 * `<userData>/logs/parity-<date>.jsonl` (PAR-627). Reading it needs no running app (PAR-636).
 */

const levels = ["debug", "info", "warn", "error", "fatal"] as const satisfies readonly Level[]

const processes = [
  "main",
  "renderer",
  "render",
  "service",
  "worker",
  "builder",
  "cli"
] as const satisfies readonly Process[]

/** An event as the local copy has it: an envelope, with the test run main adds when `PARITY_TEST_RUN` is set. */
export type LogEvent = Envelope & { testRun?: string }

/** What `get_logs` takes; its tool description says what each means, since descriptions here cost tools/list bytes. */
export const logsInputSchema = z.object({
  level: z.enum(levels).optional(),
  process: z.enum(processes).optional(),
  trace: z.string().optional(),
  testRun: z.string().optional(),
  since: z.string().optional(),
  session: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional()
})

export const logsFields = Object.keys(logsInputSchema.shape)

export interface LogsResult {
  folder: string
  /** The run shown, unless several are. */
  session?: string
  /** The matching events, oldest first, the newest `limit` of them. */
  events: LogEvent[]
  total: number
  truncated: boolean
  limit: number
}

/** The folder main writes the local copy to, for this system and its variables. */
export function logsFolder(env: NodeJS.ProcessEnv = process.env): string {
  return join(desktopDataFolder({ platform: process.platform, env, home: homedir() }), "logs")
}

const fileName = /^parity-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.jsonl$/

/** What a line needs to be read as an event: its name and time, which every envelope has. */
const loggedLine = z.looseObject({ name: z.string(), time: z.string() })

/** Every event in the folder's log files, oldest first. Lines that aren't events are skipped. */
export function readEvents(folder: string): LogEvent[] {
  let names: string[]

  try {
    names = readdirSync(folder)
  } catch {
    return []
  }

  const files = names
    .map((name) => ({ name, match: fileName.exec(name) }))
    .filter((file) => file.match)
    .sort(
      (a, b) =>
        (a.match?.[1] ?? "").localeCompare(b.match?.[1] ?? "") || Number(a.match?.[2] ?? 1) - Number(b.match?.[2] ?? 1)
    )

  const events: LogEvent[] = []

  for (const file of files) {
    let text: string

    try {
      text = readFileSync(join(folder, file.name), "utf8")
    } catch {
      continue
    }

    for (const line of text.split("\n")) {
      if (!line.trim()) {
        continue
      }

      try {
        const event = JSON.parse(line)

        if (loggedLine.safeParse(event).success) {
          // SAFETY: main writes every line as an envelope, so one with its name and time is whole, not cut short.
          events.push(event as LogEvent)
        }
      } catch {
        // A line cut short by a crash or a full disk.
      }
    }
  }

  return events.sort((a, b) => a.time.localeCompare(b.time))
}

const units = new Map([
  ["s", 1000],
  ["m", 60_000],
  ["h", 3_600_000],
  ["d", 86_400_000]
])

/** When `since` starts, in milliseconds since 1970. */
function sinceTime(since: string, now: number): number {
  const ago = /^(\d+(?:\.\d+)?)([smhd])$/.exec(since.trim())

  if (ago?.[1] && ago[2]) {
    return now - Number(ago[1]) * (units.get(ago[2]) ?? 0)
  }

  const time = Date.parse(since)

  if (Number.isNaN(time)) {
    throw invalidInput("since", 'since must be an ISO time or how long ago, as "10m" or "2h"')
  }

  return time
}

/** Reads and filters the local copy. `now` is for tests. */
export function readLogs(input: OperationInput, { folder = logsFolder(), now = Date.now() } = {}): LogsResult {
  const parsed = logsInputSchema.safeParse(input)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw invalidInput(issue?.path[0]?.toString(), issue?.message ?? "invalid input")
  }

  const { level, process: from, trace, testRun, since, session, limit = 100 } = parsed.data
  let events = readEvents(folder)
  const floor = level ? levels.indexOf(level) : 0
  const after = since === undefined ? undefined : sinceTime(since, now)
  const traceId = trace?.trim().toLowerCase()

  // The last run is the newest event's, unless a trace or test run, which can span runs, narrows it instead.
  const shown = session === "all" ? undefined : (session ?? (traceId || testRun ? undefined : events.at(-1)?.sessionId))
  events = events.filter(
    (event) =>
      (shown === undefined || event.sessionId === shown) &&
      levels.indexOf(event.level) >= floor &&
      (from === undefined || event.process === from) &&
      (!traceId || event.traceId?.startsWith(traceId)) &&
      (testRun === undefined || event.testRun === testRun) &&
      (after === undefined || Date.parse(event.time) >= after)
  )

  // The run shown goes second, after the folder, where people reading --json find it.
  const head: Pick<LogsResult, "folder" | "session"> = { folder }

  if (shown) {
    head.session = shown
  }

  return {
    ...head,
    events: events.slice(-limit),
    total: events.length,
    truncated: events.length > limit,
    limit
  }
}

/** One line an event, oldest first: its time, level, process, name, trace and attributes. */
export function describeLogs({ folder, events, total, truncated }: LogsResult): string {
  if (events.length === 0) {
    return `No events match in ${folder}.`
  }

  const count = total === 1 ? "1 event" : `${total} events`
  const lines = [`${count}${truncated ? `, the newest ${events.length} shown` : ""}, oldest first:`]

  for (const event of events) {
    const span =
      event.durationMs === undefined
        ? ""
        : ` (${Math.round(event.durationMs)} ms${event.outcome && event.outcome !== "ok" ? `, ${event.outcome}` : ""})`

    const trace = event.traceId ? ` trace ${event.traceId.slice(0, 8)}` : ""
    const attributes = Object.keys(event.attributes ?? {}).length > 0 ? ` ${JSON.stringify(event.attributes)}` : ""
    lines.push(`${event.time} ${event.level} ${event.process} ${event.name}${span}${trace}${attributes}`)
  }

  if (truncated) {
    lines.push("Narrow them with level, process, trace or since, or raise limit, to see the rest.")
  }

  return lines.join("\n")
}
