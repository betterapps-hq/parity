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

/**
 * Whether to send `extension.halfUnavailable` for an extension now: the first for it in a minute, then one in ten, by
 * the window's or the service's clock.
 */
export function halfUnavailableSampler(now: () => number): (extension: string) => boolean {
  const counted = new Map<string, { since: number; count: number }>()

  return (extension) => {
    const at = now()
    const seen = counted.get(extension)
    const minute = seen && at - seen.since <= 60_000 ? seen : { since: at, count: 0 }
    minute.count += 1
    counted.set(extension, minute)

    return minute.count % 10 === 1
  }
}
