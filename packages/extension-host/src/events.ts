import type { EventAttributes, EventName, registeredEvents } from "@parity-app/telemetry"

type Events = typeof registeredEvents

/** The lifecycle events of extensions' halves (`packages/telemetry/src/extension-events.ts`). */
export type ExtensionEventName = Extract<EventName<Events>, `extension.${string}`>

/** What `parity.sync` and `parity.agents` record (`packages/telemetry/src/sync-events.ts`). */
export type WindowSeamEventName = Extract<EventName<Events>, `sync.${string}` | `agents.${string}`>

/** What one of `parity.sync`'s or `parity.agents`'s events says. */
export type SeamAttributes<Name extends WindowSeamEventName> = EventAttributes<Events, Name>

/** Records one of `parity.sync`'s or `parity.agents`'s events: the window's telemetry, or a test's list. */
export type RecordSeamEvent = <Name extends WindowSeamEventName>(
  name: Name,
  attributes: EventAttributes<Events, Name>
) => void

/** Records one of extensions' lifecycle events: the window's or the service's telemetry, or a test's list. */
export type RecordExtensionEvent = <Name extends ExtensionEventName>(
  name: Name,
  attributes: EventAttributes<Events, Name>
) => void
