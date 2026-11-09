import { randomUUID } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { errorDetails } from "@parity-app/core/errors"
import {
  type AgentCaller,
  cliEvents,
  createSentrySink,
  createTelemetry,
  type Driver,
  desktopDataFolder,
  driverTags,
  type Envelope,
  type EventAttributes,
  type EventName,
  endWhenSettled,
  errorCode,
  type ResolvedTelemetry,
  type RunVariables,
  readSavedTelemetry,
  resolveTelemetry,
  runTags,
  type Sink,
  type Span,
  type Telemetry,
  type TelemetryLevel,
  type TelemetryVariables,
  type TraceContext,
  type TraceHeaders,
  telemetryEnvironment,
  telemetryFileName,
  telemetryUser,
  traceHeaders
} from "@parity-app/telemetry"
import { cliVersion } from "./diagnostics.ts"
import { type BatchRun, createOutbox, loadedDebugIds, type Outbox, startSender, writeBatch } from "./outbox.ts"

/*
 * The CLI's own events (PAR-641): each command it runs, the copies of the app it can't reach or can't read, and the MCP
 * sessions it serves. Until `startCliTelemetry` runs, as in unit tests and for code that imports the client, nothing is
 * recorded. They're written to `~/.parity/logs`, and sent to Sentry's `parity-cli` project unless diagnostics are off,
 * as the app decides it (PAR-642).
 */

type CliEvents = typeof cliEvents
export type CliTelemetry = Telemetry<CliEvents>

let telemetry: CliTelemetry | undefined
/** The command running, whose trace the CLI's calls to the app continue. */
let run: Span | undefined
/** The last command's trace, which a failure it ends with is reported in, after its span has ended. */
let lastRun: TraceContext | undefined

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

/**
 * The level this run sends at and the install it reports as, from the app's `telemetry.json` and the variables, as the
 * app decides them (PAR-642). The file's text is given, or none before the app has run, when the level is `all` and the
 * install ID `none`. A `PARITY_TELEMETRY` that isn't a level throws, as it stops the app.
 */
export function cliTelemetrySetting(
  variables: TelemetryVariables,
  saved: string | undefined
): ResolvedTelemetry & { installId: string } {
  const read = readSavedTelemetry(saved)
  return { ...resolveTelemetry(variables, read.level), installId: read.installId ?? "none" }
}

function savedTelemetry(): string | undefined {
  const folder = desktopDataFolder({ platform: process.platform, env: process.env, home: homedir() })
  try {
    return readFileSync(join(folder, telemetryFileName), "utf8")
  } catch {
    return undefined
  }
}

/**
 * The line the CLI prints once, to stderr, the first time it runs with diagnostics on, so whoever runs it knows they're
 * shared and how to stop it. Nothing when they're off, or once it's been shown.
 */
export function telemetryNotice(level: TelemetryLevel, shown: boolean): string | undefined {
  if (level === "off" || shown) return undefined
  return "Parity shares diagnostics to help fix bugs. To stop sharing them, turn off Settings > Privacy > Share diagnostics in the app, or set PARITY_TELEMETRY=off."
}

/** Prints the notice the first time, and remembers it was shown in `~/.parity`. A file that can't be written shows it again. */
function showNotice(level: TelemetryLevel): void {
  const file = join(homedir(), ".parity", "telemetry-notice")
  const notice = telemetryNotice(level, existsSync(file))
  if (!notice) return
  console.error(notice)
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${new Date().toISOString()}\n`)
  } catch {
    // Shown again next time.
  }
}

/** Where the CLI's batches wait for the sender: `~/.parity/outbox`, or the folder `PARITY_CLI_OUTBOX` names. */
export function cliOutboxFolder(env: NodeJS.ProcessEnv = process.env): string {
  return env.PARITY_CLI_OUTBOX || join(homedir(), ".parity", "outbox")
}

/** Who's calling, as the app's driver tags name them: the CLI's calls are always an agent's, as the app counts them. */
let caller: AgentCaller = { name: "Terminal", id: "Terminal" }

/** The caller the CLI's calls name, which its events are tagged with: from the variables, or MCP's client. */
export function cliCallerChanged(next: AgentCaller): void {
  caller = next
}

/** What `vp pack` writes beside the bundles (PAR-719): whether `npm publish` made them, and the commit they're from. */
export interface CliBuild {
  published: boolean
  commit?: string
}

/** This CLI's build, from `build.json` beside the bundle, or nothing when it runs from source. */
function cliBuild(): CliBuild | undefined {
  try {
    const build = JSON.parse(readFileSync(new URL("./build.json", import.meta.url), "utf8")) as {
      published?: unknown
      commit?: unknown
    }
    return {
      published: build.published === true,
      ...(typeof build.commit === "string" ? { commit: build.commit } : {})
    }
  } catch {
    return undefined
  }
}

/** What names an unpublished build's release: the commit it was built from, or a checkout's folder run from source. */
function releaseSource(build: CliBuild | undefined): Pick<BatchRun, "commit" | "source"> {
  if (!build) return { source: fileURLToPath(new URL(".", import.meta.url)) }
  return build.commit ? { commit: build.commit } : {}
}

/**
 * What a batch reports as: environment, version, release, the test pass and who's driving, read as it's written. Only
 * the build `npm publish` made reports as its version; a pkg.pr.new preview or a checkout's own `dist` is named by the
 * commit it was built from, and a checkout run from source by its commit, which the sender reads off the command's path.
 */
export function batchRun(
  env: NodeJS.ProcessEnv,
  installId: string,
  installed: boolean,
  build: CliBuild | undefined = cliBuild()
): BatchRun {
  const variables: RunVariables = { PARITY_TEST_RUN: env.PARITY_TEST_RUN, PARITY_TESTER: env.PARITY_TESTER }
  const driver: Driver = { kind: "agent", caller }
  const tags: Record<string, string> = { ...runTags(variables) }
  for (const [key, value] of Object.entries(driverTags(driver))) if (value !== undefined) tags[key] = value
  return {
    environment: telemetryEnvironment(env, installed),
    version: cliVersion(),
    published: build?.published ?? false,
    ...releaseSource(build),
    tags,
    user: telemetryUser(installId, variables, driver)
  }
}

/**
 * Starts recording the CLI's events, from `parity` itself. Events are checked when it runs from source. Every event goes
 * to the local copy; with diagnostics on they also go to Sentry, through the outbox, as the command exits, and every 10
 * seconds for one that keeps serving, as `parity mcp` does.
 */
export function startCliTelemetry({ serving = false }: { serving?: boolean } = {}): CliTelemetry {
  const folder = cliLogFolder()
  const setting = cliTelemetrySetting(process.env, savedTelemetry())
  const installed = installedFromNpm()
  const sinks: Sink[] = folder ? [fileSink(folder)] : []
  if (setting.level === "all") {
    const outbox = createOutbox()
    sinks.push(createSentrySink(outbox.target, { upload: true }))
    hand(outbox, setting.installId, installed, serving)
    showNotice(setting.level)
  }
  return setCliTelemetry(
    createTelemetry({
      events: cliEvents,
      context: { process: "cli", installId: setting.installId, sessionId: randomUUID() },
      sinks,
      check: import.meta.url.endsWith(".ts"),
      // A log that can't be written never fails a command.
      onSinkError: () => undefined
    })
  )
}

/**
 * Whether this CLI was installed from npm, which reports as `tester` and names its release by version, as the app's
 * installed builds do. A checkout's, from source or its own `dist`, reports as `development`, named by its commit.
 */
function installedFromNpm(): boolean {
  return fileURLToPath(import.meta.url)
    .split(sep)
    .includes("node_modules")
}

/** The sender, beside this file: `send.ts` in a checkout, `send.mjs` in the published package. */
const sender = fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "./send.ts" : "./send.mjs", import.meta.url))

/** Writes the outbox's batch and starts the sender, as the process exits, and every 10 seconds while it serves. */
function hand(outbox: Outbox, installId: string, installed: boolean, serving: boolean): void {
  const folder = cliOutboxFolder()
  const write = () => {
    try {
      const run = batchRun(process.env, installId, installed)
      const debugIds = loadedDebugIds()
      if (writeBatch(folder, { run, items: outbox.take(), ...(debugIds ? { debugIds } : {}) })) {
        startSender(folder, sender)
      }
    } catch {
      // Diagnostics that can't be written never fail a command.
    }
  }
  // An uncaught error is kept with the command's trace, then sent as the process exits with it.
  process.on("uncaughtExceptionMonitor", (error) => outbox.exception(error, run ?? lastRun, true))
  process.on("exit", write)
  thrown = (error) => outbox.exception(error, run ?? lastRun)
  if (serving) setInterval(write, 10_000).unref()
}

/** Keeps a command's failure that isn't one of Parity's coded errors, which is a bug, to send as a Sentry error. */
let thrown: ((error: unknown) => void) | undefined

/**
 * Reports an error a command failed with, once its telemetry has started. Coded errors, such as invalid input or an app
 * that isn't running, are the command's answer, recorded on `cli.ran`; anything else is a bug in the CLI.
 */
export function reportCliFailure(error: unknown): void {
  if (errorDetails(error) === undefined) thrown?.(error)
}

/** Records the CLI's events through `given`, or stops recording them with none, as tests do. */
export function setCliTelemetry<T extends CliTelemetry | undefined>(given: T): T {
  telemetry = given
  run = undefined
  lastRun = undefined
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
  lastRun = { traceId: span.traceId, spanId: span.spanId }
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
