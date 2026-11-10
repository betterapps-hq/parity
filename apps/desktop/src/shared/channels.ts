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
  /** The Telemetry setting and install ID, which main keeps (PAR-626). */
  telemetryState: "canvas:telemetry-state",
  telemetryLevel: "canvas:telemetry-level",
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
  /** The window asks main to sign out of one account, by its email, or forget one whose session ended. */
  accountSignOut: "canvas:account-sign-out",
  /** The window asks main to move the session to another organization, with a refresh. */
  accountSwitch: "canvas:account-switch",
  /** The window asks main to switch to another account signed in, by its email (PAR-669). */
  accountUse: "canvas:account-use",
  /** Main asks a window whether it may close. */
  closing: "canvas:closing",
  /** The window answers at once that it's deciding, then that it's ready to close or wants to stay open. */
  closePending: "canvas:close-pending",
  closeReady: "canvas:close-ready",
  closeCancel: "canvas:close-cancel",
  /** A window or render window sends main an event or span it recorded, for the local copy and Sentry (PAR-627). */
  telemetry: "canvas:telemetry",
  /** The open projects' `.env` values to scrub from telemetry, which a window asks main for and hears of changes to. */
  telemetrySecrets: "canvas:telemetry-secrets",
  telemetrySecretsChanged: "canvas:telemetry-secrets-changed",
  /** Help > Report a problem: the window asks for what goes with a report, then sends it (PAR-635). */
  reportPrepare: "canvas:report-prepare",
  reportSend: "canvas:report-send",
  /** The window asks once, as it starts, whether the last run crashed. */
  reportLastCrash: "canvas:report-last-crash",
  /** The connectors and where each one's key comes from, never the key (PAR-829). */
  connectorsState: "canvas:connectors-state",
  /** Main tells windows a connector's key was set or cleared. */
  connectorsChanged: "canvas:connectors-changed",
  /** The window asks main to search a connector, which main does with its key. */
  connectorsSearch: "canvas:connectors-search",
  /** The window gives main a key the person typed, which main checks before keeping. */
  connectorsSetKey: "canvas:connectors-set-key",
  connectorsClearKey: "canvas:connectors-clear-key"
} as const
