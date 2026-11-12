import type { TraceHeaders } from "@parity-app/telemetry"
import { ipcRenderer } from "electron"
import { ipc } from "../shared/channels.ts"
import type { AskedMethod, HostArguments, HostResult, ToldMethod } from "../shared/host-methods.ts"

/**
 * The preload's side of `hostMethods` (PAR-965): every request to main goes through `ask` or `tell`, typed by the map.
 * Only the map's types are imported, since this sandboxed script can't load zod. Main checks who's asking and what was
 * sent; this script and main ship together.
 */

/** The page's trace, which it gives through `traceFrom`; none until it does, or in the render windows. */
let pageTrace: () => TraceHeaders | undefined = () => undefined

/** Takes the page's trace, which each request to main then carries (PAR-810). */
export function traceFrom(current: () => TraceHeaders | undefined): void {
  pageTrace = current
}

/** What a request to main sends after its method: its params, then the page's trace, when it's in one. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- whatever params the request sends, passed on unread
function withTrace(params: unknown): unknown[] {
  const trace = pageTrace()

  if (trace) {
    return [params, trace]
  }

  return params === undefined ? [] : [params]
}

/** Asks main for a method's answer, in the page's trace. Main's handler answers with the result the map names. */
export function ask<M extends AskedMethod>(method: M, ...[params]: HostArguments<M>): Promise<HostResult<M>> {
  // SAFETY: main's handler for `method` is typed by the same `hostMethods` entry, so it answers with `HostResult<M>`,
  // and main and this script ship together.
  return ipcRenderer.invoke(ipc.ask, method, ...withTrace(params)) as Promise<HostResult<M>>
}

/** Tells main a one-way method, in the page's trace, without waiting for an answer. */
export function tell<M extends ToldMethod>(method: M, ...[params]: HostArguments<M>): void {
  ipcRenderer.send(ipc.tell, method, ...withTrace(params))
}

/** Tells main a one-way method outside any trace, as for telemetry, which main records as no span. */
export function tellUntraced<M extends ToldMethod>(method: M, ...[params]: HostArguments<M>): void {
  ipcRenderer.send(ipc.tell, method, params)
}
