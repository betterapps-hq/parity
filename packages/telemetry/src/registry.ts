import { appEvents } from "./app-events.ts"
import { dataInvalid, projectUnsupported } from "./check-events.ts"
import { reportSent } from "./diagnostics.ts"
import type { EventDefinition } from "./events.ts"
import { filesEvents } from "./files-events.ts"
import { interfaceEvents } from "./interface-events.ts"
import { agentCalled, builderStarted, commandRan, frameDrawn, gestureRan, requestHandled } from "./trace-events.ts"

/**
 * Every event Parity records, from any process. Each process passes `createTelemetry` the ones it sends, and
 * docs/telemetry.md lists them all. To add one, define it with `defineEvent`, add it here, and regenerate the page with
 * `pnpm exec vp test run packages/telemetry -u`.
 */
export const registeredEvents = [
  commandRan,
  gestureRan,
  requestHandled,
  frameDrawn,
  builderStarted,
  agentCalled,
  ...appEvents,
  ...interfaceEvents,
  ...filesEvents,
  dataInvalid,
  projectUnsupported,
  reportSent
] as const satisfies readonly EventDefinition[]
