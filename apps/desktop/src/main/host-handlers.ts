import type { ConsoleEntry } from "@parity-app/agent"
import type { UpdateState } from "@parity-app/processes"
import type {
  ExtensionSettingsChange,
  JsonValue,
  KeybindingsState,
  Projects,
  ProjectsChange,
  Replacement,
  SavedTabs,
  SettingsChange,
  StateKey
} from "@parity-app/settings"
import type { TelemetryLevel } from "@parity-app/telemetry"
import type { ProblemReport } from "../shared/ipc-checks.ts"
import type {
  BuildInfo,
  CliInstall,
  ConsoleContext,
  CopiedFile,
  LoggedEntry,
  OpenInEditorRequest,
  ProcessUsage,
  ReportCrash,
  SaveDialogOptions,
  TelemetryState
} from "../shared/protocol.ts"
import type { SettingsOpening, SettingsProject, SettingsProjectChange } from "../shared/settings-view.ts"
import type { SettingsState } from "../shared/settings.ts"
import type { Account } from "./account.ts"
import type { ConnectorHub } from "./connectors.ts"
import type { HostHandlers } from "./host-methods.ts"

/** A file or folder picker's settings, as the handlers ask for one. */
export interface PickerOptions {
  title: string
  properties: ("openFile" | "openDirectory" | "createDirectory")[]
  filters?: { name: string; extensions: string[] }[]
}

/** How a window's close replies reach the close it's deciding on. */
export interface CloseReplies {
  pending(): void
  ready(): void
  cancel(): void
}

/**
 * What the handlers need of the app, passed in so they run in tests without Electron. `Window` is the Parity window a
 * request came from, and `Event` the sender of one any page may send.
 */
export interface HostNeeds<Event, Window> {
  account: Pick<Account, "state" | "signIn" | "reopen" | "cancel" | "signOut" | "switchOrganization" | "use">
  connectors: Pick<ConnectorHub, "states" | "search" | "recent" | "result" | "placed">
  buildInfo(): Promise<BuildInfo>
  telemetry: {
    get(): TelemetryState
    setLevel(level: TelemetryLevel): TelemetryState
    /** Starts or stops sending, as the setting now says. */
    apply(state: TelemetryState): void
    /** Keeps an event or span a page recorded, named by the window that sent it. */
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: an envelope as a page sent it, which main's telemetry parses
    record(sent: unknown, event: Event): void
  }
  reports: {
    prepare(window: Window): Promise<{ screenshot?: string }>
    send(window: Window, report: ProblemReport): Promise<string>
    takeLastCrash(): ReportCrash | undefined
  }
  updates: {
    /** Nothing until the app is ready, or where this copy doesn't update itself. */
    state(): UpdateState | undefined
    check(): Promise<void>
    setBeta(beta: boolean): void
    /** Closes `window` to restart into the update that's ready. */
    restart(window: Window): void
  }
  /** The system's file or folder picker over `window`: the path chosen, or nothing when it's cancelled. */
  pickPath(window: Window, options: PickerOptions): Promise<string | undefined>
  savePath(window: Window, options: SaveDialogOptions): Promise<string | undefined>
  showItem(path: string): void
  /** Another host's stylesheet, for a frozen copy, or nothing (`fetchPageSheet`). */
  pageSheet(href: string): Promise<string | null>
  /** Opens a web page in the person's browser. */
  openExternal(url: string): Promise<void>
  copiedFiles(): Promise<CopiedFile[]>
  openInEditor(request: OpenInEditorRequest): Promise<{ opened: string }>
  installCli(): Promise<CliInstall>
  quit(): void
  toggleDevTools(window: Window): void
  /** `settings.json`, which main keeps for every window and copy. */
  settings: {
    change(change: SettingsChange & { extensions?: ExtensionSettingsChange }): Promise<SettingsState>
  }
  /** `projects.json`, the recent and starred projects every copy shares. */
  projects: {
    change(change: ProjectsChange): Promise<Projects>
  }
  /** `state.json`, what the app remembers for itself: the layout, recent searches and each window's tabs. */
  state: {
    set(key: StateKey, value: JsonValue): void
    claimTabs(window: Window): Promise<SavedTabs>
    saveTabs(window: Window, tabs: SavedTabs): void
  }
  /** Settings, its own web contents over `window`, which loads no project code (PAR-1090). */
  settingsView: {
    open(window: Window, opening: SettingsOpening): void
    close(window: Window): void
    /** What Settings shows of the window's open project. */
    project(window: Window, project: SettingsProject): void
    /** A change Settings made to the window's open project, for the window to make an undo step. */
    changeProject(window: Window, change: SettingsProjectChange): void
  }
  /** Opens a page in a window of Parity's own. */
  openInParity(url: string): void
  /** `keybindings.json`, which main keeps for every window (PAR-1085). */
  keybindings: {
    state(): KeybindingsState
    replace(replacements: Replacement[]): Promise<KeybindingsState>
    /** Opens the file, making it first when there's none. */
    open(): Promise<void>
  }
  metrics(window: Window): Promise<ProcessUsage[]>
  console: {
    /** Says which frame `window`'s next message at `level` comes from. */
    announce(window: Window, level: ConsoleEntry["level"], context: ConsoleContext): void
    read(origin: string): LoggedEntry[]
    clear(origin: string): void
  }
  /** The close `window` is deciding on, or nothing once it's gone. */
  closing(window: Window): CloseReplies | undefined
}

/**
 * Main's answers to what a window asks (PAR-965), each a plain function of its checked params and the window that
 * asked. Who may ask and what they may send is `answerWindows`' to check, so nothing here does.
 */
export function hostHandlers<Event, Window>(needs: HostNeeds<Event, Window>): HostHandlers<Event, Window> {
  const { account, connectors, telemetry, reports, updates } = needs

  return {
    buildInfo: () => needs.buildInfo(),

    telemetryState: () => telemetry.get(),
    telemetryLevel: (level) => {
      const state = telemetry.setLevel(level)
      telemetry.apply(state)

      return state
    },
    record: (sent, event) => telemetry.record(sent, event),

    reportPrepare: (_nothing, window) => reports.prepare(window),
    reportSend: (report, window) => reports.send(window, report),
    reportLastCrash: () => reports.takeLastCrash(),

    updateState: () => updates.state() ?? { phase: "disabled", beta: false },
    updateCheck: () => updates.check(),
    updateBeta: (beta) => updates.setBeta(beta),
    updateAct: async (_nothing, window) => {
      const state = updates.state()

      if (state?.phase === "manual") {
        await needs.openExternal(
          `https://github.com/betterapps-hq/parity/releases/tag/v${encodeURIComponent(state.version)}`
        )
      } else if (state?.phase === "ready") {
        updates.restart(window)
      }
    },

    accountState: () => account.state(),
    accountSignIn: (request) => account.signIn(request),
    accountReopen: () => account.reopen(),
    accountCancel: () => account.cancel(),
    accountSignOut: (email) => account.signOut(email),
    accountSwitch: (id) => account.switchOrganization(id),
    accountUse: (email) => account.use(email),

    connectorsState: () => connectors.states(),
    connectorsSearch: ({ connector, request }) => connectors.search(connector, request, "window"),
    connectorsRecent: () => connectors.recent(),
    connectorsPlaced: ({ connector, id, ...where }) => {
      const placed = connectors.result(connector, id)

      // Reporting a placement is the source's count, not something the person waits on.
      if (placed) {
        void connectors.placed(placed, { ...where, from: "window" })
      }
    },

    pickFolder: (title, window) =>
      needs.pickPath(window, { title: title ?? "Open project", properties: ["openDirectory", "createDirectory"] }),
    pickProjectFile: (_nothing, window) =>
      needs.pickPath(window, {
        title: "Open project file",
        properties: ["openFile"],
        filters: [{ name: "Parity project", extensions: ["par"] }]
      }),
    saveDialog: (settings, window) => needs.savePath(window, settings),
    showItem: (path) => needs.showItem(path),
    pageSheet: (href) => needs.pageSheet(href),
    copiedFiles: () => needs.copiedFiles(),
    openInEditor: (request) => needs.openInEditor(request),
    installCli: () => needs.installCli(),

    quit: () => needs.quit(),
    toggleDevTools: (_nothing, window) => needs.toggleDevTools(window),
    settingsChange: (change) => needs.settings.change(change),
    projectsChange: (change) => needs.projects.change(change),
    stateSet: ({ key, value }) => needs.state.set(key, value),
    tabsClaim: (_nothing, window) => needs.state.claimTabs(window),
    tabsSave: ({ roots, active }, window) =>
      needs.state.saveTabs(window, active === undefined ? { roots } : { roots, active }),
    extensionSettingsChange: (extensions) => needs.settings.change({ extensions }),
    settingsOpen: (opening, window) => needs.settingsView.open(window, opening),
    settingsProject: (project, window) => needs.settingsView.project(window, project),
    settingsProjectChange: (change, window) => needs.settingsView.changeProject(window, change),
    settingsClose: (_nothing, window) => needs.settingsView.close(window),
    openInParity: (url) => needs.openInParity(url),
    keybindingsState: () => needs.keybindings.state(),
    keybindingsReplace: (replacements) => needs.keybindings.replace(replacements),
    keybindingsOpen: () => needs.keybindings.open(),
    metrics: (_nothing, window) => needs.metrics(window),

    consoleAnnounce: ({ level, ...context }, window) => needs.console.announce(window, level, context),
    consoleRead: (origin) => needs.console.read(origin),
    consoleClear: (origin) => needs.console.clear(origin),

    closePending: (_nothing, window) => needs.closing(window)?.pending(),
    closeReady: (_nothing, window) => needs.closing(window)?.ready(),
    closeCancel: (_nothing, window) => needs.closing(window)?.cancel()
  }
}
