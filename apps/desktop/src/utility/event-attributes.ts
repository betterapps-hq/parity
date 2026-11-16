import type { EventAttributes, EventName, registeredEvents } from "@parity-app/telemetry"

/** What an event from the service carries, for building it up, optional attributes and all, before it's recorded. */
export type Attributes<Name extends EventName<typeof registeredEvents>> = EventAttributes<typeof registeredEvents, Name>
