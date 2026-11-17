import type { EventAttributes, EventName, registeredEvents, Telemetry } from "@parity-app/telemetry"

type Events = typeof registeredEvents

/**
 * Where the window's interface and navigation events go (PAR-634). The stores that own panels, dialogs, modes and
 * preferences record their own changes through `recordInterface`, so each kind is recorded in one place. Until
 * `startTelemetry` hands over the window's telemetry, as in tests and stories, nothing is recorded.
 */
let telemetry: Telemetry<Events> | undefined

export function setInterfaceTelemetry(next: Telemetry<Events> | undefined): void {
  telemetry = next
}

export function recordInterface<Name extends EventName<Events>>(name: Name, attributes: EventAttributes<Events, Name>) {
  telemetry?.track(name, attributes)
}
