import type { Checks } from "@parity-app/channel"
import { containerSpec, parseData, type RouteMark } from "@parity-app/core"
import type {
  Candidate,
  CommandTarget,
  ComponentTarget,
  DesignOperation,
  DiscoveredServer,
  Endpoint,
  Fact,
  FileEdit,
  FindQuery,
  JsonValue,
  NodeRef,
  OpenWhere,
  PickItem,
  AppStyles,
  BuilderDetection,
  ComponentExport,
  Design,
  FileWrite,
  ImportedScreen,
  ProjectComponents,
  CssDeclaration,
  ProcessEnd,
  ProcessInfo,
  ProcessSpec,
  ProvidedAddress,
  ProviderKinds,
  SourceFile,
  Route,
  RouteSegment,
  ServerFacts,
  ThemeVariable,
  TokenWrite,
  WrittenClasses,
  SettingValue,
  Tone,
  ViewData,
  ViewKind
} from "@parity-app/extension"
import { z } from "zod"

/*
 * What the project service and an extension's host ask each other, over `@parity-app/channel` and the host's IPC
 * channel. The service trusts nothing the host sends, since the extension's code runs there and could post anything, so
 * every request from the host is read through `hostChecks` before it's handled.
 */

/** What a host's `parity.state` starts with: the extension's values for every project, and for this one. */
export interface StateValues {
  app: Record<string, JsonValue>
  project: Record<string, JsonValue>
}

/** What a host needs to activate its extension. */
export interface ActivateParams {
  extension: { id: string; version: string; displayName: string; prefix: string }
  /** Its code's entry module, as an absolute path. */
  main: string
  project: { root: string; name: string; detected?: JsonValue }
  /** The ids the manifest declares, which registrations are checked against. */
  commands: string[]
  statusItems: string[]
  /** The kinds of provider the manifest declares, which `parity.providers.register` is checked against. */
  providers: ProviderKind[]
  /** The tabs, sections and pages it declares, by id, with the kind of view each holds. */
  views: Record<string, ViewKind>
  state: StateValues
  /** What's selected in the window with the project open, which `parity.selection.get` gives until it changes. */
  selection: NodeRef[]
  /** The person's marks on the app's routes, by route id, which `parity.routes.marked` applies until they change. */
  routeMarks: Record<string, RouteMark>
  /** Its settings' values now, by key, and whose each one is: the person's (`app`) or the project's (`project`). */
  settings: { values: Record<string, SettingValue>; scopes: Record<string, "app" | "project"> }
  /**
   * The project's processes as it may see them, and what its own printed lately, by their ids among its processes, so
   * a host that starts again gets its processes back with their output.
   */
  processes: ProcessSnapshot
  /** The agent tools the manifest declares, which registrations are checked against. */
  agentTools?: string[]
  /** The extensions its manifest names in `extensionDependencies`, activated already, each with its API's methods. */
  dependencies?: Dependency[]
  /** The agent's call that started it, when one did (see `Called`). */
  call?: number
}

/**
 * The id of the agent's call a request is part of. The service gives each agent's call one and sends it with the
 * request that runs the extension's code; the host carries it through that code and sends it back with what the code
 * asks, so the service names the change after that agent, or refuses a question nobody can answer.
 */
export interface Called {
  call?: number
}

/** An extension another builds on, as the host that builds on it sees it. */
export interface Dependency {
  id: string
  version: string
  displayName: string
  /** The names of the functions its `activate` returned. */
  api: string[]
}

/** What an extension's code gave back to whoever ran it: JSON, or nothing. */
export interface Returned {
  result?: JsonValue
}

/** The kinds of provider an extension's code can register so far. */
export type ProviderKind = keyof ProviderKinds

/** What the project service asks a provider, by kind and method, and what it answers. */
export interface ProviderCalls {
  router: { routes: { params: undefined; result: Route[] } }
  renderer: { components: { params: { files: SourceFile[] }; result: ComponentExport[][] } }
  builder: {
    detect: { params: undefined; result: BuilderDetection }
    styles: { params: undefined; result: AppStyles }
  }
  entities: {
    /** What it imported, its designs read as containers. */
    import: { params: { components: ProjectComponents }; result: z.output<typeof importedEntities> }
    export: {
      params: { screen: ImportedScreen; edited: Design; components: ProjectComponents }
      result: FileWrite[]
    }
  }
  styles: {
    handles: { params: { source: string }; result: boolean }
    theme: { params: { stylesheet: string }; result: ThemeVariable[] }
    classes: {
      params: { stylesheet: string; version: number; written: string[]; declarations: CssDeclaration[] }
      result: WrittenClasses
    }
    writeTokens: { params: { source: string; writes: TokenWrite[]; theme: ThemeVariable[] }; result: string }
  }
  addresses: { addresses: { params: ServerFacts[]; result: { server: string; addresses: ProvidedAddress[] }[] } }
  discovery: { discover: { params: { root: string }; result: DiscoveredServer[] } }
}

/** One call to a provider, with what its method takes when it takes anything. */
export type ProviderCall = {
  [K in ProviderKind]: {
    [M in keyof ProviderCalls[K]]: ProviderCalls[K][M] extends { params: infer P }
      ? [P] extends [undefined]
        ? { kind: K; method: M }
        : { kind: K; method: M; params: P }
      : never
  }[keyof ProviderCalls[K]]
}[ProviderKind]

/** What a provider answers, whichever was called. */
export type ProviderAnswer = {
  [K in ProviderKind]: {
    [M in keyof ProviderCalls[K]]: ProviderCalls[K][M] extends { result: infer R } ? R : never
  }[keyof ProviderCalls[K]]
}[ProviderKind]

/**
 * The project's processes as an extension may see them, and of its own: what each printed in its current run, and the
 * pattern of each one whose ready check is `output`, by their ids among its processes.
 */
export interface ProcessSnapshot {
  list: ProcessInfo[]
  output: Record<string, string[]>
  ready: Record<string, string>
}

/** Where `parity.navigate` goes, by method. */
export type NavigateTo =
  | { kind: "reveal" | "zoomTo" | "pageUrl"; ref: NodeRef }
  | { kind: "openDesign"; key: string }
  | { kind: "setMode"; mode: string }
  | { kind: "setState"; design: string; state: string }
  | { kind: "showTab"; id: string }
  | { kind: "openSettings"; id: string }

/** What the project service asks of a host. */
export interface HostMethods {
  /** Loads the extension's code and calls its `activate`. Answers once `activate` has, with its API's methods. */
  activate: { params: ActivateParams; result: { api: string[] } }
  /** Runs one of its commands, once it has activated, giving back what its handler returned. */
  run: { params: { command: string; target?: CommandTarget } & Called; result: Returned }
  /** Runs one of its agent tools, with input its schema has checked. */
  tool: { params: { name: string; input: Record<string, JsonValue> } & Called; result: Returned }
  /** Calls a function of its API, for an extension that builds on it. */
  "api.call": { params: { method: string; args: JsonValue[] } & Called; result: Returned }
  /**
   * Calls a provider its code registered, once it has activated. The answer comes from the extension's code, so the
   * service reads it through `providerResults` before using it.
   */
  provide: { params: ProviderCall; result: ProviderAnswer }
  /** Answers at once, unless the extension's code is keeping the host busy, with the memory its process holds. */
  ping: { params: undefined; result: { memory?: number } | undefined }
  /** Some of its settings changed, in Settings or by its own `update`: their values now, by key. */
  "settings.changed": { params: { values: Record<string, SettingValue> }; result: undefined }
  /** The person cancelled a task under `ui.progress`. */
  cancel: { params: { progress: number }; result: undefined }
  /** The person changed a field of one of its forms. */
  "view.changed": { params: { view: string; key: string; value: string | number | boolean }; result: undefined }
  /** What's selected in the window changed. */
  "selection.changed": { params: { refs: NodeRef[] }; result: undefined }
  /** The person marked a route or took a mark away: the marks now, by route id. */
  "routes.changed": { params: { marks: Record<string, RouteMark> }; result: undefined }
  /** The project's processes changed: all of them, as it may see them. */
  "processes.changed": { params: { processes: ProcessInfo[] }; result: undefined }
  /** One of its own processes printed these lines. */
  "processes.lines": { params: { id: string; run: number; lines: string[] }; result: undefined }
  /** One of its own processes' runs ended. */
  "processes.ended": { params: { id: string; end: ProcessEnd }; result: undefined }
  /** A file it watches was created, changed or went. */
  "files.changed": { params: { id: number }; result: undefined }
  /** Disposes of the extension's subscriptions and calls its `deactivate`, then ends the host. */
  stop: { params: undefined; result: undefined }
}

/** A line in an extension's log. */
export interface LogLine {
  level: "info" | "warning" | "error"
  text: string
  /** An error's stack. */
  stack?: string
  /** When it was written, in milliseconds since 1970. */
  at: number
}

/** A status bar item's value and tooltip as the extension last set them. */
export interface StatusValue {
  value?: string
  tooltip?: string
}

/** What a host asks of the project service. */
export interface HostServiceMethods {
  log: { params: Omit<LogLine, "at">; result: undefined }
  "state.update": { params: { scope: "app" | "project"; key: string; value?: JsonValue }; result: undefined }
  "status.set": { params: { id: string } & StatusValue; result: undefined }
  "status.remove": { params: { id: string }; result: undefined }
  "context.set": { params: { key: string; value: boolean | string[] }; result: undefined }
  "facts.set": { params: { target: ComponentTarget; facts: Fact[] }; result: undefined }
  "ui.notify": {
    params: { message: string; detail?: string; tone?: Tone; actions?: string[] }
    result: { action?: string }
  }
  "ui.pick": {
    params: { items: PickItem[]; title?: string; placeholder?: string } & Called
    result: { index?: number }
  }
  "ui.input": { params: { title: string; value?: string; placeholder?: string } & Called; result: { value?: string } }
  "ui.confirm": {
    params: { message: string; detail?: string; confirm?: string } & Called
    result: { confirmed: boolean }
  }
  "ui.open": { params: { url: string; where?: OpenWhere }; result: undefined }
  /** Sets one of its `project` settings, or puts it back to its default without `value`. */
  "settings.update": { params: { key: string; value?: SettingValue }; result: undefined }
  /** Shows a task's progress, says what it's doing now, or ends it with `done`. */
  "ui.progress": { params: { id: number; title?: string; detail?: string; done?: boolean }; result: undefined }
  /** Draws one of its views with this data, replacing what it drew before. */
  "view.set": { params: { id: string; data: ViewData }; result: undefined }
  /** Empties one of its views again. */
  "view.clear": { params: { id: string }; result: undefined }
  /** Opens one of its views' tab or page. */
  "view.reveal": { params: { id: string }; result: undefined }
  /** Starts a process, or gives the one starting or running with its id and spec. Answers once spawning was tried. */
  "processes.start": { params: ProcessSpec; result: ProcessInfo }
  "processes.adopt": {
    params: {
      id: string
      name: string
      endpoint: Endpoint
      foundBy: "port" | "provider" | "endpoint"
      /** The discovery provider's extension, when one found it. */
      provider?: string
      /** The candidate's key, when `find` gave it, so the service knows its addresses. */
      key?: string
      pid?: number
    }
    result: ProcessInfo
  }
  "processes.find": { params: FindQuery; result: Candidate[] }
  "processes.stop": { params: { id: string }; result: undefined }
  "processes.restart": { params: { id: string }; result: ProcessInfo }
  /** Answers once the process's current run is ready. */
  "processes.ready": { params: { id: string }; result: ProcessInfo }
  /** Answers once the process's current run has ended. */
  "processes.ended": { params: { id: string }; result: ProcessEnd }
  "processes.report": { params: { id: string; detail?: string; done?: number; total?: number }; result: undefined }
  "processes.summarize": { params: { id: string; summary: string }; result: undefined }
  /** For a server whose ready check is `output`: the host saw a line matching it. */
  "processes.markReady": { params: { id: string; match: string }; result: undefined }
  /** Its code registered the provider of `kind` its manifest declares, which the service may now call. */
  "providers.register": { params: { kind: ProviderKind; maxAgeMs?: number }; result: undefined }
  /** What its provider of `kind` would answer has changed. */
  "providers.changed": { params: { kind: ProviderKind }; result: undefined }
  "providers.dispose": { params: { kind: ProviderKind }; result: undefined }
  /** A file's text, when the `read` permission names it. */
  "files.read": { params: { path: string }; result: { text: string } }
  /** What a folder holds, when the `read` permission names it. */
  "files.list": { params: { path: string }; result: { entries: { name: string; folder: boolean }[] } }
  /** Watches a file the `read` permission names, under an id the host gives it, until `files.unwatch`. */
  "files.watch": { params: { id: number; path: string }; result: undefined }
  "files.unwatch": { params: { id: number }; result: undefined }
  /** Changes designs as one undo step, with the `edits` permission. */
  "edits.transact": { params: { label: string; operations: DesignOperation[] } & Called; result: undefined }
  /** Writes project files the `write` permission names, never a `.par`. Answers with the paths it changed. */
  "files.edit": { params: { label: string; files: FileEdit[] } & Called; result: { paths: string[] } }
  "selection.set": { params: { refs: NodeRef[] }; result: undefined }
  "selection.highlight": { params: { refs: NodeRef[] }; result: undefined }
  /** Moves around the window; `pageUrl` answers with the URL. */
  navigate: { params: NavigateTo; result: { url?: string } }
  /** Runs one of Parity's own commands, or an extension's. */
  "commands.execute": { params: { command: string; target?: CommandTarget } & Called; result: undefined }
  /** Calls a function of the API of an extension its manifest names in `extensionDependencies`. */
  "extensions.call": { params: { extension: string; method: string; args: JsonValue[] } & Called; result: Returned }
}

const text = z.string().max(20_000)

const jsonValue: z.ZodType<JsonValue> = z.json()

const call = z.int().min(1).optional()

const checkOf =
  <T extends z.ZodType>(schema: T) =>
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what the host sent, read here
  (params: unknown): z.output<T> =>
    parseData(schema, params)

const url = z.url({ protocol: /^https?$/ })

const viewLabel = z.string().max(200)
const iconName = z.string().max(64)
const tone = z.enum(["info", "success", "warning", "error"])
const viewAction = z.strictObject({ command: z.string().max(200), when: z.string().max(200).optional() })

const viewItem = z.strictObject({
  key: z.string().max(500),
  label: viewLabel,
  detail: z.string().max(2000).optional(),
  value: z.string().max(2000).optional(),
  icon: iconName.optional(),
  tone: tone.optional(),
  cells: z.array(z.string().max(500)).max(20).optional(),
  parent: z.string().max(500).optional(),
  target: z.strictObject({ type: z.literal("component"), key: z.string() }).optional()
})

const field = { key: z.string().max(200), label: viewLabel, detail: z.string().max(2000).optional() }

const formField = z.discriminatedUnion("type", [
  z.strictObject({
    ...field,
    type: z.literal("text"),
    value: z.string().max(20_000),
    placeholder: viewLabel.optional()
  }),
  z.strictObject({ ...field, type: z.literal("number"), value: z.number() }),
  z.strictObject({ ...field, type: z.literal("boolean"), value: z.boolean() }),
  z.strictObject({
    ...field,
    type: z.literal("select"),
    value: z.string().max(500),
    options: z.array(z.strictObject({ value: z.string().max(500), label: viewLabel })).max(200)
  })
])

const viewOptions = z.strictObject({
  description: z.string().max(5000).optional(),
  empty: z.strictObject({ title: viewLabel, detail: z.string().max(2000).optional() }).optional(),
  toolbar: z.array(viewAction).max(10).optional(),
  itemActions: z.array(viewAction).max(10).optional(),
  columns: z.array(viewLabel).max(20).optional()
})

/** A view's data as a host sends it: a form holds fields, and the other kinds hold items. */
const viewData: z.ZodType<ViewData> = z.union([
  z.strictObject({ kind: z.literal("form"), options: viewOptions, items: z.array(formField).max(200) }),
  z.strictObject({
    kind: z.enum(["table", "tree", "list", "keyValue"]),
    options: viewOptions,
    items: z.array(viewItem).max(10_000)
  })
])

const designKey = z.string().max(2000)

const nodeId = z.string().max(500)

const label = z.string().min(1).max(200)

const designOperation: z.ZodType<DesignOperation> = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("insert"),
    design: designKey,
    parent: nodeId,
    slot: nodeId.optional(),
    before: nodeId.optional(),
    node: jsonValue
  }),
  z.strictObject({ op: z.literal("remove"), design: designKey, node: nodeId }),
  z.strictObject({
    op: z.literal("move"),
    design: designKey,
    node: nodeId,
    parent: nodeId,
    slot: nodeId.optional(),
    before: nodeId.optional()
  }),
  z.strictObject({
    op: z.literal("set"),
    design: designKey,
    node: nodeId,
    path: z.array(z.string().max(200)).min(1).max(10),
    value: jsonValue.optional()
  })
])

const processId = z.string().min(1).max(100)

const run: z.ZodType<ProcessSpec["run"]> = z.union([
  z.strictObject({ bin: z.string().min(1).max(200), package: z.string().min(1).max(200).optional() }),
  z.strictObject({ script: z.string().min(1).max(200) }),
  z.strictObject({ exec: z.string().min(1).max(200) }),
  z.strictObject({ node: z.string().min(1).max(500) })
])

const readyCheck: z.ZodType<NonNullable<ProcessSpec["ready"]>> = z.union([
  z.strictObject({ http: z.string().startsWith("/").max(500) }),
  z.strictObject({ tcp: z.literal(true) }),
  z.strictObject({ output: z.string().min(1).max(200) })
])

const port = z.int().min(1).max(65_535)

const processSpec: z.ZodType<ProcessSpec> = z.strictObject({
  id: processId,
  name: z.string().min(1).max(100),
  lifetime: z.enum(["server", "task"]),
  run,
  args: z.array(z.string().max(10_000)).max(500).optional(),
  cwd: z.string().max(1000).optional(),
  env: z.record(z.string().min(1).max(200), z.string().max(20_000)).optional(),
  port: z.strictObject({ prefer: port, env: z.string().min(1).max(100).optional() }).optional(),
  ready: readyCheck.optional(),
  timeoutMs: z.int().positive().max(86_400_000).optional(),
  restart: z.enum(["never", "onCrash"]).optional(),
  quiet: z.boolean().optional(),
  icon: z.string().max(100).optional(),
  role: z.string().max(100).optional()
})

const endpoint: z.ZodType<Endpoint> = z.strictObject({
  url: z.url({ protocol: /^https?$/ }).max(500),
  port,
  protocol: z.enum(["http", "https", "tcp"])
})

const filePath = z.string().min(1).max(1000)

/** A watch's number, as its host counts them. */
const handleId = z.int().nonnegative()

const providerKind = z.enum(["router", "addresses", "discovery"]) satisfies z.ZodType<ProviderKind>

const providedAddress: z.ZodType<ProvidedAddress> = z.strictObject({
  url: z.url({ protocol: /^https?$/ }).max(500),
  label: z.string().min(1).max(200),
  kind: z.enum(["name", "proxy", "tunnel", "container", "network"]),
  public: z.boolean()
})

/** What an address provider answers, which the service checks before taking any of it. */
export const providedAddresses = z
  .array(z.strictObject({ server: z.string().max(400), addresses: z.array(providedAddress).max(20) }))
  .max(1000)

/** What a discovery provider answers, which the service checks before taking any of it. */
export const discoveredServers: z.ZodType<DiscoveredServer[]> = z
  .array(
    z.strictObject({
      key: z.string().min(1).max(200),
      endpoint,
      name: z.string().min(1).max(100).optional(),
      pid: z.int().positive().optional(),
      cwd: z.string().max(1000).optional(),
      addresses: z.array(providedAddress).max(20).optional()
    })
  )
  .max(500)

const fileText = z.string().max(10_000_000)

const fileEdit: z.ZodType<FileEdit> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("create"), path: filePath, content: fileText }),
  z.strictObject({ kind: z.literal("replace"), path: filePath, expected: fileText, content: fileText }),
  z.strictObject({ kind: z.literal("patch"), path: filePath, find: fileText.min(1), replace: fileText }),
  z.strictObject({ kind: z.literal("delete"), path: filePath, expected: fileText })
])

const name = z.string().min(1).max(500)

const nodeRef = z.strictObject({ owner: name, type: name, key: z.string().min(1).max(2000) })

const refs = z.strictObject({ refs: z.array(nodeRef).max(10_000) })

const componentTarget = z.strictObject({ type: z.literal("component"), key: z.string() })

const commandTarget = z.discriminatedUnion("type", [
  componentTarget,
  z.strictObject({ type: z.literal("layer"), design: z.string().max(2000), node: z.string().max(500) }),
  z.strictObject({ type: z.literal("route"), key: z.string().max(2000) }),
  z.strictObject({ type: z.literal("process"), id: z.string().max(500) })
])

const routePath = z.string().max(2000)

const segmentText = z.string().max(500)

const routeSegment: z.ZodType<RouteSegment> = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("static"), value: segmentText }),
  z.strictObject({ type: z.literal("param"), name: segmentText }),
  z.strictObject({ type: z.literal("catchAll"), name: segmentText }),
  z.strictObject({ type: z.literal("optionalCatchAll"), name: segmentText })
])

const route: z.ZodType<Route> = z.strictObject({
  id: routePath,
  kind: z.enum(["root", "layout", "group", "page", "api"]),
  segments: z.array(routeSegment).max(100),
  path: routePath,
  parent: routePath.optional(),
  file: filePath,
  index: z.boolean(),
  component: z.string().max(500).optional(),
  loads: z.boolean(),
  guards: z.boolean(),
  redirect: routePath.optional(),
  slot: z.string().max(200).optional(),
  intercepts: routePath.optional(),
  stateFiles: z
    .strictObject({ loading: filePath.optional(), error: filePath.optional(), notFound: filePath.optional() })
    .optional()
})

/** A screen an entities provider read, its design checked as a `.par` file's. */
const importedScreen = z.strictObject({
  adapter: z.string().max(200),
  ref: z.string().max(2000),
  group: z.string().max(2000),
  folders: z.array(z.string().max(500)).max(100).optional(),
  component: z.string().max(2000).optional(),
  screen: containerSpec
})

/** What an entities provider imported. */
const importedEntities = z.strictObject({
  screens: z.array(importedScreen).max(10_000).optional(),
  sources: z.record(z.string().max(2000), z.strictObject({ path: filePath, export: z.string().max(500) })).optional()
})

/** Reads what each provider's methods answer, which came from the extension's code, before the service uses it. */
const themeVariables = z.array(z.strictObject({ name: z.string().max(500), value: text })).max(100_000)

const providerResults = {
  router: { routes: checkOf(z.array(route).max(10_000)) },
  styles: {
    handles: checkOf(z.boolean()),
    theme: checkOf(themeVariables),
    classes: checkOf(
      z.strictObject({
        classes: z.array(z.array(z.string().max(500)).max(100).nullable()).max(10_000),
        css: z.string().max(10_000_000)
      })
    ),
    writeTokens: checkOf(fileText)
  },
  entities: {
    import: checkOf(importedEntities),
    export: checkOf(z.array(z.strictObject({ path: filePath, text: fileText })).max(1000))
  },
  builder: {
    detect: checkOf(
      z.strictObject({
        found: z.boolean(),
        version: z.string().max(200).optional(),
        config: filePath.optional(),
        summary: text
      })
    ),
    styles: checkOf(
      z.strictObject({
        styles: z.array(filePath).max(1000),
        packageStyles: z.array(z.string().max(500)).max(1000),
        from: z.array(filePath).max(1000)
      })
    )
  },
  renderer: {
    components: checkOf(
      z
        .array(
          z
            .array(
              z.strictObject({
                name: z.string().max(500),
                export: z.string().max(500),
                as: z.enum(["function", "forwardRef", "memo", "lazy", "class", "exotic"]).optional()
              })
            )
            .max(10_000)
        )
        .max(100_000)
    )
  },
  addresses: { addresses: checkOf(providedAddresses) },
  discovery: { discover: checkOf(discoveredServers) }
} satisfies {
  [K in ProviderKind]: {
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: what the host answered, read here
    [M in keyof ProviderCalls[K]]: (result: unknown) => ProviderCalls[K][M] extends { result: infer R } ? R : never
  }
}

/** Reads what a provider answered to `call`, which came from the extension's code, before the service uses it. */
export function readAnswer(call: ProviderCall, answer: ProviderAnswer): ProviderAnswer {
  switch (call.kind) {
    case "router":
      return providerResults.router.routes(answer)
    case "addresses":
      return providerResults.addresses.addresses(answer)
    case "discovery":
      return providerResults.discovery.discover(answer)
    case "styles":
      return providerResults.styles[call.method](answer)
    case "renderer":
      return providerResults.renderer[call.method](answer)
    case "builder":
      return providerResults.builder[call.method](answer)
    case "entities":
      return providerResults.entities[call.method](answer)
  }
}

/** Reads each of a host's requests before the service handles it. */
export const hostChecks: Checks<HostServiceMethods> = {
  log: checkOf(z.strictObject({ level: z.enum(["info", "warning", "error"]), text, stack: text.optional() })),
  "state.update": checkOf(
    z.strictObject({ scope: z.enum(["app", "project"]), key: z.string().max(200), value: jsonValue.optional() })
  ),
  "status.set": checkOf(
    z.strictObject({ id: z.string(), value: z.string().max(200).optional(), tooltip: z.string().max(2000).optional() })
  ),
  "status.remove": checkOf(z.strictObject({ id: z.string() })),
  "context.set": checkOf(
    z.strictObject({ key: z.string(), value: z.union([z.boolean(), z.array(z.string()).max(100_000)]) })
  ),
  "facts.set": checkOf(
    z.strictObject({
      target: componentTarget,
      facts: z
        .array(z.strictObject({ id: z.string().max(100), label: z.string().max(100), value: z.string().max(200) }))
        .max(20)
    })
  ),
  "ui.notify": checkOf(
    z.strictObject({
      message: z.string().max(500),
      detail: z.string().max(2000).optional(),
      tone: z.enum(["info", "success", "warning", "error"]).optional(),
      actions: z.array(z.string().max(40)).max(3).optional()
    })
  ),
  "ui.pick": checkOf(
    z.strictObject({
      items: z.array(z.strictObject({ label: z.string().max(200), detail: z.string().max(500).optional() })).max(5000),
      title: z.string().max(200).optional(),
      placeholder: z.string().max(200).optional(),
      call
    })
  ),
  "ui.input": checkOf(
    z.strictObject({
      title: z.string().max(200),
      value: z.string().max(2000).optional(),
      placeholder: z.string().max(200).optional(),
      call
    })
  ),
  "ui.confirm": checkOf(
    z.strictObject({
      message: z.string().max(500),
      detail: z.string().max(2000).optional(),
      confirm: z.string().max(40).optional(),
      call
    })
  ),
  "ui.open": checkOf(z.strictObject({ url, where: z.enum(["browser", "parity"]).optional() })),
  "settings.update": checkOf(
    z.strictObject({
      key: z.string().max(200),
      value: z.union([z.string().max(20_000), z.number(), z.boolean()]).optional()
    })
  ),
  "ui.progress": checkOf(
    z.strictObject({
      id: z.int(),
      title: z.string().max(200).optional(),
      detail: z.string().max(500).optional(),
      done: z.boolean().optional()
    })
  ),
  "view.set": checkOf(z.strictObject({ id: z.string().max(200), data: viewData })),
  "view.clear": checkOf(z.strictObject({ id: z.string().max(200) })),
  "view.reveal": checkOf(z.strictObject({ id: z.string().max(200) })),
  "processes.start": checkOf(processSpec),
  "processes.adopt": checkOf(
    z.strictObject({
      id: processId,
      name: z.string().min(1).max(100),
      endpoint,
      foundBy: z.enum(["port", "provider", "endpoint"]),
      provider: z.string().min(1).max(214).optional(),
      key: z.string().min(1).max(500).optional(),
      pid: z.int().positive().optional()
    })
  ),
  "processes.find": checkOf(
    z.strictObject({ ports: z.array(port).max(20).optional(), discovered: z.boolean().optional() })
  ),
  "processes.stop": checkOf(z.strictObject({ id: processId })),
  "processes.restart": checkOf(z.strictObject({ id: processId })),
  "processes.ready": checkOf(z.strictObject({ id: processId })),
  "processes.ended": checkOf(z.strictObject({ id: processId })),
  "processes.report": checkOf(
    z.strictObject({
      id: processId,
      detail: z.string().max(500).optional(),
      done: z.number().nonnegative().optional(),
      total: z.number().nonnegative().optional()
    })
  ),
  "processes.summarize": checkOf(z.strictObject({ id: processId, summary: z.string().max(500) })),
  "processes.markReady": checkOf(z.strictObject({ id: processId, match: z.string().max(4000) })),
  "providers.register": checkOf(
    z.strictObject({ kind: providerKind, maxAgeMs: z.int().positive().max(86_400_000).optional() })
  ),
  "providers.changed": checkOf(z.strictObject({ kind: providerKind })),
  "providers.dispose": checkOf(z.strictObject({ kind: providerKind })),
  "files.read": checkOf(z.strictObject({ path: filePath })),
  "files.list": checkOf(z.strictObject({ path: filePath })),
  "files.watch": checkOf(z.strictObject({ id: handleId, path: filePath })),
  "files.unwatch": checkOf(z.strictObject({ id: handleId })),
  "edits.transact": checkOf(z.strictObject({ label, operations: z.array(designOperation).min(1).max(10_000), call })),
  "files.edit": checkOf(z.strictObject({ label, files: z.array(fileEdit).min(1).max(1000), call })),
  "selection.set": checkOf(refs),
  "selection.highlight": checkOf(refs),
  navigate: checkOf(
    z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.enum(["reveal", "zoomTo", "pageUrl"]), ref: nodeRef }),
      z.strictObject({ kind: z.literal("openDesign"), key: name }),
      z.strictObject({ kind: z.literal("setMode"), mode: name }),
      z.strictObject({ kind: z.literal("setState"), design: name, state: name }),
      z.strictObject({ kind: z.literal("showTab"), id: name }),
      z.strictObject({ kind: z.literal("openSettings"), id: name })
    ])
  ),
  "commands.execute": checkOf(z.strictObject({ command: name, target: commandTarget.optional(), call })),
  "extensions.call": checkOf(z.strictObject({ extension: name, method: name, args: z.array(jsonValue).max(100), call }))
}

/** Reads what an extension's code gave back, which could be anything its process posted. */
export const readReturned = checkOf(z.strictObject({ result: jsonValue.optional() }))
