import { spawn } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { type AttributeValue, type LoggedEvent, parseLogLines } from "@parity-app/telemetry"
import { inject } from "vite-plus/test"
import { appEnvironment } from "./launch.ts"

/*
 * What the copy recorded, read back from its local copy (PAR-648): main writes every event and span from every process
 * to `<profile>/logs/parity-<date>.jsonl`, at every level, each second. The `parity` commands the tests run write
 * theirs to a folder in the profile too. Both send to Sentry as well, tagged `ci` and with the run's `test_run` on CI.
 */

const repoDir = resolve(import.meta.dirname, "../../..")

/** Where the `parity` commands the tests run write their own events. */
const cliLogs = () => join(inject("app").profile, "cli-logs")

/** Every event in a folder's `.jsonl` files, oldest first. A folder that isn't there yet has none. */
function readFolder(folder: string): LoggedEvent[] {
  let names: string[]

  try {
    names = readdirSync(folder)
  } catch {
    return []
  }

  return names
    .filter((name) => name.endsWith(".jsonl"))
    .flatMap((name) => parseLogLines(readFileSync(join(folder, name), "utf8")))
    .sort((a, b) => a.time.localeCompare(b.time))
}

/** Every event and span the app has written to its local copy so far, from every process. */
export const appEvents = (): LoggedEvent[] => readFolder(join(inject("app").profile, "logs"))

/** Every event and span the `parity` commands the tests ran have recorded. */
export const cliEvents = (): LoggedEvent[] => readFolder(cliLogs())

/** What an event has to match: its name, and any of its envelope's fields or its attributes. */
export interface Match {
  name: string
  attributes?: Record<string, AttributeValue>
  [field: string]: AttributeValue
}

/** Whether an event is the one a match describes. */
function matches(event: LoggedEvent, { name, attributes = {}, ...fields }: Match): boolean {
  if (event.name !== name) {
    return false
  }

  const envelope = new Map(Object.entries(event))

  return (
    Object.entries(fields).every(([key, value]) => envelope.get(key) === value) &&
    Object.entries(attributes).every(([key, value]) => event.attributes[key] === value)
  )
}

/** The events a match describes, oldest first, recorded at or after `since` (an ISO 8601 time) when it's given. */
export function find(events: LoggedEvent[], match: Match, since?: string): LoggedEvent[] {
  return events.filter((event) => (since === undefined || event.time >= since) && matches(event, match))
}

/** The names of the events in a trace, with the process each came from, sorted, so a failure lists what was there. */
export function trace(events: LoggedEvent[], traceId: string | undefined): string[] {
  if (!traceId) {
    return []
  }

  return events.flatMap((event) => (event.traceId === traceId ? [`${event.process} ${event.name}`] : [])).sort()
}

/** The `test_run` the suite gives the app on CI, as main writes it on every line of the local copy, or none locally. */
export function testRun(): string | undefined {
  return appEnvironment().PARITY_TEST_RUN
}

/**
 * Runs the `parity` command from this checkout against this copy alone, with its events written to the profile, and
 * returns its output. It sends to Sentry as an agent's command does, with the same tags. It runs in the checkout, so
 * it acts on the copy's active tab, and the sender it leaves behind holds no folder the suite removes.
 */
export function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const { profile } = inject("app")

  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [join(repoDir, "packages/cli/src/bin.ts"), ...args], {
      cwd: repoDir,
      env: {
        ...appEnvironment(),
        PARITY_AGENT_FILE: join(profile, "agent.json"),
        PARITY_CLI_LOGS: cliLogs(),
        PARITY_CLI_OUTBOX: join(profile, "cli-outbox"),
        PARITY_AGENT_NAME: "e2e"
      },
      stdio: ["ignore", "pipe", "pipe"]
    })

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()))
    child.once("error", fail)
    child.once("exit", (code) => done({ code, stdout, stderr }))
  })
}
