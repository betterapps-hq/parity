import type {
  Capability,
  CommandTarget,
  Disposable,
  ExtensionApi,
  JsonValue,
  Navigate,
  NodeRef,
  RemoteApi,
  SettingValue
} from "@parity-app/extension"
import {
  type Activated,
  CapabilityMissingError,
  type HalfState,
  HalfUnavailableError,
  type HostLink,
  type OtherWindowModule,
  type WindowModule,
  type WindowParity
} from "@parity-app/extension/internal"
import { z } from "zod"
import type { RecordExtensionEvent } from "./events.ts"
import type { ExtensionStatus, HostState } from "./hosts.ts"

/*
 * Internal extensions' window modules in one project tab (docs/proposals/extensions-in-the-window.md). A window module
 * is an ES module the app's build compiles with the window, which runs on its main thread with Parity's React and kit.
 * For each project tab, the window activates the modules whose activation holds (`onStartup`, or `onSetting:<key>`
 * while that boolean app setting is on), each with a `WindowParity` of its own, and deactivates them when it stops
 * holding, the extension goes, its Node half stops for good, or the tab closes. Every call core makes into a module is
 * wrapped: a failure is logged against the extension and counted, and five in a tab stop it there. Nothing here knows
 * Electron or React: the app gives it a loader, the editor's selection and navigation, and its link to Node halves.
 */

/** An internal extension as a tab's window modules see it, from what the service sends of it. */
export interface WindowExtension {
  id: string
  version: string
  displayName: string
  internal: boolean
  /** Whether it has a window module. */
  window: boolean
  /** Whether it has a Node half. */
  node: boolean
  activates: string[]
  capabilities: Capability[]
  extensionDependencies: string[]
  /** The commands its manifest declares, which `parity.commands.register` is checked against. */
  commands: string[]
  /** Its settings' values now, by key. */
  settings: Record<string, SettingValue>
  /** Whose each setting is: the person's (`app`) or the project's (`project`). */
  settingScopes: Record<string, "app" | "project">
  /** Where its Node half's host is. */
  host: HostState
}

/** The internal extensions with window modules among a project's extensions, as the service sends them. */
export function windowExtensions(statuses: readonly ExtensionStatus[]): WindowExtension[] {
  return statuses.flatMap((status) =>
    !status.internal || !status.window
      ? []
      : {
          id: status.id,
          version: status.version,
          displayName: status.displayName,
          internal: status.internal,
          window: status.window,
          node: status.node,
          activates: status.activates,
          capabilities: status.capabilities,
          extensionDependencies: status.extensionDependencies,
          commands: (status.contributes.commands ?? []).map((command) => command.id),
          settings: status.settings,
          settingScopes: Object.fromEntries(
            Object.entries(status.contributes.settings ?? {}).map(([key, setting]) => [key, setting.scope])
          ),
          host: status.state
        }
  )
}

/** What a tab's window modules ask of the editor it's in. */
export interface WindowEditor {
  selection: {
    get(): NodeRef[]
    set(refs: NodeRef[]): Promise<void>
    highlight(refs: NodeRef[]): Promise<void>
    /** Calls `listener` each time the selection changes, until the function it gives is called. */
    onChange(listener: (refs: NodeRef[]) => void): () => void
  }
  navigate: Navigate
  /** Runs one of Parity's own commands, or an extension's. */
  execute(command: string, target?: CommandTarget): Promise<void>
}

/** A tab's link to its extensions' Node halves, through the project service. */
export interface WindowHalves {
  /** Starts an extension's Node half, as its window module activates, naming the event that activated it. */
  start(extension: string, trigger: string): void
  /** Calls a function of what the Node half's `activate` returned. */
  call(extension: string, method: string, args: JsonValue[]): Promise<JsonValue | undefined>
  /** Tells the Node half where its window module is, which its `parity.window` gives. */
  state(extension: string, state: HalfState): void
}

/**
 * Something on `WindowParity` that needs a capability, which later phases give: the canvas, presence, sync, agents.
 * Reading it checks the capability first.
 */
export interface WindowSurface {
  capability: Capability
  /** Makes it for one extension in this tab, the first time that extension reads it. */
  make(context: { extension: string; tab: string }): object
}

/** Where a module is in a tab. */
export type ModuleState = "loading" | "active" | "inactive"

export interface WindowModulesOptions {
  /** The project tab's id. */
  tab: string
  project: { root: string; name: string }
  /** Loads an extension's window module. What it gives is checked to export `activateWindow`. */
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- a module can export anything; it's checked where it's used
  load(extension: string): Promise<unknown>
  editor: WindowEditor
  halves: WindowHalves
  /** Sets one of an extension's `project` settings, or puts it back to its default without `value`. */
  updateSetting(extension: string, key: string, value?: SettingValue): Promise<void>
  /** A line in the extension's log, marked as its window module's in this tab. */
  log(extension: string, level: "info" | "warning" | "error", text: string, stack?: string): void
  record?: RecordExtensionEvent
  /** Sends an error to Sentry, tagged with the extension, its half and the tab. */
  report?(error: Error, tags: { extension: string; extension_half: "window"; tab: string }): void
  /** A module was stopped in this tab after failing too often, or failing to activate, for the person to be told. */
  stopped?(extension: WindowExtension): void
  /**
   * What `extension.capabilityMissing` has been sent for this session, as `extension api`, shared by every tab so each
   * is sent once.
   */
  reported?: Set<string>
  /** What needs a capability, by its name on `WindowParity`, as `canvas`. */
  surfaces?: Record<string, WindowSurface>
  /** How many failures in a tab stop a module there. 5 unless given. */
  failureLimit?: number
  /** The time, in milliseconds. `Date.now` unless given. */
  now?: () => number
}

/** One project tab's window modules. */
export interface WindowModules {
  /** The project's extensions changed, as the service sent them: activates and deactivates modules to match. */
  update(extensions: readonly WindowExtension[]): void
  /**
   * Runs a command a window module registered, giving back what its handler returned. `handled` is false when no
   * active module here registered it.
   */
  run(command: string, target?: CommandTarget): Promise<{ handled: boolean; result?: JsonValue }>
  /** Calls a function of what an extension's window module returned as `node`, for its Node half. */
  callFromNode(extension: string, method: string, args: JsonValue[]): Promise<JsonValue | undefined>
  /** Where each module is, by extension. */
  states(): Record<string, ModuleState>
  /** The tab closed: deactivates every module. */
  dispose(): Promise<void>
}

/** What a window module returned as `window`, for other window modules in its tab. */
type ModuleApi = NonNullable<Activated["window"]>

/** A command's handler, as `parity.commands.register` takes it. */
type CommandHandler = Parameters<WindowParity["commands"]["register"]>[1]

/** Why a module stopped, as `extension.deactivated` says. */
type Why = "turnedOff" | "tabClosed" | "setting" | "crashed"

/** An extension's window module in this tab. */
interface Entry {
  extension: WindowExtension
  state: ModuleState
  /** Its Node half's state, as its window module sees it. */
  half: HalfState
  failures: number
  /** Left off in this tab: it failed too often, or couldn't load or activate. */
  stopped: boolean
  /** Bumped each time it starts or stops, so a slow load or activation that's been overtaken stops there. */
  run: number
  began: number
  module?: WindowModule
  activated?: Activated
  subscriptions: Disposable[]
  hostListeners: Set<(state: HalfState) => void>
  settingListeners: Map<string, Set<(value: SettingValue) => void>>
  /** Who it watches come and go among the modules it builds on, by their ids. */
  watching: Map<string, { available: Set<(api: ModuleApi) => void>; gone: Set<() => void> }>
  /** Its made surfaces, by name. */
  surfaces: Map<string, object>
  /** `extension.halfUnavailable` sent this minute, for its sampling. */
  unavailable: { since: number; count: number }
  /**
   * Its activations and teardowns, one after another: an activation that's been overtaken finishes and tears itself
   * down before the next starts, so it never disposes of what its replacement set up.
   */
  settled: Promise<void>
}

const json: z.ZodType<JsonValue> = z.json()

/** One project tab's window modules. */
export function windowModules(options: WindowModulesOptions): WindowModules {
  const { tab } = options
  const limit = options.failureLimit ?? 5
  const now = options.now ?? (() => Date.now())
  const reported = options.reported ?? new Set<string>()
  const entries = new Map<string, Entry>()
  const commands = new Map<string, { entry: Entry; handler: CommandHandler }>()

  const logError = (entry: Entry, text: string, error: Error) => {
    options.log(entry.extension.id, "error", text, error.stack)
  }

  /** Counts a failure in a call core made into the module, and stops the module at the limit. */
  const fail = (entry: Entry, api: string, error: Error) => {
    entry.failures += 1
    const stopping = entry.failures >= limit && entry.state !== "inactive" && !entry.stopped
    const { message } = error
    logError(entry, `${api} failed: ${message}`, error)
    options.report?.(error, { extension: entry.extension.id, extension_half: "window", tab })
    options.record?.("extension.callFailed", {
      extension: entry.extension.id,
      api,
      failures: entry.failures,
      stopped: stopping,
      message,
      stack: error.stack
    })

    if (stopping) {
      entry.stopped = true
      options.record?.("extension.stoppedInTab", { extension: entry.extension.id, failures: entry.failures, message })
      options.stopped?.(entry.extension)
      void deactivate(entry, "crashed")
    }
  }

  /** Calls into the module for core, as a listener: a failure is counted and goes no further. */
  const guarded = (entry: Entry, api: string, call: () => void | Promise<void>) => {
    try {
      const result = call()

      if (result instanceof Promise) {
        result.catch((error) => fail(entry, api, errorOf(error)))
      }
    } catch (error) {
      fail(entry, api, errorOf(error))
    }
  }

  /** Calls into the module for someone waiting on the answer: a failure is counted, then given to them. */
  const answered = async <T>(entry: Entry, api: string, call: () => T | Promise<T>): Promise<T> => {
    try {
      return await call()
    } catch (error) {
      fail(entry, api, errorOf(error))
      throw error
    }
  }

  const halfUnavailable = (
    entry: Entry,
    from: "window" | "node",
    method: string,
    state: Exclude<HalfState, "ready">
  ) => {
    const at = now()

    if (at - entry.unavailable.since > 60_000) {
      entry.unavailable = { since: at, count: 0 }
    }

    entry.unavailable.count += 1

    // The first in a minute, then one in ten.
    if (entry.unavailable.count % 10 === 1) {
      options.record?.("extension.halfUnavailable", { extension: entry.extension.id, from, method, state })
    }
  }

  const hostLink = (entry: Entry): HostLink => {
    const call = async (method: string, args: JsonValue[]) => {
      const state: HalfState = entry.extension.node ? entry.half : "stopped"

      if (state !== "ready") {
        halfUnavailable(entry, "window", method, state)
        throw new HalfUnavailableError(state, "node")
      }

      return options.halves.call(entry.extension.id, method, args)
    }

    return {
      get state() {
        return entry.extension.node ? entry.half : "stopped"
      },
      api<Api extends ExtensionApi>(): RemoteApi<Api> {
        const methods = new Proxy(
          {},
          {
            // Not `then`, so awaiting the API itself doesn't call the Node half.
            get: (_target, method) =>
              method === "then" ? undefined : (...args: JsonValue[]) => call(String(method), args)
          }
        )

        // SAFETY: `Api` is the caller's word for what its Node half's `activate` returned; every name is a call to it.
        return methods as RemoteApi<Api>
      },
      onStateChange(listener) {
        entry.hostListeners.add(listener)

        return once(() => entry.hostListeners.delete(listener))
      }
    }
  }

  const declaredSetting = (entry: Entry, key: string) => {
    const scope = entry.extension.settingScopes[key]

    if (!scope) {
      throw new Error(`${key} isn't a setting the manifest declares`)
    }

    return scope
  }

  const parityFor = (entry: Entry): WindowParity => {
    const { extension } = entry

    const other = <Api extends object>(id: string): OtherWindowModule<Api> => {
      if (!extension.extensionDependencies.includes(id)) {
        throw new Error(`${id} isn't in the manifest's extensionDependencies`)
      }

      const watched = entry.watching.get(id) ?? { available: new Set(), gone: new Set() }
      entry.watching.set(id, watched)

      return {
        id,
        get api() {
          const found = entries.get(id)

          // SAFETY: `Api` is the caller's word for what that module returned as `window`.
          return found?.state === "active" ? (found.activated?.window as Api | undefined) : undefined
        },
        onAvailable(listener) {
          // SAFETY: as for `api`.
          const heard = listener as (api: ModuleApi) => void
          watched.available.add(heard)

          return once(() => watched.available.delete(heard))
        },
        onGone(listener) {
          watched.gone.add(listener)

          return once(() => watched.gone.delete(listener))
        }
      }
    }

    const parity: WindowParity = {
      extension: { id: extension.id, version: extension.version, displayName: extension.displayName },
      project: { root: options.project.root, name: options.project.name },
      tab,
      subscriptions: entry.subscriptions,
      commands: {
        register(id, handler) {
          if (!extension.commands.includes(id)) {
            throw new Error(`${id} isn't a command the manifest declares`)
          }

          if (commands.has(id)) {
            throw new Error(`${id} has a handler already`)
          }

          const registered = { entry, handler }
          commands.set(id, registered)

          return once(() => {
            if (commands.get(id) === registered) {
              commands.delete(id)
            }
          })
        },
        // One a window module in this tab registered runs here; any other goes to the window, which runs Parity's own
        // commands and sends other extensions' to the service.
        execute: async (command, target) => {
          const registered = commands.get(command)

          if (registered && registered.entry.state === "active") {
            await answered(registered.entry, `command:${command}`, () => registered.handler(target))

            return
          }

          await options.editor.execute(command, target)
        }
      },
      selection: {
        get: () => options.editor.selection.get(),
        set: (refs) => options.editor.selection.set(refs),
        highlight: (refs) => options.editor.selection.highlight(refs),
        onChange(listener) {
          return once(
            options.editor.selection.onChange((refs) => guarded(entry, "selection.onChange", () => listener(refs)))
          )
        }
      },
      navigate: {
        ...options.editor.navigate,
        openSettings: (id = extension.id) => options.editor.navigate.openSettings(id)
      },
      settings: {
        get<T extends SettingValue>(key: string): T {
          declaredSetting(entry, key)

          // SAFETY: the value read fits the setting's schema, which says its type; `T` is the caller's word for that type.
          return entry.extension.settings[key] as T
        },
        onChange<T extends SettingValue>(key: string, listener: (value: T) => void) {
          declaredSetting(entry, key)
          const listeners = entry.settingListeners.get(key) ?? new Set()
          entry.settingListeners.set(key, listeners)
          // SAFETY: as for `get`: each value sent for `key` fits its schema.
          const heard = listener as (value: SettingValue) => void
          listeners.add(heard)

          return once(() => listeners.delete(heard))
        },
        async update(key, value) {
          if (declaredSetting(entry, key) === "app") {
            throw new Error(`${key} is the person's, for every project, so only Settings changes it`)
          }

          await options.updateSetting(extension.id, key, value)
        }
      },
      log: {
        info: (message) => options.log(extension.id, "info", message),
        warn: (message) => options.log(extension.id, "warning", message),
        error: (message) =>
          message instanceof Error
            ? options.log(extension.id, "error", message.message, message.stack)
            : options.log(extension.id, "error", message)
      },
      host: hostLink(entry),
      extensions: { get: other }
    }

    // What needs a capability is checked as it's read, with a clear error naming what's missing.
    for (const [name, surface] of Object.entries(options.surfaces ?? {})) {
      Object.defineProperty(parity, name, {
        enumerable: false,
        get: () => {
          if (!extension.capabilities.includes(surface.capability)) {
            const seen = `${extension.id} parity.${name}`

            if (!reported.has(seen)) {
              reported.add(seen)
              options.record?.("extension.capabilityMissing", {
                extension: extension.id,
                capability: surface.capability,
                api: `parity.${name}`
              })
            }

            throw new CapabilityMissingError(extension.displayName, surface.capability, `parity.${name}`)
          }

          const made = entry.surfaces.get(name) ?? surface.make({ extension: extension.id, tab })
          entry.surfaces.set(name, made)

          return made
        }
      })
    }

    return parity
  }

  /** The activation event that holds for an extension now, if one does. */
  const triggerOf = (extension: WindowExtension) =>
    extension.activates.find((event) => {
      if (event === "onStartup") {
        return true
      }

      return event.startsWith("onSetting:") && extension.settings[event.slice("onSetting:".length)] === true
    })

  /** Runs work on an entry's module after whatever it's still doing: an activation, or a teardown. */
  const queued = (entry: Entry, work: () => Promise<void>) => {
    const next = entry.settled.then(work)
    entry.settled = next.catch(() => undefined)

    return next
  }

  const activate = (entry: Entry, trigger: string) => {
    const { extension } = entry
    entry.run += 1
    const run = entry.run
    entry.state = "loading"
    entry.began = now()
    entry.failures = 0

    if (extension.node) {
      options.halves.start(extension.id, trigger)
    }

    options.halves.state(extension.id, "starting")

    return queued(entry, () => activateRun(entry, trigger, run))
  }

  const activateRun = async (entry: Entry, trigger: string, run: number) => {
    const { extension } = entry

    // Turned off or stopped while an earlier run finished.
    if (entry.run !== run) {
      return
    }

    let module: WindowModule

    try {
      module = moduleOf(await options.load(extension.id))
    } catch (error) {
      if (entry.run === run) {
        failedToActivate(entry, "load", errorOf(error))
      }

      return
    }

    // Turned off or stopped while it loaded.
    if (entry.run !== run) {
      return
    }

    entry.module = module
    const parity = parityFor(entry)
    let activated: Activated

    try {
      activated = await module.activateWindow(parity)
    } catch (error) {
      if (entry.run === run) {
        failedToActivate(entry, "activate", errorOf(error))
      }

      // Overtaken or not, what it set up before it threw goes, before any run after it starts.
      await teardown(entry)

      return
    }

    if (entry.run !== run) {
      entry.activated = activated
      await teardown(entry)

      return
    }

    entry.activated = activated
    entry.state = "active"
    options.halves.state(extension.id, "ready")
    options.record?.("extension.activated", {
      extension: extension.id,
      version: extension.version,
      half: "window",
      internal: extension.internal,
      trigger,
      durationMs: now() - entry.began,
      capabilities: extension.capabilities
    })

    const api = activated.window

    if (api !== undefined) {
      for (const watcher of entries.values()) {
        for (const listener of watcher.watching.get(extension.id)?.available ?? []) {
          guarded(watcher, "extensions.onAvailable", () => listener(api))
        }
      }
    }
  }

  const failedToActivate = (entry: Entry, phase: "load" | "activate", error: Error) => {
    const { message } = error
    entry.state = "inactive"
    entry.stopped = true
    logError(entry, `Couldn't ${phase === "load" ? "load" : "activate"} its window module: ${message}`, error)
    options.report?.(error, { extension: entry.extension.id, extension_half: "window", tab })
    options.record?.("extension.activateFailed", {
      extension: entry.extension.id,
      half: "window",
      phase,
      message,
      stack: error.stack
    })
    options.halves.state(entry.extension.id, "stopped")
    options.stopped?.(entry.extension)
  }

  /** Disposes of what a module subscribed to, newest first, then calls its `deactivateWindow`. */
  const teardown = async (entry: Entry) => {
    for (const subscription of entry.subscriptions.toReversed()) {
      try {
        subscription.dispose()
      } catch (thrown) {
        const error = errorOf(thrown)
        logError(entry, `Disposing of a subscription failed: ${error.message}`, error)
      }
    }

    entry.subscriptions.length = 0

    try {
      await entry.module?.deactivateWindow?.()
    } catch (thrown) {
      const error = errorOf(thrown)
      logError(entry, `deactivateWindow failed: ${error.message}`, error)
    }

    for (const [id, registered] of commands) {
      if (registered.entry === entry) {
        commands.delete(id)
      }
    }

    entry.hostListeners.clear()
    entry.settingListeners.clear()
    entry.watching.clear()
    entry.surfaces.clear()
    delete entry.module
    delete entry.activated
  }

  const deactivate = async (entry: Entry, why: Why) => {
    const was = entry.state

    if (was === "inactive") {
      return
    }

    entry.run += 1
    entry.state = "inactive"
    options.halves.state(entry.extension.id, "stopped")

    if (was !== "active") {
      return
    }

    await queued(entry, async () => {
      const hadApi = entry.activated?.window !== undefined
      await teardown(entry)
      options.record?.("extension.deactivated", {
        extension: entry.extension.id,
        half: "window",
        why,
        uptimeMs: now() - entry.began
      })

      if (hadApi) {
        for (const watcher of entries.values()) {
          for (const listener of watcher.watching.get(entry.extension.id)?.gone ?? []) {
            guarded(watcher, "extensions.onGone", () => listener())
          }
        }
      }
    })
  }

  /** The Node half's state as its window module sees it: starting again once it has been ready is restarting. */
  const halfOf = (host: HostState, before: HalfState): HalfState => {
    switch (host) {
      case "waiting":
      case "starting":
        return before === "ready" || before === "restarting" ? "restarting" : "starting"
      case "running":
        return "ready"
      case "stuck":
        return "restarting"
      case "crashed":
        return "stopped"
    }
  }

  /** Brings an entry up to date with what the service sent, telling the module what changed. */
  const refresh = (entry: Entry, extension: WindowExtension) => {
    const before = entry.extension
    entry.extension = extension
    const half = halfOf(extension.host, entry.half)

    if (entry.state === "active") {
      for (const [key, value] of Object.entries(extension.settings)) {
        if (before.settings[key] !== value) {
          for (const listener of entry.settingListeners.get(key) ?? []) {
            guarded(entry, `settings.onChange:${key}`, () => listener(value))
          }
        }
      }
    }

    if (half !== entry.half) {
      entry.half = half

      // A Node half that stopped for good, after crashing three times in a row, stops its window module too.
      if (half === "stopped" && extension.node) {
        void deactivate(entry, "crashed")
      } else if (entry.state === "active") {
        for (const listener of entry.hostListeners) {
          guarded(entry, "host.onStateChange", () => listener(half))
        }
      }
    }
  }

  return {
    update(extensions) {
      const given = new Map(
        extensions.filter((extension) => extension.internal && extension.window).map((each) => [each.id, each])
      )

      for (const [id, entry] of entries) {
        if (!given.has(id)) {
          entries.delete(id)
          void deactivate(entry, "turnedOff")
        }
      }

      for (const extension of given.values()) {
        const known = entries.get(extension.id)

        if (known) {
          refresh(known, extension)
        } else {
          entries.set(extension.id, {
            extension,
            state: "inactive",
            half: halfOf(extension.host, "starting"),
            failures: 0,
            stopped: false,
            run: 0,
            began: 0,
            subscriptions: [],
            hostListeners: new Set(),
            settingListeners: new Map(),
            watching: new Map(),
            surfaces: new Map(),
            unavailable: { since: 0, count: 0 },
            settled: Promise.resolve()
          })
        }
      }

      for (const entry of entries.values()) {
        const trigger = triggerOf(entry.extension)
        const halfGone = entry.extension.node && entry.half === "stopped"
        const wanted = trigger !== undefined && !entry.stopped && !halfGone

        if (wanted && entry.state === "inactive") {
          void activate(entry, trigger)
        } else if (!wanted && entry.state !== "inactive" && trigger === undefined) {
          void deactivate(entry, "setting")
        }
      }
    },
    async run(command, target) {
      const registered = commands.get(command)

      if (!registered || registered.entry.state !== "active") {
        return { handled: false }
      }

      const value = await answered(registered.entry, `command:${command}`, () => registered.handler(target))
      const result = value === undefined ? undefined : json.parse(value)

      return result === undefined ? { handled: true } : { handled: true, result }
    },
    async callFromNode(extension, method, args) {
      const entry = entries.get(extension)

      if (!entry || entry.state !== "active") {
        const state = entry?.state === "loading" ? "starting" : "stopped"

        if (entry) {
          halfUnavailable(entry, "node", method, state)
        }

        throw new HalfUnavailableError(state, "window")
      }

      const api = entry.activated?.node
      const found = api !== undefined && Object.hasOwn(api, method) ? api[method] : undefined

      if (!(found instanceof Function)) {
        throw new Error(`${entry.extension.displayName}'s window module has no ${method} for its Node half`)
      }

      // SAFETY: an API's functions take JSON, as `ExtensionApi` says; `never` only lets each name the types it takes.
      const call = found as (...given: JsonValue[]) => void | JsonValue | Promise<void | JsonValue>
      const value = await answered(entry, `node.${method}`, () => call.apply(api, args))

      // It's the module's own code, so what it gave is checked as JSON before it crosses to the Node half.
      return value === undefined ? undefined : json.parse(value)
    },
    states() {
      return Object.fromEntries([...entries].map(([id, entry]) => [id, entry.state]))
    },
    async dispose() {
      const all = [...entries.values()]
      entries.clear()
      await Promise.all(all.map((entry) => deactivate(entry, "tabClosed")))
    }
  }
}

/**
 * A window module from what its file exports, as `export default defineWindowModule(…)` or as named exports: its
 * `activateWindow`, and its `deactivateWindow` if it has one.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a module can export anything; this is where it's checked
function moduleOf(loaded: unknown): WindowModule {
  const exports = isObject(loaded) && "default" in loaded && isObject(loaded.default) ? loaded.default : loaded

  if (!isObject(exports) || !("activateWindow" in exports) || !(exports.activateWindow instanceof Function)) {
    throw new Error("Its window module doesn't export activateWindow")
  }

  const { activateWindow } = exports

  const module: WindowModule = {
    activateWindow: async (parity) => activatedOf(await activateWindow.call(exports, parity))
  }

  if ("deactivateWindow" in exports && exports.deactivateWindow instanceof Function) {
    const { deactivateWindow } = exports
    module.deactivateWindow = async () => {
      await deactivateWindow.call(exports)
    }
  }

  return module
}

/** What `activateWindow` returned: its API for other window modules, and its API for its Node half, when it gave them. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a module's code can return anything; this is where it's checked
function activatedOf(returned: unknown): Activated {
  const activated: Activated = {}

  if (isObject(returned) && "window" in returned && isObject(returned.window)) {
    activated.window = returned.window
  }

  if (isObject(returned) && "node" in returned && isObject(returned.node)) {
    // SAFETY: what it returned as `node` is its API for its Node half, whose functions take and give JSON; each call's
    // answer is checked as JSON before it's sent.
    activated.node = returned.node as ExtensionApi
  }

  return activated
}

function isObject(value: unknown): value is object {
  return Object(value) === value
}

/** What was thrown, as an error: JavaScript can throw anything. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript can throw anything
function errorOf(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown))
}

function once(dispose: () => void): Disposable {
  let done = false

  return {
    dispose() {
      if (!done) {
        done = true
        dispose()
      }
    }
  }
}
