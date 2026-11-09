import { z } from "zod"
import type { Envelope } from "./envelope.ts"
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

/** The events in a log file's text, one JSON object a line. Lines that aren't events, as one cut short, are skipped. */
export function parseLogLines(text: string): LoggedEvent[] {
  const events: LoggedEvent[] = []

  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue
    }

    try {
      const event = JSON.parse(line) as LoggedEvent

      if (typeof event?.name === "string" && typeof event.time === "string") {
        events.push(event)
      }
    } catch {
      // A line cut short by a crash or a full disk.
    }
  }

  return events
}

/** A run of the app that ended without quitting. */
export interface Crash {
  sessionId: string
  /** The time of its last event, in ISO 8601: as close as the local copy gets to when it stopped. */
  time: string
  /** Its last error, if it recorded one before it stopped. */
  lastError?: { name: string; time: string; attributes: Record<string, unknown> }
  /** Its last events, oldest first. */
  events: LoggedEvent[]
}

/**
 * The app's last run before `current`, if it ended without quitting: main records `app.quit` as the app quits, so a
 * run whose main events don't include one crashed or was killed. A run that only the CLI recorded isn't the app's.
 */
export function lastRunCrash(events: readonly LoggedEvent[], current: string): Crash | undefined {
  let last: string | undefined

  for (const event of events) {
    if (event.sessionId !== current && event.process === "main") {
      last = event.sessionId
    }
  }

  if (!last) {
    return undefined
  }

  const run = events.filter((event) => event.sessionId === last)

  if (run.some((event) => event.name === "app.quit")) {
    return undefined
  }

  const lastEvent = run.at(-1)

  if (!lastEvent) {
    return undefined
  }

  const error = run.findLast((event) => event.level === "error" || event.level === "fatal")

  return {
    sessionId: last,
    time: lastEvent.time,
    ...(error ? { lastError: { name: error.name, time: error.time, attributes: error.attributes } } : {}),
    events: run.slice(-crashEventsKept)
  }
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
