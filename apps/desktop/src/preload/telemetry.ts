import type { Envelope, TraceHeaders } from "@parity-app/telemetry"
import { contextBridge, ipcRenderer } from "electron"
import { ipc } from "../shared/channels.ts"
import { readTelemetryRun, type TelemetryRun, telemetryRunArgument } from "../shared/telemetry-run.ts"

/** What a page's telemetry gets from its preload: this run, and a way to send main what it records (PAR-627). */
export interface TelemetryHost {
  run: TelemetryRun
  record(envelope: Envelope): void
  /** Calls `listener` with the open projects' `.env` values to scrub, now and whenever they change (PAR-672). */
  onSecrets(listener: (secrets: string[]) => void): void
  /** Gives the preload the page's trace, which each request to main then carries (PAR-810). */
  traceFrom(current: () => TraceHeaders | undefined): void
}

/** The page's trace, which it gives through `traceFrom`; none until it does, or in the render windows. */
let pageTrace: () => TraceHeaders | undefined = () => undefined

/** What a request to main sends after `argument`: the page's trace, when it's in one. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- whatever argument the request sends, passed on unread
export function withTrace(argument: unknown): unknown[] {
  const trace = pageTrace()

  if (trace) {
    return [argument, trace]
  }

  return argument === undefined ? [] : [argument]
}

/** Gives the page `window.parityTelemetry`. */
export function exposeTelemetry(): void {
  const argument = process.argv.find((value) => value.startsWith(telemetryRunArgument))

  const host: TelemetryHost = {
    run: readTelemetryRun(argument?.slice(telemetryRunArgument.length)),
    record: (envelope) => ipcRenderer.send(ipc.telemetry, envelope),
    onSecrets: (listener) => {
      ipcRenderer.on(ipc.telemetrySecretsChanged, (_event, secrets: string[]) => listener(secrets))
      void ipcRenderer.invoke(ipc.telemetrySecrets).then((secrets: string[]) => listener(secrets))
    },
    traceFrom: (current) => {
      pageTrace = current
    }
  }

  contextBridge.exposeInMainWorld("parityTelemetry", host)
}
