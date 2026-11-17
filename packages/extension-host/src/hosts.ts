import { type Channel, createChannel, type Port } from "@parity-app/channel"
import { packageExport, type PageRouterRef, type RouteMark } from "@parity-app/core"
import type {
  Candidate,
  CommandTarget,
  Contributions,
  DesignOperation,
  Fact,
  FileEdit,
  FindQuery,
  FrameDecorator,
  JsonValue,
  NodeRef,
  PathIcon,
  Permissions,
  ProcessEnd,
  ProcessInfo,
  ProcessSpec,
  ProviderKinds,
  ServerFacts,
  SettingValue,
  ViewData,
  ViewKind
} from "@parity-app/extension"
import type { Capability } from "@parity-app/extension"
import type { HalfState } from "@parity-app/extension/internal"
import { type ExtensionPackage, fits } from "@parity-app/extension/manifest"
import { type ChildExit, endedByItself, type Lifecycle } from "@parity-app/processes"
import { readToolInput } from "./agents.ts"
import { halfUnavailableSampler, type RecordExtensionEvent } from "./events.ts"
import { editsRefusal, type ReadPlace, readablePath, writeRefusal } from "./permissions.ts"
import {
  type ActivateParams,
  type ProcessSnapshot,
  type Dependency,
  hostChecks,
  type HostMethods,
  type HostServiceMethods,
  type LogLine,
  type ProviderCall,
  type ProviderCalls,
  type ProviderKind,
  readAnswer,
  readReturned,
  type StateValues,
  type StatusValue
} from "./protocol.ts"
import { changedValues, readExtensionSettings, type StoredSettings, storedKey } from "./settings.ts"

/*
 * The project service's side of extensions' hosts. Each extension whose tool is in an open project gets a host of its
 * own for that project, a forked Node process, started when an activation event its manifest names happens and ended
 * when the project closes. A host that crashes is started again, and after a few crashes in a row it's left stopped
 * with the reason. One that doesn't answer a ping in time is named as stuck. Either way only that extension is
 * affected, and the person can restart it. Starting the process is the app's business: it passes `start`, which gives
 * the host's port and lifecycle.
 */

/** Where an extension's host is in its life, for one project. */
export type HostState =
  /** Its tool is in the project, and its code hasn't been needed yet. */
  | "waiting"
  | "starting"
  | "running"
  /** It hasn't answered a ping in time. */
  | "stuck"
  /** It crashed too often in a row, or couldn't activate, and was left stopped. */
  | "crashed"

/** An extension as a window draws it: from its manifest, with its host's state and what its code set. */
export interface ExtensionStatus {
  id: string
  displayName: string
  /** What its ids and setting keys start with, which also keys its settings in settings.json and the `.par`. */
  prefix: string
  icon: PathIcon
  contributes: Contributions
  /** What its manifest says it may read, write, reach and change. */
  permissions: Permissions
  /** The activation events its code starts on. */
  activates: string[]
  version: string
  /** One of Parity's own internal extensions (docs/proposals/extensions-in-the-window.md). */
  internal: boolean
  /** Whether it has a window module, which the window loads into each project tab it's active for. */
  window: boolean
  /** Whether it has a Node half, which runs in a host of its own. An internal extension may have only a window module. */
  node: boolean
  /** What its window module may use beyond the basics. */
  capabilities: Capability[]
  /** The extensions whose APIs it uses, by id. */
  extensionDependencies: string[]
  /** Its settings' values now, by key, from the person's and the project's, each at its default when unset. */
  settings: Record<string, SettingValue>
  state: HostState
  /** Why it's stuck or crashed. */
  reason?: string
  /** Its status items' values, by id: the last ones it set, kept from its last run until it sets them again. */
  status: Record<string, StatusValue>
  /** The context keys it set, by key. */
  context: Record<string, boolean | string[]>
  /** The facts it set, by what they're about: a component's key. */
  facts: Record<string, Fact[]>
  /** What its code put in its tabs, sections and pages, by id. One it hasn't filled shows that it's starting. */
  views: Record<string, ViewData>
  /** Settings whose values didn't fit their schema, and so read as their defaults, one sentence each. */
  settingProblems: string[]
  /** How long its code took to activate the last time it did, in milliseconds. */
  activatedIn?: number
  /** The memory its host's process held at its last ping, in bytes. */
  memory?: number
}

/**
 * An extension Parity has installed, as its manifest describes it, whether or not it runs in any open project: what
 * Settings lists, with no project open as with one.
 */
export type InstalledStatus = Pick<
  ExtensionStatus,
  "id" | "displayName" | "prefix" | "icon" | "contributes" | "permissions" | "activates"
>

/** An installed extension's package as Settings lists it, from its manifest. */
export function installedStatus(found: ExtensionPackage): InstalledStatus {
  const { manifest } = found

  return {
    id: found.id,
    displayName: manifest.displayName,
    prefix: manifest.prefix,
    icon: manifest.icon,
    contributes: manifest.contributes,
    permissions: manifest.permissions ?? {},
    activates: manifest.activates
  }
}

/** An extension Parity can run: its package, its code's entry module, and how it detects its tool. */
export interface InstalledExtension<Project> {
  package: ExtensionPackage
  /** Its Node half's entry module, as an absolute path. None for an internal extension with only a window module. */
  main?: string
  /** What it found of its tool in the project, as `parity.project.detected` gives it, or nothing when it isn't there. */
  detect(project: Project): { detected?: JsonValue } | undefined
}

/** The project service's link to a host's process: the channel's port, and the process's lifecycle. */
export interface HostLink {
  port: Port
  life: Pick<Lifecycle, "exited" | "stop" | "deadline">
}

/** Where extensions' values are kept between runs: `app` and `project` for `parity.state`, and status items' values. */
export interface ExtensionStateStore {
  read(extension: string, root: string): StateValues & { status: Record<string, StatusValue> }
  write(extension: string, root: string, scope: "app" | "project" | "status", key: string, value?: JsonValue): void
}

/** The methods of `parity.ui`, which a window answers. */
export type UiMethod = "ui.notify" | "ui.pick" | "ui.input" | "ui.confirm" | "ui.open" | "ui.progress"

/** What `parity.selection`, `parity.navigate` and `parity.commands.execute` ask of the window (PAR-1092). */
export type EditorMethod = "selection.set" | "selection.highlight" | "navigate" | "commands.execute"

/** Everything hosts ask of the window that has a project open. */
export type WindowAsk = UiMethod | EditorMethod

/** What hosts tell the window that has a project open, and ask of the person through it. */
export interface ExtensionWindow {
  /**
   * Sets one of an extension's `project` settings in the project's main `.par`, as one undo step in its window, or puts
   * it back to its default without `value`. The window then sends the project's settings again.
   */
  updateSetting(projectId: string, extension: string, key: string, value?: SettingValue): Promise<void>
  /** A project's extensions changed: one started, crashed or set a status item or context key. */
  changed(projectId: string, extensions: ExtensionStatus[]): void
  logged(projectId: string, extension: string, line: LogLine): void
  ui<M extends WindowAsk>(
    projectId: string,
    extension: string,
    method: M,
    params: HostServiceMethods[M]["params"]
  ): Promise<HostServiceMethods[M]["result"]>
  /** Opens the tab or page that holds one of an extension's views. */
  reveal(projectId: string, extension: string, view: string): void
  /**
   * Calls a function of what an internal extension's window module returned as `node`, in the project's tab, for its
   * Node half. Rejects when the module isn't ready there.
   */
  callWindow?(projectId: string, extension: string, method: string, args: JsonValue[]): Promise<JsonValue | undefined>
  /**
   * Runs a command an internal extension's window module registered, in the project's tab. `handled` is false when no
   * window module there has it, as while it's off.
   */
  runInWindow?(
    projectId: string,
    command: string,
    target?: CommandTarget,
    call?: number
  ): Promise<{ handled: boolean; result?: JsonValue }>
}

/** Which extension asks the process manager for something, for which project, and what its manifest allows it. */
export interface ProcessCaller {
  projectId: string
  extension: string
  /** Its manifest's `permissions.processes`, and whether it may `observe` others' output. */
  permissions: { processes: string[]; observe: boolean }
  /** Its code's entry module, which a `node` run's path is inside the folder of. */
  main: string
}

/** What a host hears of the project's processes while it runs. */
export interface ProcessListener {
  /** The project's processes changed: all of them, as the extension may see them. */
  changed(processes: ProcessInfo[]): void
  /** One of its own processes printed lines. */
  lines(id: string, lines: string[], run: number): void
  /** One of its own processes' runs ended. */
  ended(id: string, end: ProcessEnd): void
}

/**
 * The project service's process manager, as `parity.processes` uses it. Ids are the extension's own, as its spec names
 * them; what it may see of others' processes is decided here.
 */
export interface ExtensionProcesses {
  start(caller: ProcessCaller, spec: ProcessSpec): Promise<ProcessInfo>
  adopt(caller: ProcessCaller, server: HostServiceMethods["processes.adopt"]["params"]): ProcessInfo
  find(caller: ProcessCaller, query: FindQuery): Promise<Candidate[]>
  stop(caller: ProcessCaller, id: string): Promise<void>
  restart(caller: ProcessCaller, id: string): Promise<ProcessInfo>
  ready(caller: ProcessCaller, id: string): Promise<ProcessInfo>
  ended(caller: ProcessCaller, id: string): Promise<ProcessEnd>
  report(caller: ProcessCaller, id: string, progress: { detail?: string; done?: number; total?: number }): void
  summarize(caller: ProcessCaller, id: string, summary: string): void
  markReady(caller: ProcessCaller, id: string, match: string): void
  /** The project's processes as the caller may see them, and what its own printed lately, by id. */
  snapshot(caller: ProcessCaller): ProcessSnapshot
  /** Tells `listener` of the project's processes until the function it returns is called. */
  watch(caller: ProcessCaller, listener: ProcessListener): () => void
  /** A host started again after it stopped, and gets back the processes it owns. */
  reattached(caller: ProcessCaller, hostStopped: "crash" | "stuck" | "reload"): void
  /** Stops every process an extension started, as the project closes. */
  stopAll(projectId: string, extension: string): void
}

/** The kinds of provider the processes list asks, as servers appear and as `find` is called. */
export type ProcessProviderKind = Extract<ProviderKind, "addresses" | "discovery">

/**
 * How the service asks a process provider in an extension's host. What it answers is typed as the extension promises,
 * and the service checks it before taking any of it.
 */
export interface ProviderAsk {
  addresses(servers: ServerFacts[]): ReturnType<ProviderKinds["addresses"]["addresses"]>
  discover(project: { root: string }): ReturnType<ProviderKinds["discovery"]["discover"]>
}

/** A process provider an extension registered: its kind, and how long its answers stay good. */
export interface RegisteredProvider {
  kind: ProcessProviderKind
  maxAgeMs?: number
}

/** The service's registry of the process providers extensions register, by project, extension and kind. */
export interface ExtensionProviders {
  register(caller: ProcessCaller, provider: RegisteredProvider, ask: ProviderAsk): void
  changed(caller: ProcessCaller, kind: ProcessProviderKind): void
  dispose(caller: ProcessCaller, kind: ProcessProviderKind): void
  /** Takes away every provider an extension registered, as its host stops. */
  disposeAll(projectId: string, extension: string): void
}

/** Reading, listing and watching files, once the extension's `read` permission has allowed the path. */
export interface ExtensionFiles {
  /** Where read paths are worked out, besides the project's folder. */
  place: Omit<ReadPlace, "root">
  read(path: string): Promise<string>
  /** What a folder holds: each name in it, marked when it's a folder. */
  list(path: string): Promise<{ name: string; folder: boolean }[]>
  /** Calls `listener` when the file is created, changes or goes, until the function it returns is called. */
  watch(path: string, listener: () => void): () => void
}

/**
 * Where extensions' changes go once their permissions are checked: designs to the window that has the project open,
 * and files to the project service's one queued write. `label` names the extension, as "Tidy: Rename layers".
 */
export interface ExtensionEdits {
  /** Applies design operations as one undo step, waiting for a window. Rejects, changing nothing, when one can't apply. */
  transact(projectId: string, extension: string, label: string, operations: DesignOperation[]): Promise<void>
  /** Writes files together, shown with Undo. Answers with the paths it changed. */
  files(projectId: string, extension: string, label: string, files: FileEdit[]): Promise<string[]>
}

/** How long hosts get, in milliseconds, and how many crashes in a row leave one stopped. */
export interface HostTiming {
  /** How often a running host is pinged. */
  pingEvery: number
  /** How long a ping waits before the host counts as stuck. */
  pingTimeout: number
  /** How long `activate` may take. */
  activateTimeout: number
  /** How long a host gets to stop by itself before it's ended. */
  stopTimeout: number
  /** Crashes within this long of each other count as in a row. */
  crashWindow: number
  /** How many crashes in a row leave a host stopped. */
  crashLimit: number
}

const defaultTiming: HostTiming = {
  pingEvery: 5000,
  pingTimeout: 10_000,
  activateTimeout: 30_000,
  stopTimeout: 2000,
  crashWindow: 60_000,
  crashLimit: 3
}

/** How many lines of an extension's log are kept, for each project; the oldest go first. */
export const keptLines = 500

export interface ExtensionHostsOptions<Project extends OpenedProject> {
  extensions: InstalledExtension<Project>[]
  /** Starts a host's process. */
  start(extension: InstalledExtension<Project>, project: Project): HostLink
  state: ExtensionStateStore
  window: ExtensionWindow
  processes: ExtensionProcesses
  providers: ExtensionProviders
  files: ExtensionFiles
  edits: ExtensionEdits
  timing?: Partial<HostTiming>
  /** Records Node halves' lifecycle events: activating, failing to, crashing and stopping. */
  record?: RecordExtensionEvent
}

/** What hosts need of an open project. */
export interface OpenedProject {
  id: string
  root: string
  name: string
}

/** Every open project's extensions and their hosts. */
export interface ExtensionHosts<Project extends OpenedProject> {
  /**
   * Finds the project's extensions, and starts those that activate when they're detected, with the project's settings
   * for them from its main `.par`. Opening it again, once more is known of it, finds those that weren't found before:
   * a project is opened as soon as its package is read, for its providers, and again once it has opened.
   */
  open(project: Project, settings?: StoredSettings): void
  /** Ends the project's hosts. */
  close(projectId: string): Promise<void>
  /** Runs a command, starting its extension's host first when it isn't running. */
  /**
   * Runs a command, starting its extension's host first when it isn't running. `call` is the agent's call a window
   * command it was run from is running on, which it goes on with.
   */
  run(projectId: string, command: string, target?: CommandTarget, call?: number): Promise<void>
  /**
   * Runs an extension's command or agent tool for an agent, by the command's id or the tool's name, starting its host
   * first when it isn't running, and gives back what it returned. A tool's input is checked against its schema. While
   * it runs, the extension's changes are named after `agent` and the extension, and it can't ask the person anything.
   */
  runForAgent(projectId: string, request: AgentRun, agent: string): Promise<JsonValue | undefined>
  /**
   * Calls the provider of `kind` an extension of the project's declares, starting its host first when it isn't
   * running, and reads its answer. Nothing when none of the project's extensions declares one. With `extension`, a
   * prefix, only that extension's provider is asked: a project can have several builders' extensions running, as
   * Vite's beside Next's, and only one of them serves it.
   */
  provide<C extends ProviderCall>(
    projectId: string,
    call: C,
    extension?: string
  ): Promise<ProviderResult<C> | undefined>
  /**
   * The extension of the project's that declares a provider of `kind`, or with `extension`, that one if it does: its
   * prefix and name, and for a styling framework, the cascade layer its manifest says its classes go in; or nothing.
   */
  provider(
    projectId: string,
    kind: ProviderKind,
    extension?: string
  ): { id: string; name: string; layer?: string } | undefined
  /**
   * What the project's extensions put around every frame, from their manifests, so it's known before their code runs:
   * each router's decorators, with its prefix, in the order the extensions were given.
   */
  decorators(projectId: string): { extension: string; decorator: FrameDecorator }[]
  /**
   * The page modules of the project's routers, from their manifests (PAR-1260): each router's, with its prefix and its
   * module by the specifier Parity resolves, in the order the extensions were given, and the packages each wraps.
   */
  pageRouters(projectId: string): PageRouterRef[]
  /** A tab or page opened, which starts an extension that activates on it. */
  viewOpened(projectId: string, view: string): void
  /** The person changed a field of an extension's form. */
  viewChanged(projectId: string, extension: string, change: HostMethods["view.changed"]["params"]): Promise<void>
  /** Ends an extension's host and starts it again, as after it crashed or got stuck. */
  restart(projectId: string, extension: string): void
  /** The person cancelled a task under `ui.progress`. */
  cancel(projectId: string, extension: string, progress: number): void
  /** A project's extensions and their logs. */
  list(projectId: string): { extensions: ExtensionStatus[]; logs: Record<string, LogLine[]> }
  /** Every installed extension, from its manifest, in the order they were given. */
  installed(): InstalledStatus[]
  /** What's selected in the window with the project open changed, which every running host is told. */
  selectionChanged(projectId: string, refs: NodeRef[]): void
  /** The person's marks on the project's routes changed, by route id, which every running host is told. */
  routeMarksChanged(projectId: string, marks: Record<string, RouteMark>): void
  /** The person's `app` settings for every extension, from settings.json, as they are now. */
  setAppSettings(settings: StoredSettings): void
  /** A project's settings for its extensions, from its main `.par`'s `extensions` field, saved or not. */
  setProjectSettings(projectId: string, settings: StoredSettings): void
  /**
   * Starts an internal extension's Node half, as its window module activates in the project's tab. Nothing for one
   * running already, or without a Node half.
   */
  startHalf(projectId: string, extension: string, trigger: string): void
  /** Calls a function of what an internal extension's Node half returned from `activate`, for its window module. */
  callHalf(projectId: string, extension: string, method: string, args: JsonValue[]): Promise<JsonValue | undefined>
  /** Where an internal extension's window module is in the project's tab, which its Node half's `parity.window` gives. */
  windowState(projectId: string, extension: string, state: HalfState): void
}

/** What the provider method a call names answers. */
export type ProviderResult<C extends ProviderCall> = C extends { kind: infer K extends ProviderKind; method: infer M }
  ? M extends keyof ProviderCalls[K]
    ? ProviderCalls[K][M] extends { result: infer R }
      ? R
      : never
    : never
  : never

/** What an agent runs: a command, for a component or layer when it names one, or an agent tool, with its input. */
export interface AgentRun {
  name: string
  target?: CommandTarget
  input?: JsonValue
}

interface Host<Project> {
  extension: InstalledExtension<Project>
  /** The names of the functions its `activate` returned, once it has. */
  api?: string[]
  detected?: JsonValue
  state: HostState
  reason?: string
  status: Record<string, StatusValue>
  context: Record<string, boolean | string[]>
  facts: Record<string, Fact[]>
  views: Record<string, ViewData>
  logs: LogLine[]
  /** When it crashed lately, in milliseconds since 1970. */
  crashes: number[]
  /** Its settings as last read, which its running code was last sent. */
  settings: { values: Record<string, SettingValue>; problems: string[] }
  activatedIn?: number
  memory?: number
  running?: Running
  /** When its current run activated, in milliseconds since 1970, for how long it ran. */
  activatedAt?: number
  /** The activation event that started its current run, for `extension.activated`. */
  trigger?: string
  /**
   * An agent's call while its window module runs a command for that agent, so what the window module asks of its Node
   * meanwhile is the agent's too: its edits are named after the agent, and it can't ask the person anything.
   */
  windowCall?: number
  /** Agents' window commands for it, one at a time, so each holds `windowCall` alone while it runs. */
  windowTurn?: Promise<unknown>
}

/** A host's process while it runs. */
interface Running {
  link: HostLink
  channel: Channel<HostServiceMethods, HostMethods>
  activated: Promise<void>
  /** Its `activate` has been sent, so a change of its window module's state is sent to it on its own. */
  activateSent?: boolean
  stopPinging(): void
  /** Stops telling it of the project's processes, ends its watches and takes away its providers. */
  release(): void
}

interface OpenProject<Project> {
  project: Project
  hosts: Map<string, Host<Project>>
  /** What's selected in its window, which hosts start with. */
  selection: NodeRef[]
  /** The person's marks on its routes, by route id, which hosts start with. */
  routeMarks: Record<string, RouteMark>
  /** The project's settings for its extensions, from its main `.par`. */
  settings: StoredSettings
  /** Where each internal extension's window module is in the project's tab, by id, which its Node half is told. */
  windows: Map<string, HalfState>
}

/** Every open project's extensions, each in a host of its own. */
export function extensionHosts<Project extends OpenedProject>(
  options: ExtensionHostsOptions<Project>
): ExtensionHosts<Project> {
  const timing = { ...defaultTiming, ...options.timing }
  /** Agents' calls running now, by the id each was given, which hosts send back with what their code asks. */
  const calls = new Map<number, string>()
  let nextCall = 1

  /** The agent whose call an id names, if it's one running now. Any other id, as one a host made up, names nobody. */
  const agentOf = (call: number | undefined) => (call === undefined ? undefined : calls.get(call))
  const projects = new Map<string, OpenProject<Project>>()
  let appSettings: StoredSettings = {}
  /** Whether a Node half's refused call to its window module is sent, sampled per extension. */
  const unavailableSampled = halfUnavailableSampler(() => Date.now())

  /** An extension's settings, from the person's values and the project's. */
  const settingsOf = (open: OpenProject<Project>, extension: InstalledExtension<Project>) => {
    const { prefix, contributes } = extension.package.manifest

    return readExtensionSettings(prefix, contributes.settings, {
      app: appSettings[prefix],
      project: open.settings[prefix]
    })
  }

  /** Reads each host's settings again, sending its running code the values that changed. */
  const settingsChanged = (open: OpenProject<Project>) => {
    let problems = false

    for (const host of open.hosts.values()) {
      const before = host.settings
      host.settings = settingsOf(open, host.extension)
      problems ||= before.problems.join() !== host.settings.problems.join()
      const values = changedValues(before.values, host.settings.values)
      // A window module reads its settings from what the window is sent, as `onSetting` does.
      problems ||= host.extension.package.manifest.window !== undefined && Object.keys(values).length > 0

      if (host.running && Object.keys(values).length > 0) {
        const { channel, activated } = host.running
        void activated.then(() => channel.request("settings.changed", { values })).catch(() => undefined)
      }
    }

    if (problems) {
      changed(open)
    }
  }

  const statusOf = (host: Host<Project>): ExtensionStatus => {
    const { package: found } = host.extension

    const status: ExtensionStatus = {
      id: found.id,
      displayName: found.manifest.displayName,
      prefix: found.manifest.prefix,
      icon: found.manifest.icon,
      contributes: found.manifest.contributes,
      permissions: found.manifest.permissions ?? {},
      activates: found.manifest.activates,
      version: found.version,
      internal: found.manifest.internal === true,
      window: found.manifest.window !== undefined,
      node: host.extension.main !== undefined,
      capabilities: found.manifest.capabilities ?? [],
      extensionDependencies: found.manifest.extensionDependencies ?? [],
      settings: { ...host.settings.values },
      state: host.state,
      status: { ...host.status },
      context: { ...host.context },
      facts: { ...host.facts },
      views: { ...host.views },
      settingProblems: host.settings.problems
    }

    if (host.reason !== undefined) {
      status.reason = host.reason
    }

    if (host.activatedIn !== undefined) {
      status.activatedIn = host.activatedIn
    }

    if (host.memory !== undefined) {
      status.memory = host.memory
    }

    return status
  }

  const changed = (open: OpenProject<Project>) =>
    options.window.changed(open.project.id, [...open.hosts.values()].map(statusOf))

  const log = (open: OpenProject<Project>, host: Host<Project>, line: Omit<LogLine, "at">) => {
    // An internal extension with a window module writes to the same log from both halves, so each line says whose.
    const logged: LogLine =
      host.extension.package.manifest.window === undefined
        ? { ...line, at: Date.now() }
        : { ...line, half: "node", at: Date.now() }

    host.logs.push(logged)
    host.logs.splice(0, Math.max(0, host.logs.length - keptLines))
    options.window.logged(open.project.id, host.extension.package.id, logged)
  }

  const setState = (open: OpenProject<Project>, host: Host<Project>, state: HostState, reason?: string) => {
    host.state = state

    if (reason === undefined) {
      delete host.reason
    } else {
      host.reason = reason
    }

    changed(open)
  }

  /** Lets go of a host's process without counting its exit as a crash, and asks it to stop. */
  const detach = (host: Host<Project>): Running | undefined => {
    const running = host.running

    if (!running) {
      return undefined
    }

    delete host.running
    running.stopPinging()
    // Its processes keep running: when it starts again, it gets them back (docs/proposals/processes.md, Lifecycle).
    running.release()

    return running
  }

  const stop = async (host: Host<Project>) => {
    const running = detach(host)

    if (!running) {
      return
    }

    running.link.life.deadline(timing.stopTimeout)
    await running.channel.request("stop", undefined).catch(() => undefined)
    await running.link.life.exited
    running.channel.close(new Error("The extension stopped"))
  }

  /** Who a host's extension is, as the process manager checks what it may run and see. */
  const callerOf = (open: OpenProject<Project>, host: Host<Project>): ProcessCaller => {
    const { permissions } = host.extension.package.manifest

    return {
      projectId: open.project.id,
      extension: host.extension.package.id,
      permissions: { processes: permissions?.processes ?? [], observe: permissions?.observe ?? false },
      main: host.extension.main ?? ""
    }
  }

  /** What a host asks of the service. `releases` gathers what ends with this run of it: its watches. */
  const handlersFor = (open: OpenProject<Project>, host: Host<Project>, releases: Set<() => void>) => {
    const projectId = open.project.id
    const id = host.extension.package.id
    const { root } = open.project
    const { displayName, permissions } = host.extension.package.manifest
    const caller = callerOf(open, host)
    const watches = new Map<number, () => void>()

    releases.add(() => {
      for (const unwatch of watches.values()) {
        unwatch()
      }

      watches.clear()
    })

    /** The path the `read` permission allows, or a refusal. */
    const readable = (path: string) => {
      const allowed = readablePath(path, permissions, { ...options.files.place, root })

      if (allowed === undefined) {
        throw new Error(`${displayName} can't read ${path}. Its manifest's "read" permission doesn't name it.`)
      }

      return allowed
    }

    /** Asks the extension's provider, in whichever run of its host is current. Its answer is checked later. */
    const askProvider = (call: HostMethods["provide"]["params"]) => {
      const running = host.running

      return running
        ? running.channel.request("provide", call)
        : Promise.reject(new Error(`${displayName} isn't running`))
    }

    const ui =
      <M extends WindowAsk>(method: M) =>
      (params: HostServiceMethods[M]["params"]) =>
        options.window.ui(projectId, id, method, params)

    // During an agent's call, there's nobody to answer a question.
    const ask =
      <M extends "ui.pick" | "ui.input" | "ui.confirm">(method: M) =>
      ({ call, ...params }: HostServiceMethods[M]["params"]) => {
        const agent = agentOf(call)

        if (agent !== undefined) {
          throw new Error(`There's nobody to ask: ${agent} is running ${displayName}, so ${method} can't be answered`)
        }

        // SAFETY: the params less `call`, which only the service reads.
        return options.window.ui(projectId, id, method, params as HostServiceMethods[M]["params"])
      }

    // A change made during an agent's call is named after both, as "Claude Code via Tidy: Rename layers".
    const named = (label: string, call: number | undefined) => {
      const agent = agentOf(call)

      return agent === undefined ? `${displayName}: ${label}` : `${agent} via ${displayName}: ${label}`
    }

    return {
      log: (line: HostServiceMethods["log"]["params"]) => log(open, host, line),
      "state.update"({ scope, key, value }: HostServiceMethods["state.update"]["params"]) {
        options.state.write(id, root, scope, key, value)
      },
      "status.set"({ id: item, value, tooltip }: HostServiceMethods["status.set"]["params"]) {
        const next: StatusValue = { ...host.status[item] }

        if (value !== undefined) {
          next.value = value
        }

        if (tooltip !== undefined) {
          next.tooltip = tooltip
        }

        host.status[item] = next
        options.state.write(id, root, "status", item, { ...next })
        changed(open)
      },
      "status.remove"({ id: item }: HostServiceMethods["status.remove"]["params"]) {
        delete host.status[item]
        options.state.write(id, root, "status", item)
        changed(open)
      },
      "context.set"({ key, value }: HostServiceMethods["context.set"]["params"]) {
        if (!key.startsWith(`${host.extension.package.manifest.prefix}.`)) {
          throw new Error(`Context key ${key} must start with "${host.extension.package.manifest.prefix}."`)
        }

        host.context[key] = value
        changed(open)
      },
      "facts.set"({ target, facts }: HostServiceMethods["facts.set"]["params"]) {
        if (facts.length === 0) {
          delete host.facts[target.key]
        } else {
          host.facts[target.key] = facts
        }

        changed(open)
      },
      "view.set"({ id: view, data }: HostServiceMethods["view.set"]["params"]) {
        const declared = declaredViews(host.extension.package.manifest.contributes)[view]

        if (declared !== data.kind) {
          throw new Error(`${view} isn't a ${data.kind} view the manifest declares`)
        }

        host.views[view] = data
        changed(open)
      },
      "view.clear"({ id: view }: HostServiceMethods["view.clear"]["params"]) {
        delete host.views[view]
        changed(open)
      },
      "view.reveal"({ id: view }: HostServiceMethods["view.reveal"]["params"]) {
        if (declaredViews(host.extension.package.manifest.contributes)[view] === undefined) {
          throw new Error(`${view} isn't a tab or page the manifest declares`)
        }

        options.window.reveal(projectId, id, view)
      },
      "ui.notify": ui("ui.notify"),
      "ui.pick": ask("ui.pick"),
      "ui.input": ask("ui.input"),
      "ui.confirm": ask("ui.confirm"),
      "ui.open": ui("ui.open"),
      "ui.progress": ui("ui.progress"),
      async "settings.update"({ key, value }: HostServiceMethods["settings.update"]["params"]) {
        const { prefix, contributes } = host.extension.package.manifest
        const setting = contributes.settings?.[key]

        if (!setting) {
          throw new Error(`${key} isn't a setting the manifest declares`)
        }

        if (setting.scope !== "project") {
          throw new Error(`${key} is the person's, for every project, so only Settings changes it`)
        }

        if (value !== undefined && !fits(setting, value)) {
          throw new Error(`${key} can't be set to ${JSON.stringify(value)}`)
        }

        await options.window.updateSetting(projectId, prefix, storedKey(prefix, key), value)
      },
      "processes.start": (spec: ProcessSpec) => options.processes.start(caller, spec),
      "processes.adopt": (server: HostServiceMethods["processes.adopt"]["params"]) =>
        options.processes.adopt(caller, server),
      "processes.find": (query: FindQuery) => options.processes.find(caller, query),
      "processes.stop": ({ id: process }: { id: string }) => options.processes.stop(caller, process),
      "processes.restart": ({ id: process }: { id: string }) => options.processes.restart(caller, process),
      "processes.ready": ({ id: process }: { id: string }) => options.processes.ready(caller, process),
      "processes.ended": ({ id: process }: { id: string }) => options.processes.ended(caller, process),
      "processes.report"({ id: process, ...progress }: HostServiceMethods["processes.report"]["params"]) {
        options.processes.report(caller, process, progress)
      },
      "processes.summarize"({ id: process, summary }: HostServiceMethods["processes.summarize"]["params"]) {
        options.processes.summarize(caller, process, summary)
      },
      "processes.markReady"({ id: process, match }: HostServiceMethods["processes.markReady"]["params"]) {
        options.processes.markReady(caller, process, match)
      },
      "providers.register"({ kind, maxAgeMs }: HostServiceMethods["providers.register"]["params"]) {
        if (!host.extension.package.manifest.contributes.providers?.[kind]) {
          throw new Error(`${kind} isn't a provider ${displayName}'s manifest declares`)
        }

        // Addresses and discovery are asked by the processes list; the project service asks the rest itself, through the
        // extension that declares them.
        if (kind !== "addresses" && kind !== "discovery") {
          return
        }

        const registered: RegisteredProvider = { kind }

        if (maxAgeMs !== undefined) {
          registered.maxAgeMs = maxAgeMs
        }

        options.providers.register(caller, registered, {
          // SAFETY: what the extension's code answered, typed as it promises; the service checks it before using it.
          addresses: async (servers) =>
            (await askProvider({ kind: "addresses", method: "addresses", params: servers })) as Awaited<
              ReturnType<ProviderAsk["addresses"]>
            >,
          // SAFETY: as above.
          discover: async (project) =>
            (await askProvider({ kind: "discovery", method: "discover", params: project })) as Awaited<
              ReturnType<ProviderAsk["discover"]>
            >
        })
      },
      "providers.changed"({ kind }: HostServiceMethods["providers.changed"]["params"]) {
        if (kind === "addresses" || kind === "discovery") {
          options.providers.changed(caller, kind)
        }
      },
      "providers.dispose"({ kind }: HostServiceMethods["providers.dispose"]["params"]) {
        if (kind === "addresses" || kind === "discovery") {
          options.providers.dispose(caller, kind)
        }
      },
      "files.read": async ({ path }: HostServiceMethods["files.read"]["params"]) => ({
        text: await options.files.read(readable(path))
      }),
      "files.list": async ({ path }: HostServiceMethods["files.list"]["params"]) => ({
        entries: await options.files.list(readable(path))
      }),
      "files.watch"({ id: watch, path }: HostServiceMethods["files.watch"]["params"]) {
        watches.get(watch)?.()
        watches.set(
          watch,
          options.files.watch(readable(path), () => {
            void host.running?.channel.request("files.changed", { id: watch }).catch(() => undefined)
          })
        )
      },
      "files.unwatch"({ id: watch }: HostServiceMethods["files.unwatch"]["params"]) {
        watches.get(watch)?.()
        watches.delete(watch)
      },
      async "edits.transact"({ label, operations, call }: HostServiceMethods["edits.transact"]["params"]) {
        const refused = editsRefusal(displayName, permissions)

        if (refused) {
          throw new Error(refused)
        }

        await options.edits.transact(projectId, id, named(label, call), operations)
      },
      async "files.edit"({ label, files, call }: HostServiceMethods["files.edit"]["params"]) {
        const refused = files.map((file) => writeRefusal(displayName, permissions, file.path)).filter(Boolean)

        if (refused.length > 0) {
          throw new Error(refused.join("\n"))
        }

        return { paths: await options.edits.files(projectId, id, named(label, call), files) }
      },
      "selection.set": ui("selection.set"),
      "selection.highlight": ui("selection.highlight"),
      navigate: ui("navigate"),
      // An extension's command runs in its host; anything else is one of Parity's, which the window runs.
      // An extension's command run during an agent's call is the agent's too.
      async "commands.execute"({ call, ...params }: HostServiceMethods["commands.execute"]["params"]) {
        if (declarer(open, params.command)) {
          await runCommand(open, params.command, params.target, agentOf(call), call)
        } else {
          await options.window.ui(projectId, id, "commands.execute", params)
        }
      },
      async "extensions.call"({ extension, method, args, call }: HostServiceMethods["extensions.call"]["params"]) {
        if (!host.extension.package.manifest.extensionDependencies?.includes(extension)) {
          throw new Error(`${extension} isn't in ${displayName}'s extensionDependencies`)
        }

        // A call made during an agent's call is the agent's too, so it carries the same id.
        const known = agentOf(call) === undefined ? undefined : call
        const other = hostOf(open, extension)
        const running = await ensureRunning(open, other, [], known)

        if (!other.api?.includes(method)) {
          throw new Error(`${other.extension.package.manifest.displayName}'s API has no ${method}`)
        }

        return readReturned(
          await running.channel.request(
            "api.call",
            known === undefined ? { method, args } : { method, args, call: known }
          )
        )
      },
      async "window.call"({ method, args, call }: HostServiceMethods["window.call"]["params"]) {
        if (host.extension.package.manifest.window === undefined) {
          throw new Error(`${displayName} has no window module`)
        }

        const { window } = options

        if (!window.callWindow) {
          throw new Error("This window has no window modules")
        }

        const send = async () => {
          if (!window.callWindow) {
            throw new Error("This window has no window modules")
          }

          return window.callWindow(projectId, id, method, args)
        }

        // During an agent's call, what the window module asks back of its Node half is the agent's too. A call already
        // holding the turn, back from inside it, goes straight through; another agent's waits for its turn.
        const result =
          agentOf(call) === undefined || call === host.windowCall
            ? await send()
            : await agentTurn(host, async () => {
                host.windowCall = call

                try {
                  return await send()
                } finally {
                  delete host.windowCall
                }
              })

        return result === undefined ? {} : { result }
      },
      "window.unavailable"({ method, state }: HostServiceMethods["window.unavailable"]["params"]) {
        if (unavailableSampled(id)) {
          options.record?.("extension.halfUnavailable", { extension: id, from: "node", method, state })
        }
      }
    }
  }

  /**
   * Starts a host's process and activates its extension. `again` says why it stopped before, when it ran already, so it
   * gets back the processes it owns.
   */
  const start = (
    open: OpenProject<Project>,
    host: Host<Project>,
    chain: string[] = [],
    call?: number,
    again?: "crash" | "stuck"
  ) => {
    const { extension } = host
    const { package: found } = extension
    const { main } = extension

    if (main === undefined) {
      throw new Error(`${found.manifest.displayName} has no Node half to start`)
    }

    const link = options.start(extension, open.project)
    const releases = new Set<() => void>()

    const channel = createChannel<HostServiceMethods, HostMethods>({
      handlers: handlersFor(open, host, releases),
      checks: hostChecks,
      disconnected: () => new Error(`${found.manifest.displayName} stopped`)
    })

    channel.connect(link.port)
    const caller = callerOf(open, host)

    // What it hears of the project's processes, from now until it stops.
    const unwatch = options.processes.watch(caller, {
      changed: (processes) => void channel.request("processes.changed", { processes }).catch(() => undefined),
      lines: (process, lines, run) =>
        void channel.request("processes.lines", { id: process, run, lines }).catch(() => undefined),
      ended: (process, end) => void channel.request("processes.ended", { id: process, end }).catch(() => undefined)
    })

    host.context = {}
    host.facts = {}
    host.views = {}
    const stored = options.state.read(found.id, open.project.root)
    host.settings = settingsOf(open, extension)
    const began = Date.now()

    const params: ActivateParams = {
      extension: {
        id: found.id,
        version: found.version,
        displayName: found.manifest.displayName,
        prefix: found.manifest.prefix
      },
      main,
      project: { root: open.project.root, name: open.project.name },
      commands: (found.manifest.contributes.commands ?? []).map((command) => command.id),
      statusItems: (found.manifest.contributes.statusItems ?? []).map((item) => item.id),
      providers: providerKinds.filter((kind) => found.manifest.contributes.providers?.[kind] !== undefined),
      views: declaredViews(found.manifest.contributes),
      state: { app: stored.app, project: stored.project },
      selection: open.selection,
      routeMarks: open.routeMarks,
      processes: { list: [], output: {}, ready: {} },
      settings: {
        values: { ...host.settings.values },
        scopes: Object.fromEntries(
          Object.entries(found.manifest.contributes.settings ?? {}).map(([key, setting]) => [key, setting.scope])
        )
      }
    }

    if (host.detected !== undefined) {
      params.project.detected = host.detected
    }

    const tools = (found.manifest.contributes.agentTools ?? []).map((tool) => tool.name)

    if (tools.length > 0) {
      params.agentTools = tools
    }

    delete host.api

    // The extensions it builds on activate first, so their APIs are ready when it does.
    // An agent's call that starts it starts it as the agent's, so its `activate` can't ask the person either.
    if (call !== undefined) {
      params.call = call
    }

    const activated = dependenciesOf(open, host, [...chain, found.id], call).then(async (dependencies) => {
      if (dependencies.length > 0) {
        params.dependencies = dependencies
      }

      // What's selected now, and its processes, which may have changed while the extensions it builds on started.
      params.selection = open.selection
      params.routeMarks = open.routeMarks
      params.processes = options.processes.snapshot(caller)

      // Where its window module is now; each change after this is sent as it happens, while it activates too.
      if (found.manifest.window !== undefined) {
        params.window = open.windows.get(found.id) ?? "starting"
      }

      running.activateSent = true

      const { api } = await withTimeout(
        channel.request("activate", params),
        timing.activateTimeout,
        () => `activate didn't finish within ${timing.activateTimeout / 1000} seconds`
      )

      host.api = api
    })

    const release = () => {
      unwatch()
      options.providers.disposeAll(open.project.id, found.id)

      for (const each of releases) {
        each()
      }
    }

    const running: Running = { link, channel, activated, stopPinging: () => undefined, release }

    if (again) {
      options.processes.reattached(caller, again)
    }

    host.running = running
    setState(open, host, "starting")

    activated.then(
      () => {
        if (host.running !== running) {
          return
        }

        host.activatedIn = Date.now() - began
        host.activatedAt = Date.now()
        running.stopPinging = ping(open, host, running)
        setState(open, host, "running")
        options.record?.("extension.activated", {
          extension: found.id,
          version: found.version,
          half: "node",
          internal: found.manifest.internal === true,
          trigger: host.trigger ?? "onDetect",
          durationMs: host.activatedIn,
          capabilities: found.manifest.capabilities ?? []
        })
      },
      (cause: unknown) => {
        if (host.running !== running) {
          return
        }

        const reason = `Couldn't activate: ${messageOf(cause)}`
        log(open, host, withStack({ level: "error", text: reason }, cause))
        options.record?.("extension.activateFailed", {
          extension: found.id,
          half: "node",
          phase: "activate",
          message: messageOf(cause),
          stack: cause instanceof Error ? cause.stack : undefined
        })
        detach(host)
        link.life.stop()
        setState(open, host, "crashed", reason)
      }
    )

    void link.life.exited.then((exit) => {
      channel.close(new Error(`${found.manifest.displayName} stopped`))

      if (host.running === running) {
        crashed(open, host, exit)
      }
    })
  }

  const crashed = (open: OpenProject<Project>, host: Host<Project>, exit: ChildExit) => {
    detach(host)
    const now = Date.now()
    host.crashes = [...host.crashes.filter((at) => now - at < timing.crashWindow), now]
    const name = host.extension.package.manifest.displayName
    log(open, host, { level: "error", text: endedByItself(name, exit) })

    options.record?.("extension.crashed", {
      extension: host.extension.package.id,
      uptimeMs: host.activatedAt === undefined ? 0 : now - host.activatedAt,
      crashesInRow: host.crashes.length,
      restarting: host.crashes.length < timing.crashLimit,
      exitCode: exit.code,
      signal: exit.signal
    })
    delete host.activatedAt

    if (host.crashes.length < timing.crashLimit) {
      log(open, host, { level: "info", text: "Starting it again" })
      start(open, host, [], undefined, "crash")

      return
    }

    setState(open, host, "crashed", `It crashed ${host.crashes.length} times in a row.`)
  }

  /** Pings a running host until it stops, naming it stuck while a ping goes unanswered. */
  const ping = (open: OpenProject<Project>, host: Host<Project>, running: Running) => {
    let waiting = false

    const timer = setInterval(() => {
      if (waiting) {
        return
      }

      waiting = true
      let answered = false

      const late = setTimeout(() => {
        if (!answered && host.running === running && host.state === "running") {
          setState(open, host, "stuck", `Not answering after ${timing.pingTimeout / 1000} seconds`)
        }
      }, timing.pingTimeout)

      void running.channel
        .request("ping", undefined)
        .then(
          (answer) => {
            if (host.running !== running) {
              return
            }

            if (host.state === "stuck") {
              setState(open, host, "running")
            }

            if (answer?.memory !== undefined && movedMuch(host.memory, answer.memory)) {
              host.memory = answer.memory
              changed(open)
            }
          },
          () => undefined
        )
        .finally(() => {
          answered = true
          waiting = false
          clearTimeout(late)
        })
    }, timing.pingEvery)

    return () => clearInterval(timer)
  }

  const projectOf = (projectId: string): OpenProject<Project> => {
    const open = projects.get(projectId)

    if (!open) {
      throw new Error(`No project ${projectId} is open`)
    }

    return open
  }

  const hostOf = (open: OpenProject<Project>, id: string): Host<Project> => {
    const host = open.hosts.get(id)

    if (!host) {
      throw new Error(`${id} isn't running for ${open.project.name}`)
    }

    return host
  }

  /** Starts the extensions a host builds on, once each, and gives each one's API once it has activated. */
  async function dependenciesOf(
    open: OpenProject<Project>,
    host: Host<Project>,
    chain: string[],
    call?: number
  ): Promise<Dependency[]> {
    const ids = host.extension.package.manifest.extensionDependencies ?? []

    const found = await Promise.all(
      ids.map(async (id): Promise<Dependency[]> => {
        if (chain.includes(id)) {
          throw new Error(`It depends on itself, through ${[...chain, id].join(", ")}`)
        }

        const other = open.hosts.get(id)

        if (!other) {
          throw new Error(`It needs ${id}, which isn't in ${open.project.name}`)
        }

        // An internal extension with only a window module has nothing here to start: window modules reach it in the tab.
        if (other.extension.main === undefined) {
          return []
        }

        await ensureRunning(open, other, chain, call)
        const { package: dependency } = other.extension

        return [{ id, version: dependency.version, displayName: dependency.manifest.displayName, api: other.api ?? [] }]
      })
    )

    return found.flat()
  }

  /** A host's process once it has activated, starting it first when it isn't running. */
  async function ensureRunning(open: OpenProject<Project>, host: Host<Project>, chain: string[] = [], call?: number) {
    const name = host.extension.package.manifest.displayName

    if (host.state === "crashed" || host.state === "stuck") {
      throw new Error(
        `${name} ${host.state === "crashed" ? "has stopped" : "isn't answering"}. Restart it to try again.`
      )
    }

    if (!host.running) {
      start(open, host, chain, call)
    }

    const running = host.running

    if (!running) {
      throw new Error(`${name} couldn't start`)
    }

    await running.activated.catch(() => {
      throw new Error(`${name} couldn't start: ${host.reason ?? "it stopped"}`)
    })

    return running
  }

  /**
   * Runs `task` as `agent`'s call, when an agent makes it: under an id of its own, which the host carries through the
   * extension's code and sends with what that code asks, so each change is named after the agent whose call made it,
   * whatever other calls run meanwhile.
   */
  async function as<T>(agent: string | undefined, task: (call: number | undefined) => Promise<T>): Promise<T> {
    if (agent === undefined) {
      return task(undefined)
    }

    const call = nextCall++
    calls.set(call, agent)

    try {
      return await task(call)
    } finally {
      calls.delete(call)
    }
  }

  /** The host of the extension that declares a provider of `kind`, if any. */
  const providerHost = (open: OpenProject<Project>, kind: ProviderKind, extension?: string) =>
    [...open.hosts.values()].find(
      ({ extension: { package: found } }) =>
        found.manifest.contributes.providers?.[kind] !== undefined &&
        (extension === undefined || found.manifest.prefix === extension)
    )

  /** The host of the extension that declares a command, if any. */
  const declarer = (open: OpenProject<Project>, command: string) =>
    [...open.hosts.values()].find((candidate) =>
      candidate.extension.package.manifest.contributes.commands?.some((declared) => declared.id === command)
    )

  /** Runs an agent's window command for an extension after any other agent's for it has finished. */
  function agentTurn<T>(host: Host<Project>, task: () => Promise<T>): Promise<T> {
    const next = (host.windowTurn ?? Promise.resolve()).then(task)
    host.windowTurn = next.catch(() => undefined)

    return next
  }

  /** Runs an extension's command, starting its host first when it isn't running, and gives what it returned. */
  async function runCommand(
    open: OpenProject<Project>,
    command: string,
    target?: CommandTarget,
    agent?: string,
    within?: number
  ): Promise<JsonValue | undefined> {
    const host = declarer(open, command)

    if (!host) {
      throw new Error(`No extension running for ${open.project.name} declares ${command}`)
    }

    const { manifest } = host.extension.package

    // An internal extension's window module may have registered it, so the tab is asked first.
    const { window } = options

    if (manifest.window !== undefined && window.runInWindow) {
      const inWindow = async (call?: number) =>
        (await window.runInWindow?.(open.project.id, command, target, call)) ?? { handled: false }

      // While an agent's runs, it holds its call, for what the window module asks of its Node half.
      const held = async (call: number | undefined) => {
        host.windowCall = call

        try {
          return await inWindow(call)
        } finally {
          delete host.windowCall
        }
      }

      let ran: { handled: boolean; result?: JsonValue }

      if (agent === undefined) {
        // The person's leaves an agent's call alone.
        ran = await inWindow()
      } else if (within !== undefined && within === host.windowCall) {
        // Run from inside the agent's window command that holds the turn, so part of it: it goes straight through.
        ran = await inWindow(within)
      } else {
        // Agents' run one at a time. One run from inside another agent call goes on with that call, so a cycle back to
        // it goes through.
        ran = await agentTurn(host, () =>
          within !== undefined && agentOf(within) !== undefined ? held(within) : as(agent, held)
        )
      }

      if (ran.handled) {
        return ran.result
      }
    }

    if (host.extension.main === undefined) {
      throw new Error(`${manifest.displayName} isn't running in ${open.project.name}, so ${command} can't run`)
    }

    try {
      return await as(agent, async (call) => {
        const running = await ensureRunning(open, host, [], call)
        const params: HostMethods["run"]["params"] = target ? { command, target } : { command }

        if (call !== undefined) {
          params.call = call
        }

        const { result } = readReturned(await running.channel.request("run", params))

        return result
      })
    } catch (cause) {
      log(open, host, withStack({ level: "error", text: `${command} failed: ${messageOf(cause)}` }, cause))
      throw cause
    }
  }

  /** Runs an extension's agent tool for an agent, with its input checked against the tool's schema. */
  async function runTool(open: OpenProject<Project>, name: string, input: JsonValue | undefined, agent: string) {
    const host = [...open.hosts.values()].find((candidate) =>
      candidate.extension.package.manifest.contributes.agentTools?.some((tool) => tool.name === name)
    )

    const tool = host?.extension.package.manifest.contributes.agentTools?.find((each) => each.name === name)

    if (!host || !tool) {
      throw new Error(`No extension for ${open.project.name} has a command or agent tool named ${name}`)
    }

    const checked = readToolInput(tool, input)

    try {
      return await as(agent, async (call) => {
        const running = await ensureRunning(open, host, [], call)

        const { result } = readReturned(
          await running.channel.request(
            "tool",
            call === undefined ? { name, input: checked } : { name, input: checked, call }
          )
        )

        return result
      })
    } catch (cause) {
      log(open, host, withStack({ level: "error", text: `${name} failed: ${messageOf(cause)}` }, cause))
      throw cause
    }
  }

  return {
    open(project, settings = {}) {
      const known = projects.get(project.id)

      const open: OpenProject<Project> = known ?? {
        project,
        hosts: new Map(),
        selection: [],
        routeMarks: {},
        settings,
        windows: new Map()
      }

      if (known) {
        known.project = project
        known.settings = settings
        settingsChanged(known)
      } else {
        projects.set(project.id, open)
      }

      for (const extension of options.extensions) {
        if (open.hosts.has(extension.package.id)) {
          continue
        }

        const found = extension.detect(project)

        if (!found) {
          continue
        }

        const host: Host<Project> = {
          extension,
          state: "waiting",
          status: options.state.read(extension.package.id, project.root).status,
          context: {},
          facts: {},
          views: {},
          logs: [],
          crashes: [],
          settings: settingsOf(open, extension)
        }

        if (found.detected !== undefined) {
          host.detected = found.detected
        }

        open.hosts.set(extension.package.id, host)
      }

      // One that builds on an extension that isn't in the project can't run here, so it isn't found.
      for (let dropped = true; dropped;) {
        dropped = false

        for (const [id, host] of open.hosts) {
          if (host.extension.package.manifest.extensionDependencies?.some((needed) => !open.hosts.has(needed))) {
            open.hosts.delete(id)
            dropped = true
          }
        }
      }

      changed(open)

      for (const host of open.hosts.values()) {
        const { activates } = host.extension.package.manifest

        // One an earlier extension built on is running already. An internal extension's Node half starts with its
        // window module instead, whose activation the window decides (`startHalf`).
        const windowed = host.extension.package.manifest.window !== undefined

        if (
          !host.running &&
          !windowed &&
          host.extension.main !== undefined &&
          (activates.includes("onDetect") || activates.includes("onStartup"))
        ) {
          host.trigger = activates.includes("onDetect") ? "onDetect" : "onStartup"
          start(open, host)
        }
      }
    },
    async close(projectId) {
      const open = projects.get(projectId)

      if (!open) {
        return
      }

      projects.delete(projectId)
      const now = Date.now()

      for (const host of open.hosts.values()) {
        if (host.running && host.activatedAt !== undefined) {
          options.record?.("extension.deactivated", {
            extension: host.extension.package.id,
            half: "node",
            why: "quit",
            uptimeMs: now - host.activatedAt
          })
        }
      }

      await Promise.all([...open.hosts.values()].map((host) => stop(host)))

      for (const host of open.hosts.values()) {
        options.processes.stopAll(projectId, host.extension.package.id)
      }
    },
    async run(projectId, command, target, call) {
      await runCommand(projectOf(projectId), command, target, agentOf(call), call)
    },
    provider(projectId, kind, extension) {
      const open = projects.get(projectId)
      const manifest = open && providerHost(open, kind, extension)?.extension.package.manifest
      const layer = kind === "styles" ? manifest?.contributes.providers?.styles?.layer : undefined

      return manifest && { id: manifest.prefix, name: manifest.displayName, ...(layer && { layer }) }
    },
    decorators(projectId) {
      const open = projects.get(projectId)

      return [...(open?.hosts.values() ?? [])].flatMap(({ extension: { package: found } }) =>
        (found.manifest.contributes.providers?.router?.decorators ?? []).map((decorator) => ({
          extension: found.manifest.prefix,
          decorator
        }))
      )
    },
    pageRouters(projectId) {
      const open = projects.get(projectId)

      return [...(open?.hosts.values() ?? [])].flatMap(({ extension: { package: found } }) => {
        const { page, pageWraps } = found.manifest.contributes.providers?.router ?? {}

        if (!page) {
          return []
        }

        const router: PageRouterRef = {
          extension: found.manifest.prefix,
          module: packageExport(found.id, page.import),
          export: page.export
        }

        if (pageWraps) {
          router.wraps = Object.entries(pageWraps).map(([wrapped, module]) => ({
            package: wrapped,
            module: packageExport(found.id, module)
          }))
        }

        return [router]
      })
    },
    async provide(projectId, call, extension) {
      const open = projectOf(projectId)
      const host = providerHost(open, call.kind, extension)

      if (!host) {
        return undefined
      }

      const running = await ensureRunning(open, host)

      try {
        const answer = readAnswer(call, await running.channel.request("provide", call))

        // SAFETY: `readAnswer` reads what `call`'s method answers, which is what `ProviderResult` names.
        return answer as ProviderResult<typeof call>
      } catch (cause) {
        const text = `Its ${call.kind} failed to answer ${call.method}: ${messageOf(cause)}`
        log(open, host, withStack({ level: "error", text }, cause))
        throw cause
      }
    },
    runForAgent(projectId, { name, target, input }, agent) {
      const open = projectOf(projectId)

      if (declarer(open, name)) {
        if (input !== undefined) {
          throw new Error(`${name} is a command, which takes no input`)
        }

        return runCommand(open, name, target, agent)
      }

      return runTool(open, name, input, agent)
    },
    viewOpened(projectId, view) {
      const open = projectOf(projectId)

      for (const host of open.hosts.values()) {
        if (
          !host.running &&
          host.state === "waiting" &&
          host.extension.package.manifest.activates.includes(`onView:${view}`)
        ) {
          start(open, host)
        }
      }
    },
    async viewChanged(projectId, id, change) {
      const host = hostOf(projectOf(projectId), id)

      if (!host.running) {
        throw new Error(`${host.extension.package.manifest.displayName} isn't running`)
      }

      await host.running.channel.request("view.changed", change)
    },
    restart(projectId, id) {
      const open = projectOf(projectId)
      const host = hostOf(open, id)
      // One that ran before gets back the processes it owns, as after a crash.
      const ran = host.running !== undefined || host.state === "crashed" || host.state === "stuck"
      const again = host.state === "stuck" ? "stuck" : "crash"
      const running = detach(host)
      running?.link.life.stop()
      host.crashes = []
      log(open, host, { level: "info", text: "Restarting" })
      start(open, host, [], undefined, ran ? again : undefined)
    },
    cancel(projectId, id, progress) {
      const running = hostOf(projectOf(projectId), id).running
      void running?.channel.request("cancel", { progress }).catch(() => undefined)
    },
    selectionChanged(projectId, refs) {
      const open = projects.get(projectId)

      if (!open) {
        return
      }

      open.selection = refs

      // A host still activating is sent it too: it has the selection it started with until then.
      for (const host of open.hosts.values()) {
        void host.running?.channel.request("selection.changed", { refs }).catch(() => undefined)
      }
    },
    routeMarksChanged(projectId, marks) {
      const open = projects.get(projectId)

      if (!open) {
        return
      }

      open.routeMarks = marks

      for (const host of open.hosts.values()) {
        void host.running?.channel.request("routes.changed", { marks }).catch(() => undefined)
      }
    },
    setAppSettings(settings) {
      appSettings = settings

      for (const open of projects.values()) {
        settingsChanged(open)
      }
    },
    setProjectSettings(projectId, settings) {
      const open = projects.get(projectId)

      if (open) {
        open.settings = settings
        settingsChanged(open)
      }
    },
    startHalf(projectId, extension, trigger) {
      const open = projectOf(projectId)
      const host = hostOf(open, extension)

      if (host.extension.main === undefined || host.running || host.state === "crashed" || host.state === "stuck") {
        return
      }

      host.trigger = trigger
      void ensureRunning(open, host).catch(() => undefined)
    },
    async callHalf(projectId, extension, method, args) {
      const host = hostOf(projectOf(projectId), extension)
      const { running } = host
      const name = host.extension.package.manifest.displayName

      // The window module checks first; this is for a call that crossed a crash on its way.
      if (!running || host.state !== "running") {
        throw new Error(`${name}'s Node half isn't running`)
      }

      await running.activated

      if (!host.api?.includes(method)) {
        throw new Error(`${name}'s Node half has no ${method}`)
      }

      const call = host.windowCall

      return readReturned(
        await running.channel.request("api.call", call === undefined ? { method, args } : { method, args, call })
      ).result
    },
    windowState(projectId, extension, state) {
      const open = projects.get(projectId)
      const host = open?.hosts.get(extension)

      if (!open || !host) {
        return
      }

      open.windows.set(extension, state)
      const running = host.running

      // Sent at once, not after `activate` finishes: an `activate` may wait for the window module to be ready. Before
      // `activate` is sent, it carries the state itself.
      if (running?.activateSent) {
        void running.channel.request("window.state", { state }).catch(() => undefined)
      }
    },
    installed() {
      return options.extensions.map((extension) => installedStatus(extension.package))
    },
    list(projectId) {
      const open = projects.get(projectId)

      if (!open) {
        return { extensions: [], logs: {} }
      }

      return {
        extensions: [...open.hosts.values()].map(statusOf),
        logs: Object.fromEntries([...open.hosts.values()].map((host) => [host.extension.package.id, [...host.logs]]))
      }
    }
  }
}

/** Every kind of provider an extension can register. */
const providerKinds: readonly ProviderKind[] = [
  "router",
  "styles",
  "renderer",
  "builder",
  "entities",
  "addresses",
  "discovery",
  "libraries"
]

/** The tabs, sections and pages a manifest declares, by id, with the kind of view each holds. */
function declaredViews(contributes: Contributions): Record<string, ViewKind> {
  return Object.fromEntries(
    [...(contributes.tabs ?? []), ...(contributes.sections ?? []), ...(contributes.pages ?? [])].map(({ id, view }) => [
      id,
      view
    ])
  )
}

/** Whether memory moved by a tenth or more since it was last shown, so a window hears of it only then. */
function movedMuch(before: number | undefined, after: number): boolean {
  return before === undefined || Math.abs(after - before) >= before / 10
}

/** A promise that fails with `reason` when `promise` hasn't settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, reason: () => string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(reason())), ms)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (cause: unknown) => {
        clearTimeout(timer)
        reject(cause instanceof Error ? cause : new Error(String(cause)))
      }
    )
  })
}

/** A failure's message. A failure from the host can be anything. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** A line with a failure's stack, when it has one. */
function withStack(line: Omit<LogLine, "at">, cause: unknown): Omit<LogLine, "at"> {
  return cause instanceof Error && cause.stack ? { ...line, stack: cause.stack } : line
}
