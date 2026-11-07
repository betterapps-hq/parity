// Imported first by the service's entry, so an error while the rest of it loads is reported too (PAR-620).
import { startTelemetry } from "./telemetry.ts"

/** The service's telemetry, for what it records itself. */
export const telemetry = startTelemetry()
