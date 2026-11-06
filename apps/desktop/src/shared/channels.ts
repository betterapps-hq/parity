/**
 * The names of the main process's IPC channels with a window, in one place for the preload script and main (PAR-565).
 * Requests between the window, the project service and main go over ports instead, through `@parity-app/channel`.
 */
export const ipc = {
  /** Main gives a page its port to the project service. */
  port: "canvas:port",
  buildInfo: "canvas:build-info",
  updateState: "canvas:update-state",
  updateCheck: "canvas:update-check",
  updateBeta: "canvas:update-beta",
  updateAct: "canvas:update-act",
  /** Main tells windows the update state changed. */
  updateChanged: "canvas:update-changed",
  /** Main asks a window to show the updates dialog, from the macOS menu. */
  showUpdates: "canvas:show-updates",
  pickFolder: "canvas:pick-folder",
  pickProjectFile: "canvas:pick-project-file",
  saveDialog: "canvas:save-dialog",
  showItem: "canvas:show-item",
  openInEditor: "canvas:open-in-editor",
  quit: "canvas:quit",
  toggleDevTools: "canvas:toggle-dev-tools",
  setTheme: "canvas:set-theme",
  metrics: "canvas:metrics",
  /** The window says which frame its next console message comes from (PAR-147). */
  consoleAnnounce: "canvas:console-announce",
  consoleRead: "canvas:console-read",
  consoleClear: "canvas:console-clear",
  /** Main tells windows what's new in the console log, or that a project's was cleared. */
  consoleChanged: "canvas:console-changed",
  /** Who's signed in and how far a sign-in has got, from main (PAR-612). */
  accountState: "canvas:account-state",
  /** Main tells windows the account changed. */
  accountChanged: "canvas:account-changed",
  accountSignIn: "canvas:account-sign-in",
  accountReopen: "canvas:account-reopen",
  accountCancel: "canvas:account-cancel",
  accountSignOut: "canvas:account-sign-out",
  /** Main asks a window whether it may close. */
  closing: "canvas:closing",
  /** The window answers at once that it's deciding, then that it's ready to close or wants to stay open. */
  closePending: "canvas:close-pending",
  closeReady: "canvas:close-ready",
  closeCancel: "canvas:close-cancel"
} as const
