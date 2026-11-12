import { z } from "zod"
import type { Attributes, Envelope } from "./envelope.ts"
import { defineEvent } from "./events.ts"

/*
 * What Help > Report a problem and `parity diagnostics` send or save (PAR-635): the last hour of the local copy, the
 * versions, the projects open in it, and the last run's crash. Built from the local copy's events, so both read the
 * same thing, with or without the app running.
 */

/** An event as the local copy has it, with the test run main adds when `PARITY_TEST_RUN` is set. */
export type LoggedEvent = Envelope & { testRun?: string }

/** How far back the logs in a report go. */
export const reportLogsMs = 60 * 60 * 1000

/** How many of a crashed run's last events go with its crash. */
const crashEventsKept = 200

/** What a line needs to count as an event: its name and time, as text. */
const loggedLine = z.object({ name: z.string(), time: z.string() })

/** The events in a log file's text, one JSON object a line. Lines that aren't events, as one cut short, are skipped. */
export function parseLogLines(text: string): LoggedEvent[] {
  const events: LoggedEvent[] = []

  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue
    }

    try {
      const event = JSON.parse(line)

      if (loggedLine.safeParse(event).success) {
        // SAFETY: main writes each line from an envelope, so a line with a name and a time is one; only those are
        // checked, so a line from another version still reads.
        events.push(event as LoggedEvent)
      }
    } catch {
      // A line cut short by a crash or a full disk.
    }
  }

  return events
}

/** A run of the app that ended without quitting: it crashed, or was stopped, as an agent or a force-quit stops it. */
export interface UnfinishedRun {
  sessionId: string
  /** The time of its last event, in ISO 8601: as close as the local copy gets to when it stopped. */
  time: string
  /** Its last error, if it recorded one before it stopped. */
  lastError?: { name: string; time: string; attributes: Attributes }
  /** Its last events, oldest first. */
  events: LoggedEvent[]
}

/** A run that crashed: one that ended without quitting and left a sign of a crash, or whose window's renderer went. */
export type Crash = UnfinishedRun

/**
 * The app's last run before `current`, if it ended without quitting: main records `app.quit` as the app quits, so a
 * run whose main events don't include one crashed or was stopped. A run that only the CLI recorded isn't the app's.
 */
export function lastUnfinishedRun(events: readonly LoggedEvent[], current: string): UnfinishedRun | undefined {
  const run = lastRun(events, current)

  if (!run || run.some((event) => event.name === "app.quit")) {
    return undefined
  }

  return unfinished(run)
}

/**
 * What an earlier run left behind that says it crashed rather than being stopped, as times in milliseconds since 1970:
 * when Crashpad wrote each minidump, from a native crash in main or a process it started, and when each hang still
 * open as the app exited was last kept, as when main or a window was stuck until someone ended it.
 */
export interface CrashSigns {
  minidumps: readonly number[]
  openHangs: readonly number[]
}

/**
 * The app's last run before `current`, if it crashed (PAR-956). A run that ended without quitting crashed only when it
 * left a sign: a minidump or an open hang from while it ran, or a `fatal` event. Without one it was stopped on purpose,
 * as an agent, the CLI, a dev runner or a force-quit stops it, which isn't a crash. A run whose window's renderer went
 * (`window.gone`) crashed even if it then quit, since the person could only close the dead window.
 */
export function lastRunCrash(events: readonly LoggedEvent[], current: string, signs: CrashSigns): Crash | undefined {
  const run = lastRun(events, current)

  if (!run) {
    return undefined
  }

  if (run.some((event) => event.name === "window.gone" && event.attributes.window === "renderer")) {
    return unfinished(run)
  }

  if (run.some((event) => event.name === "app.quit")) {
    return undefined
  }

  const started = Date.parse(run[0]?.time ?? "")
  const since = (times: readonly number[]) => times.some((time) => time >= started)
  const crashed = since(signs.minidumps) || since(signs.openHangs) || run.some((event) => event.level === "fatal")

  return crashed ? unfinished(run) : undefined
}

/** The main events of the app's last run before `current`, oldest first, or none when there's no other run. */
function lastRun(events: readonly LoggedEvent[], current: string): LoggedEvent[] | undefined {
  let last: string | undefined

  for (const event of events) {
    if (event.sessionId !== current && event.process === "main") {
      last = event.sessionId
    }
  }

  if (!last) {
    return undefined
  }

  return events.filter((event) => event.sessionId === last)
}

function unfinished(run: readonly LoggedEvent[]): UnfinishedRun | undefined {
  const lastEvent = run.at(-1)

  if (!lastEvent) {
    return undefined
  }

  const error = run.findLast((event) => event.level === "error" || event.level === "fatal")

  const crash = { sessionId: lastEvent.sessionId, time: lastEvent.time }
  const kept = run.slice(-crashEventsKept)

  return error
    ? { ...crash, lastError: { name: error.name, time: error.time, attributes: error.attributes }, events: kept }
    : { ...crash, events: kept }
}

/** The versions a report names: Parity's, and what it runs on. */
export interface ReportVersions {
  parity: string
  [part: string]: string
}

/** A file that goes with a report or into a diagnostics zip. */
export interface DiagnosticFile {
  name: string
  contentType: "application/json" | "application/x-ndjson"
  text: string
}

/**
 * The files for a report: the last hour of events, the versions, the projects open in that hour, and a crash if there
 * was one. `now` is in milliseconds since 1970.
 */
export function diagnosticFiles({
  events,
  now,
  versions,
  crash
}: {
  events: readonly LoggedEvent[]
  now: number
  versions: ReportVersions
  crash?: Crash
}): DiagnosticFile[] {
  const since = now - reportLogsMs
  const recent = events.filter((event) => Date.parse(event.time) >= since)

  const files: DiagnosticFile[] = [
    {
      name: "logs.jsonl",
      contentType: "application/x-ndjson",
      text: recent.map((event) => JSON.stringify(event)).join("\n")
    },
    { name: "versions.json", contentType: "application/json", text: JSON.stringify(versions, null, 2) },
    { name: "projects.json", contentType: "application/json", text: JSON.stringify(openProjects(recent), null, 2) }
  ]

  if (crash) {
    files.push({ name: "crash.json", contentType: "application/json", text: JSON.stringify(crash, null, 2) })
  }

  return files
}

/** The projects events were recorded in, by root, in the order they first appear. */
export function openProjects(events: readonly LoggedEvent[]): string[] {
  const roots = new Set<string>()

  for (const event of events) {
    if (event.project) {
      roots.add(event.project)
    }
  }

  return [...roots]
}

export const reportSent = defineEvent(
  "report.sent",
  z.object({
    feedbackId: z.string().describe("The Sentry event ID of the user feedback the report became"),
    screenshot: z.boolean().describe("Whether a screenshot of the window went with it"),
    afterCrash: z.boolean().describe("Whether it was offered on start after the last run crashed"),
    by: z.enum(["person", "agent"]).describe("Who sent it: a person from Help, or an agent with parity report")
  }),
  { level: "info", sentBy: ["main"], when: "Help > Report a problem, parity report or report_problem sends a report." }
)
