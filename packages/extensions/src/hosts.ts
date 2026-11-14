import { type Channel, createChannel, type Port } from "@parity-app/channel"
import type {
  CommandTarget,
  Contributions,
  DesignOperation,
  Fact,
  FileEdit,
  JsonValue,
  NodeRef,
  PathIcon,
  Permissions,
  ServerRequest,
  SettingValue,
  ViewData,
  ViewKind
} from "@parity-app/extension-api"
import { type ChildExit, endedByItself, type Lifecycle } from "@parity-app/processes"
import { readToolInput } from "./agents.ts"
import type { ExtensionPackage } from "./manifest.ts"
import { editsRefusal, writeRefusal } from "./permissions.ts"
import {
  type ActivateParams,
  type Dependency,
  hostChecks,
  type HostMethods,
  type HostServiceMethods,
  type LogLine,
  readReturned,
  type StateValues,
  type StatusValue
} from "./protocol.ts"
import { changedValues, fits, readExtensionSettings, type StoredSettings, storedKey } from "./settings.ts"

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

/** An extension Parity can run: its package, its code's entry module, and how it detects its tool. */
export interface InstalledExtension<Project> {
  package: ExtensionPackage
  /** Its code's entry module, as an absolute path. */
  main: string
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
}

/** The project service's process manager, as extensions' servers use it. */
export interface ExtensionServers {
  serve(projectId: string, extension: string, server: ServerRequest): Promise<{ url: string }>
  adopt(projectId: string, extension: string, server: { id: string; name: string; url: string }): void
  stop(projectId: string, extension: string, id: string): void
  /** Stops every server an extension started, as its host stops or crashes. */
  stopAll(projectId: string, extension: string): void
  /** The local servers Portless names, and their addresses. */
  routed(): Promise<{ url: string; address: string }[]>
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
  servers: ExtensionServers
  edits: ExtensionEdits
  timing?: Partial<HostTiming>
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
   * for them from its main `.par`.
   */
  open(project: Project, settings?: StoredSettings): void
  /** Ends the project's hosts. */
  close(projectId: string): Promise<void>
  /** Runs a command, starting its extension's host first when it isn't running. */
  run(projectId: string, command: string, target?: CommandTarget): Promise<void>
  /**
   * Runs an extension's command or agent tool for an agent, by the command's id or the tool's name, starting its host
   * first when it isn't running, and gives back what it returned. A tool's input is checked against its schema. While
   * it runs, the extension's changes are named after `agent` and the extension, and it can't ask the person anything.
   */
  runForAgent(projectId: string, request: AgentRun, agent: string): Promise<JsonValue | undefined>
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
  /** What's selected in the window with the project open changed, which every running host is told. */
  selectionChanged(projectId: string, refs: NodeRef[]): void
  /** The person's `app` settings for every extension, from settings.json, as they are now. */
  setAppSettings(settings: StoredSettings): void
  /** A project's settings for its extensions, from its main `.par`'s `extensions` field, saved or not. */
  setProjectSettings(projectId: string, settings: StoredSettings): void
}

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
}

/** A host's process while it runs. */
interface Running {
  link: HostLink
  channel: Channel<HostServiceMethods, HostMethods>
  activated: Promise<void>
  stopPinging(): void
}

interface OpenProject<Project> {
  project: Project
  hosts: Map<string, Host<Project>>
  /** What's selected in its window, which hosts start with. */
  selection: NodeRef[]
  /** The project's settings for its extensions, from its main `.par`. */
  settings: StoredSettings
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
    const logged: LogLine = { ...line, at: Date.now() }
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
  const detach = (open: OpenProject<Project>, host: Host<Project>): Running | undefined => {
    const running = host.running

    if (!running) {
      return undefined
    }

    delete host.running
    running.stopPinging()
    options.servers.stopAll(open.project.id, host.extension.package.id)

    return running
  }

  const stop = async (open: OpenProject<Project>, host: Host<Project>) => {
    const running = detach(open, host)

    if (!running) {
      return
    }

    running.link.life.deadline(timing.stopTimeout)
    await running.channel.request("stop", undefined).catch(() => undefined)
    await running.link.life.exited
    running.channel.close(new Error("The extension stopped"))
  }

  const handlersFor = (open: OpenProject<Project>, host: Host<Project>) => {
    const projectId = open.project.id
    const id = host.extension.package.id
    const { root } = open.project
    const { displayName, permissions } = host.extension.package.manifest

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
      "servers.serve": (server: ServerRequest) => options.servers.serve(projectId, id, server),
      "servers.adopt"(server: HostServiceMethods["servers.adopt"]["params"]) {
        options.servers.adopt(projectId, id, server)
      },
      "servers.stop"({ id: server }: HostServiceMethods["servers.stop"]["params"]) {
        options.servers.stop(projectId, id, server)
      },
      "servers.routed": () => options.servers.routed(),
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
      async "commands.execute"(params: HostServiceMethods["commands.execute"]["params"]) {
        if (declarer(open, params.command)) {
          await runCommand(open, params.command, params.target)
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
      }
    }
  }

  const start = (open: OpenProject<Project>, host: Host<Project>, chain: string[] = [], call?: number) => {
    const { extension } = host
    const { package: found } = extension
    const link = options.start(extension, open.project)

    const channel = createChannel<HostServiceMethods, HostMethods>({
      handlers: handlersFor(open, host),
      checks: hostChecks,
      disconnected: () => new Error(`${found.manifest.displayName} stopped`)
    })

    channel.connect(link.port)
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
      main: extension.main,
      project: { root: open.project.root, name: open.project.name },
      commands: (found.manifest.contributes.commands ?? []).map((command) => command.id),
      statusItems: (found.manifest.contributes.statusItems ?? []).map((item) => item.id),
      views: declaredViews(found.manifest.contributes),
      state: { app: stored.app, project: stored.project },
      selection: open.selection,
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

      // What's selected now, which may have changed while the extensions it builds on started.
      params.selection = open.selection

      const { api } = await withTimeout(
        channel.request("activate", params),
        timing.activateTimeout,
        () => `activate didn't finish within ${timing.activateTimeout / 1000} seconds`
      )

      host.api = api
    })

    const running: Running = { link, channel, activated, stopPinging: () => undefined }
    host.running = running
    setState(open, host, "starting")

    activated.then(
      () => {
        if (host.running !== running) {
          return
        }

        host.activatedIn = Date.now() - began
        running.stopPinging = ping(open, host, running)
        setState(open, host, "running")
      },
      (cause: unknown) => {
        if (host.running !== running) {
          return
        }

        const reason = `Couldn't activate: ${messageOf(cause)}`
        log(open, host, withStack({ level: "error", text: reason }, cause))
        detach(open, host)
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
    detach(open, host)
    const now = Date.now()
    host.crashes = [...host.crashes.filter((at) => now - at < timing.crashWindow), now]
    const name = host.extension.package.manifest.displayName
    log(open, host, { level: "error", text: endedByItself(name, exit) })

    if (host.crashes.length < timing.crashLimit) {
      log(open, host, { level: "info", text: "Starting it again" })
      start(open, host)

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

    return Promise.all(
      ids.map(async (id) => {
        if (chain.includes(id)) {
          throw new Error(`It depends on itself, through ${[...chain, id].join(", ")}`)
        }

        const other = open.hosts.get(id)

        if (!other) {
          throw new Error(`It needs ${id}, which isn't in ${open.project.name}`)
        }

        await ensureRunning(open, other, chain, call)
        const { package: found } = other.extension

        return { id, version: found.version, displayName: found.manifest.displayName, api: other.api ?? [] }
      })
    )
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

  /** The host of the extension that declares a command, if any. */
  const declarer = (open: OpenProject<Project>, command: string) =>
    [...open.hosts.values()].find((candidate) =>
      candidate.extension.package.manifest.contributes.commands?.some((declared) => declared.id === command)
    )

  /** Runs an extension's command, starting its host first when it isn't running, and gives what it returned. */
  async function runCommand(
    open: OpenProject<Project>,
    command: string,
    target?: CommandTarget,
    agent?: string
  ): Promise<JsonValue | undefined> {
    const host = declarer(open, command)

    if (!host) {
      throw new Error(`No extension running for ${open.project.name} declares ${command}`)
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
      if (projects.has(project.id)) {
        return
      }

      const open: OpenProject<Project> = { project, hosts: new Map(), selection: [], settings }
      projects.set(project.id, open)

      for (const extension of options.extensions) {
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

        if (activates.includes("onDetect") || activates.includes("onStartup")) {
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
      await Promise.all([...open.hosts.values()].map((host) => stop(open, host)))
    },
    async run(projectId, command, target) {
      await runCommand(projectOf(projectId), command, target)
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
      const running = detach(open, host)
      running?.link.life.stop()
      host.crashes = []
      log(open, host, { level: "info", text: "Restarting" })
      start(open, host)
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
