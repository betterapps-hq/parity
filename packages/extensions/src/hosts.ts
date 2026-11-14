import { type Channel, createChannel, type Port } from "@parity-app/channel"
import type { CommandTarget, Contributions, Fact, JsonValue, PathIcon, ServerRequest } from "@parity-app/extension-api"
import { type ChildExit, endedByItself, type Lifecycle } from "@parity-app/processes"
import type { ExtensionPackage } from "./manifest.ts"
import {
  type ActivateParams,
  hostChecks,
  type HostMethods,
  type HostServiceMethods,
  type LogLine,
  type StateValues,
  type StatusValue
} from "./protocol.ts"

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
  icon: PathIcon
  contributes: Contributions
  state: HostState
  /** Why it's stuck or crashed. */
  reason?: string
  /** Its status items' values, by id: the last ones it set, kept from its last run until it sets them again. */
  status: Record<string, StatusValue>
  /** The context keys it set, by key. */
  context: Record<string, boolean | string[]>
  /** The facts it set, by what they're about: a component's key. */
  facts: Record<string, Fact[]>
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

/** What hosts tell the window that has a project open, and ask of the person through it. */
export interface ExtensionWindow {
  /** A project's extensions changed: one started, crashed or set a status item or context key. */
  changed(projectId: string, extensions: ExtensionStatus[]): void
  logged(projectId: string, extension: string, line: LogLine): void
  ui<M extends UiMethod>(
    projectId: string,
    extension: string,
    method: M,
    params: HostServiceMethods[M]["params"]
  ): Promise<HostServiceMethods[M]["result"]>
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
  /** Finds the project's extensions, and starts those that activate when they're detected. */
  open(project: Project): void
  /** Ends the project's hosts. */
  close(projectId: string): Promise<void>
  /** Runs a command, starting its extension's host first when it isn't running. */
  run(projectId: string, command: string, target?: CommandTarget): Promise<void>
  /** A tab or page opened, which starts an extension that activates on it. */
  viewOpened(projectId: string, view: string): void
  /** Ends an extension's host and starts it again, as after it crashed or got stuck. */
  restart(projectId: string, extension: string): void
  /** The person cancelled a task under `ui.progress`. */
  cancel(projectId: string, extension: string, progress: number): void
  /** A project's extensions and their logs. */
  list(projectId: string): { extensions: ExtensionStatus[]; logs: Record<string, LogLine[]> }
}

interface Host<Project> {
  extension: InstalledExtension<Project>
  detected?: JsonValue
  state: HostState
  reason?: string
  status: Record<string, StatusValue>
  context: Record<string, boolean | string[]>
  facts: Record<string, Fact[]>
  logs: LogLine[]
  /** When it crashed lately, in milliseconds since 1970. */
  crashes: number[]
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
}

/** Every open project's extensions, each in a host of its own. */
export function extensionHosts<Project extends OpenedProject>(
  options: ExtensionHostsOptions<Project>
): ExtensionHosts<Project> {
  const timing = { ...defaultTiming, ...options.timing }
  const projects = new Map<string, OpenProject<Project>>()

  const statusOf = (host: Host<Project>): ExtensionStatus => {
    const { package: found } = host.extension

    const status: ExtensionStatus = {
      id: found.id,
      displayName: found.manifest.displayName,
      icon: found.manifest.icon,
      contributes: found.manifest.contributes,
      state: host.state,
      status: { ...host.status },
      context: { ...host.context },
      facts: { ...host.facts }
    }

    if (host.reason !== undefined) {
      status.reason = host.reason
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

    const ui =
      <M extends UiMethod>(method: M) =>
      (params: HostServiceMethods[M]["params"]) =>
        options.window.ui(projectId, id, method, params)

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
      "ui.notify": ui("ui.notify"),
      "ui.pick": ui("ui.pick"),
      "ui.input": ui("ui.input"),
      "ui.confirm": ui("ui.confirm"),
      "ui.open": ui("ui.open"),
      "ui.progress": ui("ui.progress"),
      "servers.serve": (server: ServerRequest) => options.servers.serve(projectId, id, server),
      "servers.adopt"(server: HostServiceMethods["servers.adopt"]["params"]) {
        options.servers.adopt(projectId, id, server)
      },
      "servers.stop"({ id: server }: HostServiceMethods["servers.stop"]["params"]) {
        options.servers.stop(projectId, id, server)
      },
      "servers.routed": () => options.servers.routed()
    }
  }

  const start = (open: OpenProject<Project>, host: Host<Project>) => {
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
    const stored = options.state.read(found.id, open.project.root)

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
      state: { app: stored.app, project: stored.project }
    }

    if (host.detected !== undefined) {
      params.project.detected = host.detected
    }

    const activated = withTimeout(
      channel.request("activate", params),
      timing.activateTimeout,
      () => `activate didn't finish within ${timing.activateTimeout / 1000} seconds`
    )

    const running: Running = { link, channel, activated, stopPinging: () => undefined }
    host.running = running
    setState(open, host, "starting")

    activated.then(
      () => {
        if (host.running !== running) {
          return
        }

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
          () => {
            if (host.running === running && host.state === "stuck") {
              setState(open, host, "running")
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

  return {
    open(project) {
      if (projects.has(project.id)) {
        return
      }

      const open: OpenProject<Project> = { project, hosts: new Map() }
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
          logs: [],
          crashes: []
        }

        if (found.detected !== undefined) {
          host.detected = found.detected
        }

        open.hosts.set(extension.package.id, host)
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
      const open = projectOf(projectId)

      const host = [...open.hosts.values()].find((candidate) =>
        candidate.extension.package.manifest.contributes.commands?.some((declared) => declared.id === command)
      )

      if (!host) {
        throw new Error(`No extension running for ${open.project.name} declares ${command}`)
      }

      const name = host.extension.package.manifest.displayName

      if (host.state === "crashed" || host.state === "stuck") {
        throw new Error(
          `${name} ${host.state === "crashed" ? "has stopped" : "isn't answering"}. Restart it to try again.`
        )
      }

      if (!host.running) {
        start(open, host)
      }

      const running = host.running

      if (!running) {
        throw new Error(`${name} couldn't start`)
      }

      await running.activated.catch(() => {
        throw new Error(`${name} couldn't start: ${host.reason ?? "it stopped"}`)
      })

      try {
        await running.channel.request("run", target ? { command, target } : { command })
      } catch (cause) {
        log(open, host, withStack({ level: "error", text: `${command} failed: ${messageOf(cause)}` }, cause))
        throw cause
      }
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
