import { type DegradedFeature, errorCode } from "@parity-app/telemetry"
import { track } from "../shared/tracing.ts"
import type { Attributes } from "./event-attributes.ts"

/**
 * Records that the service stopped doing something and runs on without it (PAR-808): the warning in its log, and a
 * `service.degraded` event a dashboard can count. `what` says what failed, for the log; `root` is the project's folder,
 * when it's one project's.
 */
export function degraded(feature: DegradedFeature, what: string, cause: unknown, root?: string): void {
  const message = cause instanceof Error ? cause.message : String(cause)
  console.warn(`[service] ${what}: ${message}`)

  const attributes: Attributes<"service.degraded"> = { feature, message }
  const code = errorCode(cause)

  if (code) {
    attributes.code = code
  }

  if (root) {
    attributes.root = root
  }

  track("service.degraded", attributes)
}
