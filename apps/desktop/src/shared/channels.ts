/**
 * The names of the main process's IPC channels with a window, in one place for the preload script and main (PAR-565).
 * Everything a window sends main goes over `ask` or `tell`, as a method in `hostMethods` (PAR-965); the rest are what
 * main sends a window. Requests between the window, the project service and main go over ports instead, through
 * `@parity-app/channel`.
 */
export const ipc = {
  /** A window asks main for one of `hostMethods` and waits for its answer. */
  ask: "canvas:ask",
  /** A window tells main one of `hostMethods`' one-way methods. */
  tell: "canvas:tell",
  /** Main gives a page its port to the project service. */
  port: "canvas:port",
  /** Main tells windows the update state changed. */
  updateChanged: "canvas:update-changed",
  /** Main asks a window to show the updates dialog, from the macOS menu. */
  showUpdates: "canvas:show-updates",
  /** Main tells windows what's new in the console log, or that a project's was cleared. */
  consoleChanged: "canvas:console-changed",
  /** Main tells windows the account changed. */
  accountChanged: "canvas:account-changed",
  /** Main asks a window whether it may close. */
  closing: "canvas:closing"
} as const
