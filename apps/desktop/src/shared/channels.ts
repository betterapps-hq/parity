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
  /** Main tells a window a route frame in it was stopped leaving its page's origin, and where it tried to go. */
  pageStopped: "canvas:page-stopped",
  /** Main tells windows the account changed. */
  accountChanged: "canvas:account-changed",
  /** Main tells windows what `keybindings.json` holds now (PAR-1085). */
  keybindingsChanged: "canvas:keybindings-changed",
  /** The preload asks main for `settings.json` before the page draws, and waits for the answer. */
  settingsNow: "canvas:settings-now",
  /** Main tells windows the settings changed, in this copy or another. */
  settingsChanged: "canvas:settings-changed",
  /** The preload asks main for `state.json`'s values and `projects.json` before the page draws. */
  stateNow: "canvas:state-now",
  /** Main tells windows the recent or starred projects changed, in this copy or another. */
  projectsChanged: "canvas:projects-changed",
  /** Main asks a window whether it may close. */
  closing: "canvas:closing",
  /** Main tells Settings which page to show, and which setting on it to mark (PAR-1090). */
  settingsOpening: "canvas:settings-opening",
  /** Main tells Settings what the editor window sent of its open project. */
  settingsProject: "canvas:settings-project",
  /** Main tells the editor window a change Settings made to its project, to make an undo step. */
  settingsProjectChange: "canvas:settings-project-change"
} as const
