import type { ConsoleEntry } from "@parity-app/agent"
import type { UpdateState } from "@parity-app/core"
import type { TelemetryLevel } from "@parity-app/telemetry"
import type { ProblemReport, ThemeSource } from "../shared/ipc-checks.ts"
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
    /** The open projects' `.env` values the service last sent. */
    secrets(): string[]
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
  /** Opens a web page in the person's browser. */
  openExternal(url: string): Promise<void>
  copiedFiles(): Promise<CopiedFile[]>
  openInEditor(request: OpenInEditorRequest): Promise<{ opened: string }>
  installCli(): Promise<CliInstall>
  quit(): void
  toggleDevTools(window: Window): void
  theme: {
    get(): ThemeSource
    set(theme: ThemeSource): void
    /** Keeps the theme for the next start. May throw, as when the file can't be written. */
    remember(theme: ThemeSource): void
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
  const { account, connectors, telemetry, reports, updates, theme } = needs

  return {
    buildInfo: () => needs.buildInfo(),

    telemetryState: () => telemetry.get(),
    telemetryLevel: (level) => {
      const state = telemetry.setLevel(level)
      telemetry.apply(state)

      return state
    },
    record: (sent, event) => telemetry.record(sent, event),
    telemetrySecrets: () => telemetry.secrets(),

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
    copiedFiles: () => needs.copiedFiles(),
    openInEditor: (request) => needs.openInEditor(request),
    installCli: () => needs.installCli(),

    quit: () => needs.quit(),
    toggleDevTools: (_nothing, window) => needs.toggleDevTools(window),
    setTheme: (next) => {
      if (theme.get() === next) {
        return
      }

      theme.set(next)

      try {
        theme.remember(next)
      } catch (error) {
        console.error("The theme couldn't be remembered", error)
      }
    },
    metrics: (_nothing, window) => needs.metrics(window),

    consoleAnnounce: ({ level, ...context }, window) => needs.console.announce(window, level, context),
    consoleRead: (origin) => needs.console.read(origin),
    consoleClear: (origin) => needs.console.clear(origin),

    closePending: (_nothing, window) => needs.closing(window)?.pending(),
    closeReady: (_nothing, window) => needs.closing(window)?.ready(),
    closeCancel: (_nothing, window) => needs.closing(window)?.cancel()
  }
}
