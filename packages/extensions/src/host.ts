import { createChannel, type Port } from "@parity-app/channel"
import type {
  CommandTarget,
  Disposable,
  ExtensionModule,
  NodeRef,
  Parity,
  PickItem,
  SettingValue,
  State,
  StatusItem
} from "@parity-app/extension-api"
import { type HostProcesses, hostProcesses } from "./host-processes.ts"
import type { ActivateParams, HostMethods, HostServiceMethods, NavigateTo } from "./protocol.ts"
import { type Form, viewsOf } from "./views.ts"

/*
 * The host's side: the code that runs in an extension's own process, for one open project. It loads the extension's
 * module, gives its `activate` a `Parity` object whose calls go to the project service, runs its commands, and answers
 * the service's pings, which go unanswered while the extension's code keeps the process busy. Nothing here knows Node:
 * the host's script gives it a port, a way to load a module and a way to end the process.
 */

/** What the host's process does for this code. */
export interface HostSide {
  /** Its end of the IPC channel to the project service. */
  port: Port
  /** Loads the extension's module from an absolute path. */
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- an extension's module can export anything; it's checked below
  load(main: string): Promise<unknown>
  /** Ends the process. */
  exit(): void
  /** The memory the process holds, in bytes, which the Extensions page shows. */
  memory?(): number
}

/** The host's link to the service, which its script uses to send what the extension's code prints to the log. */
export interface ExtensionHost {
  log(level: "info" | "warning" | "error", text: string, stack?: string): void
}

type CommandHandler = (target: CommandTarget | undefined) => void | Promise<void>

/** What's selected in the window, as the host keeps it for `parity.selection`, and who's told when it changes. */
interface Selected {
  refs: NodeRef[]
  listeners: Set<(refs: NodeRef[]) => void>
}

/** The extension's settings as the host keeps them, and who listens for each to change. */
interface HostSettings {
  values: Map<string, SettingValue>
  listeners: Map<string, Set<(value: SettingValue) => void>>
}

interface Activated {
  handlers: Map<string, CommandHandler>
  forms: Map<string, Form>
  subscriptions: Disposable[]
  module: ExtensionModule
}

/** Serves the project service from an extension's host, until it's told to stop. */
export function serveExtensionHost(side: HostSide): ExtensionHost {
  const channel = createChannel<HostMethods, HostServiceMethods>()
  const progress = new Map<number, AbortController>()
  const selected: Selected = { refs: [], listeners: new Set() }
  const settings: HostSettings = { values: new Map(), listeners: new Map() }
  const processes = hostProcesses()
  let activated: Promise<Activated> | undefined
  let stopping = false

  const log = (level: "info" | "warning" | "error", text: string, stack?: string) => {
    const line: HostServiceMethods["log"]["params"] = { level, text }

    if (stack !== undefined) {
      line.stack = stack
    }

    void channel.request("log", line).catch(() => undefined)
  }

  channel.serve({
    async activate(params) {
      if (activated) {
        throw new Error("The extension has activated already")
      }

      selected.refs = params.selection
      settings.values = new Map(Object.entries(params.settings.values))
      processes.begin(params.extension.id, params.processes.list, params.processes.output)
      activated = activate(params, channel, progress, selected, settings, side, processes)
      await activated
    },
    async run({ command, target }) {
      if (!activated) {
        throw new Error("The extension hasn't activated")
      }

      const handler = (await activated).handlers.get(command)

      if (!handler) {
        throw new Error(`Nothing handles ${command}. Its extension registers it with parity.commands.register.`)
      }

      await handler(target)
    },
    async "view.changed"({ view, key, value }) {
      if (!activated) {
        throw new Error("The extension hasn't activated")
      }

      const form = (await activated).forms.get(view)

      if (!form) {
        throw new Error(`${view} isn't a form the extension filled`)
      }

      form.changed(key, value)
    },
    ping: () => (side.memory ? { memory: side.memory() } : undefined),
    "settings.changed"({ values }) {
      for (const [key, value] of Object.entries(values)) {
        if (settings.values.get(key) === value) {
          continue
        }

        settings.values.set(key, value)

        for (const listener of settings.listeners.get(key) ?? []) {
          try {
            listener(value)
          } catch (error) {
            log("error", `A listener for ${key} failed: ${message(error)}`, stackOf(error))
          }
        }
      }
    },
    cancel({ progress: id }) {
      progress.get(id)?.abort()
    },
    "selection.changed"({ refs }) {
      selected.refs = refs

      for (const listener of selected.listeners) {
        try {
          listener(refs)
        } catch (error) {
          log("error", `A selection listener failed: ${message(error)}`, stackOf(error))
        }
      }
    },
    "processes.changed": ({ processes: changed }) => processes.changed(changed),
    "processes.lines": ({ id, lines }) => processes.lines(id, lines),
    "processes.ended": ({ id, end }) => processes.ended(id, end),
    async stop() {
      if (stopping) {
        return
      }

      stopping = true

      try {
        const running = await activated?.catch(() => undefined)

        if (running) {
          await deactivate(running, log)
        }
      } finally {
        side.exit()
      }
    }
  })

  channel.connect(side.port)

  return { log }
}

/** Loads the extension's module and calls its `activate`. */
async function activate(
  params: ActivateParams,
  channel: ReturnType<typeof createChannel<HostMethods, HostServiceMethods>>,
  progress: Map<number, AbortController>,
  selected: Selected,
  settings: HostSettings,
  side: HostSide,
  processes: HostProcesses
): Promise<Activated> {
  const exports = await side.load(params.main)

  if (!isModule(exports)) {
    throw new Error(`${params.main} doesn't export an activate function`)
  }

  const handlers = new Map<string, CommandHandler>()
  const subscriptions: Disposable[] = []
  const { prefix } = params.extension
  const declaredCommands = new Set(params.commands)
  const declaredItems = new Set(params.statusItems)
  const forms = new Map<string, Form>()

  const send = <M extends keyof HostServiceMethods>(method: M, value: HostServiceMethods[M]["params"]) =>
    channel.request(method, value)

  const quietly = <M extends keyof HostServiceMethods>(method: M, value: HostServiceMethods[M]["params"]) =>
    void send(method, value).catch(() => undefined)

  let nextProgress = 1

  const go = async (to: NavigateTo) => {
    await send("navigate", to)
  }

  const state = (scope: "app" | "project"): State => {
    const values = new Map(Object.entries(params.state[scope]))

    return {
      get: (key) => values.get(key),
      keys: () => [...values.keys()],
      async update(key, value) {
        if (value === undefined) {
          values.delete(key)
          await send("state.update", { scope, key })
        } else {
          values.set(key, value)
          await send("state.update", { scope, key, value })
        }
      }
    }
  }

  const { scopes } = params.settings

  const declaredSetting = (key: string) => {
    const scope = scopes[key]

    if (!scope) {
      throw new Error(`${key} isn't a setting the manifest declares`)
    }

    return scope
  }

  const views = viewsOf(params.views, declaredCommands, forms, {
    send: (id, data) => quietly("view.set", { id, data }),
    clear: (id) => quietly("view.clear", { id }),
    reveal: (id) => send("view.reveal", { id })
  })

  const parity: Parity = {
    views,
    extension: {
      id: params.extension.id,
      version: params.extension.version,
      displayName: params.extension.displayName
    },
    project: { root: params.project.root, name: params.project.name, detected: params.project.detected },
    subscriptions,
    commands: {
      register(id, handler) {
        if (!declaredCommands.has(id)) {
          throw new Error(`${id} isn't a command the manifest declares`)
        }

        if (handlers.has(id)) {
          throw new Error(`${id} has a handler already`)
        }

        handlers.set(id, handler)

        return once(() => {
          if (handlers.get(id) === handler) {
            handlers.delete(id)
          }
        })
      },
      execute: (command, target) => send("commands.execute", target ? { command, target } : { command })
    },
    selection: {
      get: () => [...selected.refs],
      set: (refs) => send("selection.set", { refs }),
      highlight: (refs) => send("selection.highlight", { refs }),
      onChange(listener) {
        selected.listeners.add(listener)

        return once(() => selected.listeners.delete(listener))
      }
    },
    navigate: {
      reveal: (ref) => go({ kind: "reveal", ref }),
      zoomTo: (ref) => go({ kind: "zoomTo", ref }),
      openDesign: (key) => go({ kind: "openDesign", key }),
      setMode: (mode) => go({ kind: "setMode", mode }),
      setState: (design, state) => go({ kind: "setState", design, state }),
      showTab: (id) => go({ kind: "showTab", id }),
      openSettings: (id = params.extension.id) => go({ kind: "openSettings", id }),
      pageUrl: async (ref) => (await send("navigate", { kind: "pageUrl", ref })).url
    },
    context: {
      set(key, value) {
        if (!key.startsWith(`${prefix}.`)) {
          throw new Error(`Context key ${key} must start with "${prefix}."`)
        }

        quietly("context.set", { key, value })
      }
    },
    facts: {
      set: (target, facts) => quietly("facts.set", { target, facts })
    },
    status: {
      item(id): StatusItem {
        if (!declaredItems.has(id)) {
          throw new Error(`${id} isn't a status item the manifest declares`)
        }

        let disposed = false

        return {
          set(update) {
            if (!disposed) {
              quietly("status.set", { id, ...update })
            }
          },
          dispose() {
            if (!disposed) {
              disposed = true
              quietly("status.remove", { id })
            }
          }
        }
      }
    },
    processes: processes.api(send, (text) => quietly("log", { level: "error", text })),
    servers: {
      routed: () => send("servers.routed", undefined)
    },
    edits: {
      transact: (label, operations) => send("edits.transact", { label, operations })
    },
    files: {
      async edit(label, files) {
        const { paths } = await send("files.edit", { label, files })

        return paths
      }
    },
    ui: {
      async notify(message, options = {}) {
        const { action } = await send("ui.notify", { message, ...options })

        return action
      },
      async pick<T extends PickItem>(items: T[], options: { title?: string; placeholder?: string } = {}) {
        const plain = items.map(({ label, detail }) => (detail === undefined ? { label } : { label, detail }))
        const { index } = await send("ui.pick", { items: plain, ...options })

        return index === undefined ? undefined : items[index]
      },
      async input(title, options = {}) {
        const { value } = await send("ui.input", { title, ...options })

        return value
      },
      async confirm(message, options = {}) {
        const { confirmed } = await send("ui.confirm", { message, ...options })

        return confirmed
      },
      open: (url, options = {}) => send("ui.open", options.where ? { url, where: options.where } : { url }),
      async progress(title, task) {
        const id = nextProgress++
        const controller = new AbortController()
        progress.set(id, controller)
        quietly("ui.progress", { id, title })

        try {
          return await task({
            report: (detail) => quietly("ui.progress", { id, detail }),
            signal: controller.signal
          })
        } finally {
          progress.delete(id)
          quietly("ui.progress", { id, done: true })
        }
      }
    },
    settings: {
      get<T extends SettingValue>(key: string): T {
        declaredSetting(key)

        // SAFETY: the value read fits the setting's schema, which says its type; `T` is the caller's word for that type.
        return settings.values.get(key) as T
      },
      onChange<T extends SettingValue>(key: string, listener: (value: T) => void) {
        declaredSetting(key)
        const listeners = settings.listeners.get(key) ?? new Set()
        settings.listeners.set(key, listeners)
        // SAFETY: as for `get`: each value sent for `key` fits its schema.
        const heard = listener as (value: SettingValue) => void
        listeners.add(heard)

        return once(() => listeners.delete(heard))
      },
      async update(key, value) {
        if (declaredSetting(key) === "app") {
          throw new Error(`${key} is the person's, for every project, so only Settings changes it`)
        }

        await send("settings.update", value === undefined ? { key } : { key, value })
      }
    },
    state: { app: state("app"), project: state("project") },
    log: {
      info: (message) => quietly("log", { level: "info", text: message }),
      warn: (message) => quietly("log", { level: "warning", text: message }),
      error(message) {
        if (message instanceof Error) {
          const line: HostServiceMethods["log"]["params"] = { level: "error", text: message.message }

          if (message.stack) {
            line.stack = message.stack
          }

          quietly("log", line)
        } else {
          quietly("log", { level: "error", text: message })
        }
      }
    }
  }

  await exports.activate(parity)

  return { handlers, forms, subscriptions, module: exports }
}

/** Disposes of what the extension added to `parity.subscriptions`, newest first, then calls its `deactivate`. */
async function deactivate(
  { subscriptions, module }: Activated,
  log: (level: "error", text: string, stack?: string) => void
): Promise<void> {
  for (const subscription of subscriptions.toReversed()) {
    try {
      subscription.dispose()
    } catch (error) {
      log("error", `A subscription failed to dispose: ${message(error)}`, stackOf(error))
    }
  }

  try {
    await module.deactivate?.()
  } catch (error) {
    log("error", `deactivate failed: ${message(error)}`, stackOf(error))
  }
}

/** A disposable that runs `dispose` the first time only. */
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

/** Whether a value is an object, a module namespace among them, which has no prototype and so isn't an `Object`. */
function isObject(value: unknown): value is object {
  return Object(value) === value
}

/** Whether a module's exports have an `activate` function. An extension's module can export anything. */
function isModule(exports: unknown): exports is ExtensionModule {
  return (
    isObject(exports) &&
    "activate" in exports &&
    exports.activate instanceof Function &&
    (!("deactivate" in exports) || exports.deactivate === undefined || exports.deactivate instanceof Function)
  )
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript can throw anything
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript can throw anything
function stackOf(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}
