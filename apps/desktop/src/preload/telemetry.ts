import type { Envelope, TraceHeaders } from "@parity-app/telemetry"
import { contextBridge, ipcRenderer } from "electron"
import { ipc } from "../shared/channels.ts"
import { readTelemetryRun, type TelemetryRun, telemetryRunArgument } from "../shared/telemetry-run.ts"
import { ask, tellUntraced, traceFrom } from "./main.ts"

/** What a page's telemetry gets from its preload: this run, and a way to send main what it records (PAR-627). */
export interface TelemetryHost {
  run: TelemetryRun
  record(envelope: Envelope): void
  /** Calls `listener` with the open projects' `.env` values to scrub, now and whenever they change (PAR-672). */
  onSecrets(listener: (secrets: string[]) => void): void
  /** Gives the preload the page's trace, which each request to main then carries (PAR-810). */
  traceFrom(current: () => TraceHeaders | undefined): void
}

/** Gives the page `window.parityTelemetry`. */
export function exposeTelemetry(): void {
  const argument = process.argv.find((value) => value.startsWith(telemetryRunArgument))

  const host: TelemetryHost = {
    run: readTelemetryRun(argument?.slice(telemetryRunArgument.length)),
    record: (envelope) => tellUntraced("record", envelope),
    onSecrets: (listener) => {
      ipcRenderer.on(ipc.telemetrySecretsChanged, (_event, secrets: string[]) => listener(secrets))
      void ask("telemetrySecrets").then(listener)
    },
    traceFrom
  }

  contextBridge.exposeInMainWorld("parityTelemetry", host)
}
