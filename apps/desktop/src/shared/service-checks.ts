import type { Checks } from "@parity-app/channel"
import { CodedError, jsonText, parseInput } from "@parity-app/core"
import { z } from "zod"
import type { ServiceMethods } from "./protocol.ts"
import { renderJob, serviceParams } from "./service-params.ts"

/**
 * The project service's checks on what a window asks of it (PAR-565). The project's own code runs in the window's page,
 * beside `window.canvasHost`, so it can send any method with any params: each request is read here before its handler
 * sees it, and refused with `invalid_input` and the field at fault. Ports between Parity's own processes and threads
 * aren't checked (PAR-578).
 */

/** The jobs `frames.stored` is asked for, as JSON text, which its handler reads with `parseInput`. */
export const storedJobs = jsonText(z.array(renderJob))

/** The frames `frames.changes` is asked about, as JSON text: each frame's id and the job it's drawn with (PAR-997). */
export const changedFrames = jsonText(
  z.array(
    z.object({
      id: z.object({ project: z.string(), design: z.string(), state: z.string(), mode: z.string() }),
      job: renderJob
    })
  )
)

/** Reads each request's params as `serviceParams` says, or throws `CodedError` with `invalid_input`. */
// SAFETY: `ServiceMethods` takes each method's params from its schema in `serviceParams`, which has one for each method.
export const serviceChecks = Object.fromEntries(
  Object.entries(serviceParams).map(([method, schema]) => [
    method,
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: params as the window sent them, parsed here
    (params: unknown) => parseInput(schema, params)
  ])
) as Checks<ServiceMethods>

/** A request for a method the service doesn't have. */
export function unknownServiceMethod(method: string): CodedError {
  return new CodedError(`The project service has no method ${JSON.stringify(method)}`, {
    code: "invalid_input",
    field: "method"
  })
}
