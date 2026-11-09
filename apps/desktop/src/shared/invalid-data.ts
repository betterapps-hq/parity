import { type InvalidData, onInvalidData } from "@parity-app/core"
import type { dataInvalid, EventAttributes, registeredEvents, Telemetry } from "@parity-app/telemetry"

/** The most of a failed check's issues and data `data.invalid` carries. */
const issueLimit = 20
const dataLimit = 2000

/** What to record of a failed check as `data.invalid`; secrets are scrubbed from it as it's recorded (PAR-621). */
export function invalidDataAttributes(failure: InvalidData): EventAttributes<[typeof dataInvalid], "data.invalid"> {
  return {
    schema: failure.schema,
    pointer: failure.problem.pointer || "/",
    message: failure.problem.message,
    issues: failure.issues
      .slice(0, issueLimit)
      .map((issue) => `/${issue.path.map(String).join("/")}: ${issue.message}`),
    data: dataText(failure.value)
  }
}

/** Data as JSON, cut short, or as text when it isn't JSON. */
function dataText(value: unknown): string {
  let text: string

  try {
    text = JSON.stringify(value) ?? String(value)
  } catch {
    text = String(value)
  }

  return text.length > dataLimit ? `${text.slice(0, dataLimit)}…` : text
}

/**
 * Records each zod check that fails in this process on data Parity didn't make as `data.invalid` (PAR-633), and
 * returns the telemetry it was given.
 */
export function recordInvalidData(telemetry: Telemetry<typeof registeredEvents>): Telemetry<typeof registeredEvents> {
  onInvalidData((failure) => telemetry.track("data.invalid", invalidDataAttributes(failure)))

  return telemetry
}
