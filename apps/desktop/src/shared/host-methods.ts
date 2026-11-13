import type { RecentSearch, SearchAnswer } from "@parity-app/connectors"
import type { UpdateState } from "@parity-app/processes"
import { z } from "zod"
import { type AccountState, accountEmail, organizationId, signInRequest } from "./account.ts"
import { type ConnectorState, connectorPlaced, connectorSearch } from "./connectors.ts"
import {
  betaSetting,
  consoleAnnouncement,
  consoleOrigin,
  folderPickerTitle,
  openInEditorRequest,
  problemReport,
  saveDialogOptions,
  shownItem,
  telemetrySetting,
  themeSource
} from "./ipc-checks.ts"
import type {
  BuildInfo,
  CliInstall,
  CopiedFile,
  LoggedEntry,
  ProcessUsage,
  ReportCrash,
  TelemetryState
} from "./protocol.ts"

/**
 * What a window asks the main process over IPC, in one map (PAR-965): each method's name, the schema its params are
 * checked with, what it answers, and who may ask. The preload script's bridge and main's registration are both typed
 * from it, so a method is declared here once. Requests to the project service go over ports instead, through
 * `@parity-app/channel`.
 *
 * Only main loads this module: the sandboxed preload script can't load zod, so it imports the types alone, and main
 * does every check. The project's own code runs in the window's page beside `window.canvasHost`, so it can send any
 * method with anything.
 */

declare const answered: unique symbol

/** The type of a method's answer. Main's answers are its own, so nothing reads this at run time. */
interface Answers<Result> {
  readonly [answered]?: Result
}

function answers<Result>(): Answers<Result> {
  return {}
}

/** One of main's methods, as the map declares it. */
interface HostMethodSpec {
  /** Checks what the window sends, before the handler sees it. A method without one takes nothing. */
  params?: z.ZodType
  /** What main answers. A method without one answers nothing. */
  result?: Answers<unknown>
  /** The window doesn't wait for an answer, and one that's refused is dropped without a word. */
  oneWay?: true
  /**
   * Who may ask. Without this, only the Parity window's own page: its main frame, at Parity's address, never a guest
   * or an offscreen render window. `"any"` takes the method from every sender, for what the render windows' pages send
   * too, and its handler gets the sender rather than a window.
   */
  from?: "any"
}

export const hostMethods = {
  buildInfo: { result: answers<BuildInfo>() },

  /** The Telemetry setting and install ID, which main keeps (PAR-626). */
  telemetryState: { result: answers<TelemetryState>() },
  telemetryLevel: { params: telemetrySetting, result: answers<TelemetryState>() },
  /**
   * An event or span a window or render window recorded, for the local copy and Sentry (PAR-627). Main reads it, since
   * it's sent as data.
   */
  record: { params: z.unknown(), oneWay: true, from: "any" },
  /** The open projects' `.env` values to scrub from telemetry, which render windows scrub with too (PAR-672). */
  telemetrySecrets: { result: answers<string[]>(), from: "any" },

  /** Help > Report a problem: the window's screenshot, as a PNG data URL, then the report, for its feedback ID (PAR-635). */
  reportPrepare: { result: answers<{ screenshot?: string }>() },
  reportSend: { params: problemReport, result: answers<string>() },
  /** The last run's crash, once, if it crashed. */
  reportLastCrash: { result: answers<ReportCrash | undefined>() },

  updateState: { result: answers<UpdateState>() },
  updateCheck: {},
  updateBeta: { params: betaSetting },
  /** Opens the release's page for an update to install by hand, or restarts into one that's ready. */
  updateAct: {},

  /** Who's signed in and how far a sign-in has got (PAR-612). */
  accountState: { result: answers<AccountState>() },
  accountSignIn: { params: signInRequest },
  accountReopen: {},
  accountCancel: {},
  /** Signs out of one account, by its email, or forgets one whose session ended. */
  accountSignOut: { params: accountEmail },
  /** Moves the session to another organization, with a refresh. */
  accountSwitch: { params: organizationId },
  /** Switches to another account signed in, by its email (PAR-669). */
  accountUse: { params: accountEmail },

  /** The connectors and whether this copy can search each one, never a key (PAR-829). */
  connectorsState: { result: answers<ConnectorState[]>() },
  /** Searches a connector, which main does with its key. */
  connectorsSearch: { params: connectorSearch, result: answers<SearchAnswer>() },
  connectorsRecent: { result: answers<RecentSearch[]>() },
  /** The person placed a result in a design, which main records and tells the source of. */
  connectorsPlaced: { params: connectorPlaced },

  /** A folder from the system's picker, under the title given, or to open a project. */
  pickFolder: { params: folderPickerTitle, result: answers<string | undefined>() },
  pickProjectFile: { result: answers<string | undefined>() },
  saveDialog: { params: saveDialogOptions, result: answers<string | undefined>() },
  showItem: { params: shownItem },
  /** The file copied in Explorer or Finder, which the window's own clipboard can't read (PAR-841). */
  copiedFiles: { result: answers<CopiedFile[]>() },
  openInEditor: { params: openInEditorRequest, result: answers<{ opened: string }>() },
  /** Help > Install the Parity CLI (PAR-906). */
  installCli: { result: answers<CliInstall>() },

  quit: {},
  toggleDevTools: {},
  setTheme: { params: themeSource },
  metrics: { result: answers<ProcessUsage[]>() },

  /** Which frame the window's next console message comes from (PAR-147). One that isn't an announcement is ignored. */
  consoleAnnounce: { params: consoleAnnouncement, oneWay: true },
  consoleRead: { params: consoleOrigin, result: answers<LoggedEntry[]>() },
  consoleClear: { params: consoleOrigin },

  /** Asked whether it may close, the window says at once that it's deciding, then that it's ready or staying open. */
  closePending: { oneWay: true },
  closeReady: { oneWay: true },
  closeCancel: { oneWay: true }
} satisfies Record<string, HostMethodSpec>

type Specs = typeof hostMethods

export type HostMethod = keyof Specs

type ParamsSchema<M extends HostMethod> = Specs[M] extends { params: infer Schema extends z.ZodType }
  ? Schema
  : z.ZodUndefined

/** What a window sends with a method. */
export type HostSent<M extends HostMethod> = z.input<ParamsSchema<M>>

/** A method's params once main has checked them, as its handler gets them. */
export type HostParams<M extends HostMethod> = z.output<ParamsSchema<M>>

export type HostResult<M extends HostMethod> = Specs[M] extends { result: Answers<infer Result> } ? Result : undefined

/** A method a window is told nothing back about. */
export type ToldMethod = { [M in HostMethod]: Specs[M] extends { oneWay: true } ? M : never }[HostMethod]

/** A method a window asks and waits on. */
export type AskedMethod = Exclude<HostMethod, ToldMethod>

/** A method every sender may use, the render windows' pages among them. */
export type OpenMethod = { [M in HostMethod]: Specs[M] extends { from: "any" } ? M : never }[HostMethod]

/** What the bridge's `ask` and `tell` take after the method: its params, which a method that takes none leaves out. */
export type HostArguments<M extends HostMethod> =
  undefined extends HostSent<M> ? [params?: HostSent<M>] : [params: HostSent<M>]

const nothing = z.undefined()
const methodName = z.string()

/** A method as main's registration reads it. */
export interface HostMethodRead {
  method: HostMethod
  params: z.ZodType
  oneWay: boolean
  /** Whether every sender may use it. */
  open: boolean
}

/** The method a window named, or nothing when main has none by that name. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: a method's name as a window sent it, read here
export function hostMethod(name: unknown): HostMethodRead | undefined {
  const read = methodName.safeParse(name)

  if (!read.success || !Object.hasOwn(hostMethods, read.data)) {
    return undefined
  }

  // SAFETY: the name is one of `hostMethods`' own keys, checked above.
  const method = read.data as HostMethod
  const spec: HostMethodSpec = hostMethods[method]

  return { method, params: spec.params ?? nothing, oneWay: spec.oneWay === true, open: spec.from === "any" }
}

/** Every method's name, for a test of what each one lets in. */
// SAFETY: `hostMethods` has no keys but its methods.
export const hostMethodNames = Object.keys(hostMethods) as HostMethod[]
