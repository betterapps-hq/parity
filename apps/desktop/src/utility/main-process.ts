import { createChannel } from "@parity-app/channel"
import { codedErrors } from "../shared/coded-errors.ts"
import type { MainMethods, ServiceProcessMethods } from "../shared/service.ts"

/**
 * The project service's channel to the main process, over `process.parentPort`, which the service's entry connects.
 * Main owns the offscreen windows and every window's console, so the service asks it to draw and to read them.
 */
export const mainProcess = createChannel<ServiceProcessMethods, MainMethods>({ errors: codedErrors })
