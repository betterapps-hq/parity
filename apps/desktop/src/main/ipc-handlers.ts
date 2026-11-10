import { ipcMain } from "electron"
import { ipc } from "../shared/channels.ts"
import { handlerInSpan } from "../shared/tracing.ts"

/** One of main's IPC channels with a window, by its name in `ipc`, which is the method its spans record. */
type Channel = keyof typeof ipc

/** Answers a window's requests on `channel`, each in a `request.handled` span in the window's trace (PAR-810). */
export function handle<Result>(
  channel: Channel,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what a window sent, which the handler checks
  handler: (event: Electron.IpcMainInvokeEvent, argument: unknown) => Result | Promise<Result>
): void {
  ipcMain.handle(ipc[channel], handlerInSpan(channel, handler))
}

/**
 * Hears what a window sends on `channel`, each in a `request.handled` span in the window's trace. Nothing answers, so a
 * failure is only on the span and reported as an unhandled rejection.
 */
export function listen(
  channel: Channel,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what a window sent, which the handler checks
  handler: (event: Electron.IpcMainEvent, argument: unknown) => void
): void {
  const spanned = handlerInSpan(channel, handler)
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what a window sent over IPC
  ipcMain.on(ipc[channel], (event, argument: unknown, trace: unknown) => void spanned(event, argument, trace))
}
