import type { EventDefinition } from "./events.ts"
import { interfaceEvents } from "./interface-events.ts"

/**
 * Every event Parity records, from any process. Each process passes `createTelemetry` the ones it sends, and
 * docs/telemetry.md lists them all. To add one, define it with `defineEvent`, add it here, and regenerate the page with
 * `pnpm exec vp test run packages/telemetry -u`.
 */
export const registeredEvents = [...interfaceEvents] as const satisfies readonly EventDefinition[]
