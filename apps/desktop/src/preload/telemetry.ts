import type { Envelope } from "@parity-app/telemetry"
import { contextBridge, ipcRenderer } from "electron"
import { ipc } from "../shared/channels.ts"
import { readTelemetryRun, type TelemetryRun, telemetryRunArgument } from "../shared/telemetry-run.ts"

/** What a page's telemetry gets from its preload: this run, and a way to send main what it records (PAR-627). */
export interface TelemetryHost {
  run: TelemetryRun
  record(envelope: Envelope): void
}

/** Gives the page `window.parityTelemetry`. */
export function exposeTelemetry(): void {
  const argument = process.argv.find((value) => value.startsWith(telemetryRunArgument))
  const host: TelemetryHost = {
    run: readTelemetryRun(argument?.slice(telemetryRunArgument.length)),
    record: (envelope) => ipcRenderer.send(ipc.telemetry, envelope)
  }
  contextBridge.exposeInMainWorld("parityTelemetry", host)
}
