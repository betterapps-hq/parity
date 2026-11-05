import { type Channel, createChannel, type Handlers, type Port } from "@parity-app/channel"
import { codedErrors } from "../shared/coded-errors.ts"
import type { ServiceMethods, WindowMethods } from "../shared/protocol.ts"
import { serviceChecks, unknownServiceMethod } from "../shared/service-checks.ts"

/** What a window's requests fail with once its port has closed. */
export const windowClosed = () => new Error("The canvas window closed")

/**
 * The service's channel to one window, over `port`. Project code shares the window's page, so every request's params
 * are checked before a handler sees them, and an unknown method or bad params fail with `invalid_input` (PAR-565,
 * PAR-580). Failures go back with a coded error's details.
 */
export function windowChannel(handlers: Handlers<ServiceMethods>, port: Port): Channel<ServiceMethods, WindowMethods> {
  const channel = createChannel<ServiceMethods, WindowMethods>({
    handlers,
    checks: serviceChecks,
    errors: codedErrors,
    unknownMethod: unknownServiceMethod,
    disconnected: windowClosed
  })
  channel.connect(port)
  return channel
}
