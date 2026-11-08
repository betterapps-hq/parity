import { randomUUID } from "node:crypto"
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  cliEvents,
  createTelemetry,
  desktopDataFolder,
  type Envelope,
  type EventAttributes,
  type EventName,
  endWhenSettled,
  errorCode,
  readSavedTelemetry,
  type Sink,
  type Span,
  type Telemetry,
  type TraceHeaders,
  telemetryFileName,
  traceHeaders
} from "@parity-app/telemetry"

/*
 * The CLI's own events (PAR-641): each command it runs, the copies of the app it can't reach or can't read, and the MCP
 * sessions it serves. Until `startCliTelemetry` runs, as in unit tests and for code that imports the client, nothing is
 * recorded. They're written to `~/.parity/logs` until the CLI sends them to Sentry (PAR-642).
 */

type CliEvents = typeof cliEvents
export type CliTelemetry = Telemetry<CliEvents>

let telemetry: CliTelemetry | undefined
/** The command running, whose trace the CLI's calls to the app continue. */
let run: Span | undefined

/**
 * Where the CLI writes its events, one file a day, the newest 10 kept: `~/.parity/logs`, or the folder
 * `PARITY_CLI_LOGS` names. Under Vitest only that folder, so tests never write to the person's own.
 */
export function cliLogFolder(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.PARITY_CLI_LOGS) return env.PARITY_CLI_LOGS
  return env.VITEST ? undefined : join(homedir(), ".parity", "logs")
}
const keptFiles = 10
const fileName = /^parity-cli-\d{4}-\d{2}-\d{2}\.jsonl$/

/** A sink that appends each event as a line to the day's file, and drops the oldest past 10. Synchronous, and small. */
export function fileSink(folder: string): Sink {
  let pruned = false
  const write = (envelope: Envelope) => {
    mkdirSync(folder, { recursive: true })
    appendFileSync(join(folder, `parity-cli-${envelope.time.slice(0, 10)}.jsonl`), `${JSON.stringify(envelope)}\n`)
    if (pruned) return
    pruned = true
    const files = readdirSync(folder)
      .filter((name) => fileName.test(name))
      .sort()
    for (const name of files.slice(0, Math.max(0, files.length - keptFiles)))
      rmSync(join(folder, name), { force: true })
  }
  return { event: write, span: write }
}

/** The app's install ID from its `telemetry.json`, so the CLI's events group with the app's, or none before it ran. */
function installId(): string {
  const folder = desktopDataFolder({ platform: process.platform, env: process.env, home: homedir() })
  try {
    return readSavedTelemetry(readFileSync(join(folder, telemetryFileName), "utf8")).installId ?? "none"
  } catch {
    return "none"
  }
}

/** Starts recording the CLI's events, from `parity` itself. Events are checked when it runs from source. */
export function startCliTelemetry(): CliTelemetry {
  const folder = cliLogFolder()
  return setCliTelemetry(
    createTelemetry({
      events: cliEvents,
      context: { process: "cli", installId: installId(), sessionId: randomUUID() },
      sinks: folder ? [fileSink(folder)] : [],
      check: import.meta.url.endsWith(".ts"),
      // A log that can't be written never fails a command.
      onSinkError: () => undefined
    })
  )
}

/** Records the CLI's events through `given`, or stops recording them with none, as tests do. */
export function setCliTelemetry<T extends CliTelemetry | undefined>(given: T): T {
  telemetry = given
  run = undefined
  return given
}

/** Records one of the CLI's events, once its telemetry has started, under the running command's span. */
export function recordCli<Name extends EventName<CliEvents>>(
  name: Name,
  attributes: EventAttributes<CliEvents, Name>
): void {
  telemetry?.track(name, attributes, run ? { span: run } : {})
}

/**
 * Runs a command in a `cli.ran` span, ended with what it exits with and a failure's code, so a call it makes to the app
 * continues its trace.
 */
export async function inCliRun(command: string, flags: string[], work: () => Promise<void>): Promise<void> {
  if (!telemetry) return work()
  const span = telemetry.startSpan("cli.ran", { command, flags })
  run = span
  // Only while it runs: `parity mcp` returns once it's listening, and each MCP call starts a trace of its own.
  await endWhenSettled(span, () => work().finally(() => (run = undefined)), {
    result: () => {
      const exitCode = Number(process.exitCode ?? 0)
      return { outcome: exitCode === 0 ? "ok" : "error", attributes: { exitCode } }
    },
    error: (error) => {
      const code = errorCode(error)
      return { outcome: "error", attributes: { exitCode: 1, ...(code === undefined ? {} : { code }) } }
    }
  })
}

/** The headers that continue the running command's trace in the app, or none outside one. */
export function runTraceHeaders(): TraceHeaders | undefined {
  return run ? traceHeaders(run) : undefined
}
