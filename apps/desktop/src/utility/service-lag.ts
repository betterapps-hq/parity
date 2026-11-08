import { lagCheck, type registeredEvents, slowThresholdMs, type Telemetry } from "@parity-app/telemetry"

/** How often the service checks its own event loop, in milliseconds. */
const every = 500

/** Records `service.lag` whenever the service's event loop runs a timer over 200 ms late (PAR-631). */
export function watchServiceLag(telemetry: Telemetry<typeof registeredEvents>): void {
  const check = lagCheck({ every, threshold: slowThresholdMs, start: performance.now() })
  setInterval(() => {
    const lateMs = check.tick(performance.now())
    if (lateMs !== undefined) telemetry.track("service.lag", { lateMs })
  }, every).unref()
}
