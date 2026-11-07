// Imported first by the service's entry, so an error while the rest of it loads is reported too (PAR-620).
import { traceWith } from "../shared/tracing.ts"
import { watchServiceLag } from "./service-lag.ts"
import { startTelemetry } from "./telemetry.ts"

// Requests the service answers and sends are spans in the traces they came with (PAR-629), and its event loop is
// watched for lag (PAR-631).
export const telemetry = startTelemetry()
traceWith(telemetry)
watchServiceLag(telemetry)
