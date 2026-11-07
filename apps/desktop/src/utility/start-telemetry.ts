// Imported first by the service's entry, so an error while the rest of it loads is reported too (PAR-620).
import { watchServiceLag } from "./service-lag.ts"
import { startTelemetry } from "./telemetry.ts"

watchServiceLag(startTelemetry())
