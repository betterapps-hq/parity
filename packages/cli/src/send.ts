import { execFileSync } from "node:child_process"
import { createScrubber, sentryScrubbing, telemetryRelease } from "@parity-app/telemetry"
import * as Sentry from "@sentry/node"
import { adoptDebugIds, type Batch, type BatchTarget, sendBatches } from "./outbox.ts"

/*
 * The detached process that sends the CLI's batches to Sentry's `parity-cli` project (PAR-642), started as a command
 * exits: `node send.mjs <outbox folder>`. It loads `@sentry/node`, which a command never does, sends every batch waiting
 * and exits. Nothing it does reaches the command, which has already exited.
 */

/** `parity-cli`'s DSN, as docs/sentry.md lists it. */
const dsn = "https://65d0cf052034375c83fb8f442e40e7f8@o4512381874274304.ingest.us.sentry.io/4512381906255872"

const scrubber = createScrubber()

/** The commit a checkout run from source is at, which names its release, or none outside a Git checkout. */
function commitOf(folder: string | undefined): string | undefined {
  if (!folder) return undefined
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: folder, encoding: "utf8", windowsHide: true }).trim()
  } catch {
    return undefined
  }
}

const releases = new Map<string, string>()

function releaseOf(run: Batch["run"]): string {
  const key = `${run.version}|${run.published}|${run.commit ?? run.source ?? ""}`
  let release = releases.get(key)
  if (release === undefined) {
    release = telemetryRelease({
      project: "parity-cli",
      version: run.version,
      published: run.published,
      commit: run.commit ?? commitOf(run.source)
    })
    releases.set(key, release)
  }
  return release
}

/** Sends one batch in a scope of its own, so its breadcrumbs, tags and user go only with its own events. */
function send(batch: Batch): void {
  const { run } = batch
  const release = releaseOf(run)
  adoptDebugIds(batch)
  // Logs take these from the client's options as they're captured, so each batch sets them before its own.
  const options = Sentry.getClient()?.getOptions()
  if (options) Object.assign(options, { environment: run.environment, release })
  Sentry.withScope((scope) => {
    scope.clearBreadcrumbs()
    scope.setTags(run.tags)
    scope.setUser(run.user)
    const labelled = { environment: run.environment, release }
    for (const item of batch.items) {
      switch (item.kind) {
        case "breadcrumb":
          scope.addBreadcrumb(item.breadcrumb)
          break
        case "event":
          scope.captureEvent({ ...item.event, ...labelled })
          break
        case "log":
          Sentry.withScope((inner) => {
            if (item.log.traceId) inner.setPropagationContext({ traceId: item.log.traceId, sampleRand: Math.random() })
            // A log takes no scope tags, so the run's tags go in its attributes, to filter logs as errors are.
            Sentry.logger[item.log.level](item.log.message, { ...run.tags, ...item.log.attributes })
          })
          break
        case "exception": {
          const error = Object.assign(new Error(item.error.message), { name: item.error.name })
          error.stack = item.error.stack ?? `${item.error.name}: ${item.error.message}`
          scope.captureException(error, {
            ...(item.uncaught ? { mechanism: { type: "onuncaughtexception", handled: false } } : {}),
            captureContext: {
              ...labelled,
              tags: item.tags,
              ...(item.trace
                ? { contexts: { trace: { trace_id: item.trace.traceId, span_id: item.trace.spanId } } }
                : {})
            }
          })
          break
        }
      }
    }
  })
}

const folder = process.argv[2]
if (folder) {
  Sentry.init({
    dsn,
    // Sent only what the command kept: none of the SDK's own instrumentation of this process.
    defaultIntegrations: false,
    enableOpenTelemetrySetup: false,
    sendClientReports: false,
    ...sentryScrubbing(scrubber, Sentry)
  })
  const target: BatchTarget = { send, flush: (timeoutMs) => Sentry.flush(timeoutMs) }
  await sendBatches(folder, target)
  await Sentry.close(2000)
}
