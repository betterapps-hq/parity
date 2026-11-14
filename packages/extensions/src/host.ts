import { createChannel, type Port } from "@parity-app/channel"
import type {
  CommandTarget,
  Disposable,
  ExtensionModule,
  Parity,
  PickItem,
  State,
  StatusItem
} from "@parity-app/extension-api"
import type { ActivateParams, HostMethods, HostServiceMethods } from "./protocol.ts"

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
}

/** The host's link to the service, which its script uses to send what the extension's code prints to the log. */
export interface ExtensionHost {
  log(level: "info" | "warning" | "error", text: string, stack?: string): void
}

type CommandHandler = (target: CommandTarget | undefined) => void | Promise<void>

interface Activated {
  handlers: Map<string, CommandHandler>
  subscriptions: Disposable[]
  module: ExtensionModule
}

/** Serves the project service from an extension's host, until it's told to stop. */
export function serveExtensionHost(side: HostSide): ExtensionHost {
  const channel = createChannel<HostMethods, HostServiceMethods>()
  const progress = new Map<number, AbortController>()
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

      activated = activate(params, channel, progress, side)
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
    ping: () => undefined,
    cancel({ progress: id }) {
      progress.get(id)?.abort()
    },
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
  side: HostSide
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

  const send = <M extends keyof HostServiceMethods>(method: M, value: HostServiceMethods[M]["params"]) =>
    channel.request(method, value)

  const quietly = <M extends keyof HostServiceMethods>(method: M, value: HostServiceMethods[M]["params"]) =>
    void send(method, value).catch(() => undefined)

  let nextProgress = 1

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

  const parity: Parity = {
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
      }
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
    servers: {
      serve: (server) => send("servers.serve", server),
      adopt: (server) => quietly("servers.adopt", server),
      stop: (id) => quietly("servers.stop", { id }),
      routed: () => send("servers.routed", undefined)
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
      open: (url) => send("ui.open", { url }),
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

  return { handlers, subscriptions, module: exports }
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
