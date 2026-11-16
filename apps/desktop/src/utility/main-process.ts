import { createChannel } from "@parity-app/channel"
import { codedErrors } from "../shared/coded-errors.ts"
import type { MainMethods, ServiceProcessMethods } from "../shared/service.ts"
import { currentTraceHeaders, handleInSpan } from "../shared/tracing.ts"

/**
 * The project service's channel to the main process, over `process.parentPort`, which the service's entry connects.
 * Main owns the offscreen windows and every window's console, so the service asks it to draw and to read them. Requests both
 * ways carry the trace they were sent in (PAR-629).
 */
export const mainProcess = createChannel<ServiceProcessMethods, MainMethods>({
  errors: codedErrors,
  trace: currentTraceHeaders,
  around: handleInSpan
})
