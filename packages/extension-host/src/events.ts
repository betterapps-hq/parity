import type { EventAttributes, EventName, registeredEvents } from "@parity-app/telemetry"

type Events = typeof registeredEvents

/** The lifecycle events of extensions' halves (`packages/telemetry/src/extension-events.ts`). */
export type ExtensionEventName = Extract<EventName<Events>, `extension.${string}`>

/** Records one of extensions' lifecycle events: the window's or the service's telemetry, or a test's list. */
export type RecordExtensionEvent = <Name extends ExtensionEventName>(
  name: Name,
  attributes: EventAttributes<Events, Name>
) => void
