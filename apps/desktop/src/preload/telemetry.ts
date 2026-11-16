import type { Envelope, TraceHeaders } from "@parity-app/telemetry"
import { contextBridge } from "electron"
import { readTelemetryRun, type TelemetryRun, telemetryRunArgument } from "../shared/telemetry-run.ts"
import { tellUntraced, traceFrom } from "./main.ts"

/**
 * What a page's telemetry gets from its preload: this run, and a way to send main what it records (PAR-627). Not the
 * open projects' `.env` values: a project's code runs in the page, so main keeps them and scrubs them from what the page
 * sends (PAR-983).
 */
export interface TelemetryHost {
  run: TelemetryRun
  record(envelope: Envelope): void
  /** Gives the preload the page's trace, which each request to main then carries (PAR-810). */
  traceFrom(current: () => TraceHeaders | undefined): void
}

/** Gives the page `window.parityTelemetry`. */
export function exposeTelemetry(): void {
  const argument = process.argv.find((value) => value.startsWith(telemetryRunArgument))

  const host: TelemetryHost = {
    run: readTelemetryRun(argument?.slice(telemetryRunArgument.length)),
    record: (envelope) => tellUntraced("record", envelope),
    traceFrom
  }

  contextBridge.exposeInMainWorld("parityTelemetry", host)
}
