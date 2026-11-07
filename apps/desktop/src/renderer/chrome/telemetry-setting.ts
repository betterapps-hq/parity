import type { TelemetryLevel } from "@parity-app/telemetry"
import { useEffect, useSyncExternalStore } from "react"
import type { TelemetryState } from "../../shared/protocol.ts"
import { followTelemetry } from "../replay.ts"

/** The Telemetry setting and install ID as main last gave them; Settings and About share it (PAR-626). */
let state: TelemetryState | undefined
const listeners = new Set<() => void>()

/** Keeps what main says, tells Settings and About, and starts or stops Session Replay with it (PAR-624). */
export function receiveTelemetry(next: TelemetryState | undefined): TelemetryState | undefined {
  state = next
  if (next) followTelemetry(next.level)
  for (const listener of listeners) listener()
  return next
}

export function setTelemetryLevel(level: TelemetryLevel): Promise<TelemetryState | undefined> {
  return window.canvasHost.telemetry.setLevel(level).then(receiveTelemetry)
}

/** The setting as main last gave it, asked for again each time `open` turns true, as a dialog showing it opens. */
export function useTelemetry(open: boolean): TelemetryState | undefined {
  useEffect(() => {
    if (open) void window.canvasHost.telemetry.get().then(receiveTelemetry, () => undefined)
  }, [open])
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state
  )
}

/** Each level's name, as Settings and About show it. */
export const telemetryLevelNames: Record<TelemetryLevel, string> = { all: "On", off: "Off" }
