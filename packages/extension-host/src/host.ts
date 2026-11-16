import { createChannel, type Port } from "@parity-app/channel"
import type {
  AgentToolInput,
  CommandTarget,
  Disposable,
  ExtensionApi,
  ExtensionModule,
  JsonValue,
  NodeRef,
  Parity,
  PickItem,
  Route,
  ProviderHandle,
  ProviderKinds,
  RemoteApi,
  SettingValue,
  State,
  StatusItem
} from "@parity-app/extension"
import { type HostFiles, hostFiles } from "./host-files.ts"
import { type HostProcesses, hostProcesses } from "./host-processes.ts"
import type {
  ActivateParams,
  HostMethods,
  HostServiceMethods,
  NavigateTo,
  ProviderAnswer,
  ProviderCall,
  ProviderKind,
  Returned
} from "./protocol.ts"
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
  /**
   * Carries the id of the agent's call that ran the extension's code through that code, across its awaits, as Node's
   * `AsyncLocalStorage` does. Without it, nothing the code asks says which agent's call it's part of.
   */
  calls?: CallContext
}

/** Carries a value through code and everything it awaits. */
export interface CallContext {
  run<T>(call: number | undefined, task: () => T): T
  current(): number | undefined
}

/** For a host that can't carry calls through code: none is ever current. */
const noCalls: CallContext = { run: (_call, task) => task(), current: () => undefined }

/** What the host sends with the id of the agent's call it's part of. */
const called = new Set<keyof HostServiceMethods>([
  "commands.execute",
  "edits.transact",
  "files.edit",
  "ui.pick",
  "ui.input",
  "ui.confirm",
  "extensions.call"
])

/** The host's link to the service, which its script uses to send what the extension's code prints to the log. */
export interface ExtensionHost {
  log(level: "info" | "warning" | "error", text: string, stack?: string): void
}

type CommandHandler = (target: CommandTarget | undefined) => void | JsonValue | Promise<void | JsonValue>

type ToolHandler = (input: AgentToolInput) => void | JsonValue | Promise<void | JsonValue>

/** What's selected in the window, as the host keeps it for `parity.selection`, and who's told when it changes. */
interface Selected {
  refs: NodeRef[]
  listeners: Set<(refs: NodeRef[]) => void>
}

/** The person's marks on the app's routes, as the host keeps them for `parity.routes`, and who's told when they change. */
interface Marks {
  marks: Record<string, "api" | "page">
  listeners: Set<() => void>
}

/** The extension's settings as the host keeps them, and who listens for each to change. */
interface HostSettings {
  values: Map<string, SettingValue>
  listeners: Map<string, Set<(value: SettingValue) => void>>
}

/** The providers an extension's code registered, by kind. */
type Registered = { [K in ProviderKind]?: ProviderKinds[K] }

interface Activated {
  handlers: Map<string, CommandHandler>
  providers: Registered
  forms: Map<string, Form>
  tools: Map<string, ToolHandler>
  subscriptions: Disposable[]
  module: ExtensionModule
  /** What its `activate` returned, for extensions that build on it. */
  api: ExtensionApi
}

/** Serves the project service from an extension's host, until it's told to stop. */
export function serveExtensionHost(side: HostSide): ExtensionHost {
  const channel = createChannel<HostMethods, HostServiceMethods>()
  const progress = new Map<number, AbortController>()
  const selected: Selected = { refs: [], listeners: new Set() }
  const marks: Marks = { marks: {}, listeners: new Set() }
  const settings: HostSettings = { values: new Map(), listeners: new Map() }
  const processes = hostProcesses()
  const files = hostFiles()
  const calls = side.calls ?? noCalls
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
      marks.marks = params.routeMarks
      settings.values = new Map(Object.entries(params.settings.values))
      processes.begin(params.extension.id, params.processes)
      activated = calls.run(params.call, () =>
        activate(params, channel, progress, selected, settings, side, calls, { processes, files, marks })
      )
      const { api } = await activated

      return { api: Object.keys(api) }
    },
    async run({ command, target, call }) {
      if (!activated) {
        throw new Error("The extension hasn't activated")
      }

      const handler = (await activated).handlers.get(command)

      if (!handler) {
        throw new Error(`Nothing handles ${command}. Its extension registers it with parity.commands.register.`)
      }

      return returned(await calls.run(call, () => handler(target)))
    },
    async tool({ name, input, call }) {
      if (!activated) {
        throw new Error("The extension hasn't activated")
      }

      const handler = (await activated).tools.get(name)

      if (!handler) {
        throw new Error(`Nothing handles ${name}. Its extension registers it with parity.agentTools.register.`)
      }

      return returned(await calls.run(call, () => handler(input)))
    },
    async "api.call"({ method, args, call }) {
      if (!activated) {
        throw new Error("The extension hasn't activated")
      }

      const { api } = await activated
      const found = Object.hasOwn(api, method) ? api[method] : undefined

      if (!found) {
        throw new Error(`Its API has no ${method}`)
      }

      // SAFETY: an API's functions take JSON, as `ExtensionApi` says; `never` only lets each name the types it takes.
      const run = found as (...given: JsonValue[]) => void | JsonValue | Promise<void | JsonValue>

      return returned(await calls.run(call, () => run(...args)))
    },
    async provide(call) {
      if (!activated) {
        throw new Error("The extension hasn't activated")
      }

      const { router, styles, renderer, builder, entities, addresses, discovery } = (await activated).providers

      const missing = (): never => {
        throw new Error(`No ${call.kind} is registered. Its extension registers one with parity.providers.register.`)
      }

      switch (call.kind) {
        case "router":
          return await (router ?? missing()).routes()
        case "styles":
          return await callStyles(styles ?? missing(), call)
        case "renderer":
          return await callRenderer(renderer ?? missing(), call)
        case "builder":
          return await callBuilder(builder ?? missing(), call)
        case "entities":
          return await callEntities(entities ?? missing(), call)
        case "addresses":
          return await (addresses ?? missing()).addresses(call.params)
        case "discovery":
          return await (discovery ?? missing()).discover(call.params)
      }
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
    "routes.changed"({ marks: changed }) {
      marks.marks = changed

      for (const listener of marks.listeners) {
        try {
          listener()
        } catch (error) {
          log("error", `A routes listener failed: ${message(error)}`, stackOf(error))
        }
      }
    },
    "processes.changed": ({ processes: changed }) => processes.changed(changed),
    "processes.lines": ({ id, run, lines }) => processes.lines(id, lines, run),
    "processes.ended": ({ id, end }) => processes.ended(id, end),
    "files.changed"({ id }) {
      files.changed(id)
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
  selected: Selected,
  settings: HostSettings,
  side: HostSide,
  calls: CallContext,
  { processes, files, marks }: { processes: HostProcesses; files: HostFiles; marks: Marks }
): Promise<Activated> {
  const exports = extensionOf(await side.load(params.main))

  if (!exports) {
    throw new Error(`${params.main} doesn't export an extension: export default defineExtension({ activate })`)
  }

  const handlers = new Map<string, CommandHandler>()
  const providers: Registered = {}
  const declaredProviders = new Set<ProviderKind>(params.providers)
  const tools = new Map<string, ToolHandler>()
  const declaredTools = new Set(params.agentTools ?? [])
  const dependencies = new Map((params.dependencies ?? []).map((dependency) => [dependency.id, dependency]))
  const subscriptions: Disposable[] = []
  const { prefix } = params.extension
  const declaredCommands = new Set(params.commands)
  const declaredItems = new Set(params.statusItems)
  const forms = new Map<string, Form>()

  // What the code asks during an agent's call says which call, for the service to name or refuse.
  const send = <M extends keyof HostServiceMethods>(method: M, value: HostServiceMethods[M]["params"]) => {
    const call = called.has(method) ? calls.current() : undefined

    return channel.request(method, call === undefined ? value : { ...value, call })
  }

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
    routes: {
      marked: (routes) => routes.map((route) => markedRoute(route, marks.marks[route.id])),
      onChange(listener) {
        marks.listeners.add(listener)

        return once(() => marks.listeners.delete(listener))
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
    edits: {
      transact: (label, operations) => send("edits.transact", { label, operations })
    },
    files: {
      async edit(label, edits) {
        const { paths } = await send("files.edit", { label, files: edits })

        return paths
      },
      ...files.api(send, (text) => quietly("log", { level: "error", text }))
    },
    providers: {
      register(kind, provider) {
        if (!declaredProviders.has(kind)) {
          throw new Error(`The manifest's providers don't name ${kind}`)
        }

        if (providers[kind]) {
          throw new Error(`A ${kind} is registered already`)
        }

        // `provider` is what `kind` registers, as `register`'s type says, which an index can't tell TypeScript.
        Object.assign(providers, { [kind]: provider })

        const registered: HostServiceMethods["providers.register"]["params"] = { kind }

        if ("maxAgeMs" in provider && provider.maxAgeMs !== undefined) {
          registered.maxAgeMs = provider.maxAgeMs
        }

        quietly("providers.register", registered)

        const disposal = once(() => {
          if (providers[kind] === provider) {
            delete providers[kind]
            quietly("providers.dispose", { kind })
          }
        })

        const handle: ProviderHandle = {
          changed() {
            if (providers[kind] === provider) {
              quietly("providers.changed", { kind })
            }
          },
          dispose: () => disposal.dispose()
        }

        return handle
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
    extensions: {
      get<Api extends object>(id: string) {
        const dependency = dependencies.get(id)

        if (!dependency) {
          throw new Error(`${id} isn't in the manifest's extensionDependencies`)
        }

        const api = Object.fromEntries(
          dependency.api.map((method) => [
            method,
            async (...args: JsonValue[]) => {
              const { result } = await send("extensions.call", { extension: id, method, args })

              return result
            }
          ])
        )

        // SAFETY: `Api` is the caller's word for the dependency's API, whose methods are these, each a call to it.
        return { id, version: dependency.version, displayName: dependency.displayName, api: api as RemoteApi<Api> }
      }
    },
    agentTools: {
      register(name, handler) {
        if (!declaredTools.has(name)) {
          throw new Error(`${name} isn't an agent tool the manifest declares`)
        }

        if (tools.has(name)) {
          throw new Error(`${name} has a handler already`)
        }

        tools.set(name, handler)

        return once(() => {
          if (tools.get(name) === handler) {
            tools.delete(name)
          }
        })
      }
    },
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

  const api = apiOf(await exports.activate(parity))

  return { handlers, providers, forms, tools, subscriptions, module: exports, api }
}

/** Reads which components each file in a batch exports, with the renderer the extension registered. */
async function callRenderer(
  renderer: ProviderKinds["renderer"],
  call: Extract<ProviderCall, { kind: "renderer" }>
): Promise<ProviderAnswer> {
  return renderer.components(call.params)
}

/**
 * Asks the builder the extension registered whether the project's own build tool serves it, or which global stylesheets
 * the app loads. A builder that can't say which stylesheets fails the call, so Parity knows it didn't answer.
 */
async function callBuilder(
  builder: ProviderKinds["builder"],
  call: Extract<ProviderCall, { kind: "builder" }>
): Promise<ProviderAnswer> {
  if (call.method === "detect") {
    return builder.detect()
  }

  if (!builder.styles) {
    throw new Error("The builder doesn't say which stylesheets the app loads")
  }

  return builder.styles()
}

/** Calls the method an entities call names on the entities provider the extension registered. */
async function callEntities(
  entities: ProviderKinds["entities"],
  call: Extract<ProviderCall, { kind: "entities" }>
): Promise<ProviderAnswer> {
  // SAFETY: the service reads what import answers through its schema, designs and all, before it uses it.
  return call.method === "import"
    ? ((await entities.import(call.params)) as ProviderAnswer)
    : entities.export(call.params)
}

/** Calls the method a styles provider call names on the styling framework the extension registered. */
async function callStyles(
  styles: ProviderKinds["styles"],
  call: Extract<ProviderCall, { kind: "styles" }>
): Promise<ProviderAnswer> {
  switch (call.method) {
    case "handles":
      return styles.handles(call.params)
    case "theme":
      return styles.theme(call.params)
    case "classes":
      return styles.classes(call.params)
    case "writeTokens":
      return styles.writeTokens(call.params)
  }
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

/** What an extension's code returned, as the service is sent it. */
function returned(value: void | JsonValue): Returned {
  return value === undefined ? {} : { result: value }
}

/** An extension's API: the functions of what its `activate` returned, if it returned an object. */
function apiOf(value: void | ExtensionApi): ExtensionApi {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, method]) => method instanceof Function))
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

/** The extension a module exports as its default, as `defineExtension` makes it. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a module can export anything
function extensionOf(exports: unknown): ExtensionModule | undefined {
  return isObject(exports) && "default" in exports && isModule(exports.default) ? exports.default : undefined
}

/** Whether a value has an `activate` function, as an extension does. */
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

/** A route as the person marked it: a page as an API route, or an API route as a page. Other marks change nothing. */
function markedRoute(route: Route, mark: "api" | "page" | undefined): Route {
  return mark !== undefined && route.kind !== mark && (route.kind === "page" || route.kind === "api")
    ? { ...route, kind: mark }
    : route
}
