import type { JsonValue } from "./manifest.ts"

/*
 * What an extension's code gets. Its module exports `activate`, which Parity calls with one `Parity` object when an
 * activation event its manifest names happens. Each extension runs in a process of its own, for one open project. Reads
 * come from copies its process keeps, so they're synchronous; anything that changes something is asynchronous.
 */

/** Something that can be taken back: a registration, a subscription, a status item. */
export interface Disposable {
  dispose(): void
}

/** What an extension's module exports. */
export interface ExtensionModule {
  activate(parity: Parity): void | Promise<void>
  /** Called before its process ends, after everything in `parity.subscriptions` has gone. */
  deactivate?(): void | Promise<void>
}

/** Everything an extension can do, by area. */
export interface Parity {
  readonly extension: ExtensionInfo
  readonly project: Project
  /** Disposables that go when the extension stops. Add what you register or subscribe to. */
  readonly subscriptions: Disposable[]
  readonly commands: Commands
  readonly context: Context
  readonly facts: Facts
  readonly status: StatusItems
  readonly servers: Servers
  readonly edits: Edits
  readonly files: Files
  readonly ui: Ui
  readonly state: { readonly app: State; readonly project: State }
  readonly log: Log
}

/** The extension itself, as its manifest names it. */
export interface ExtensionInfo {
  /** Its package name. */
  id: string
  version: string
  displayName: string
}

/** The open project the extension runs for. */
export interface Project {
  /** Its folder, as an absolute path. */
  root: string
  name: string
  /** What detection found of the extension's tool, such as where its config is. */
  detected: JsonValue | undefined
}

/**
 * What a command was run for: a component's card or one of its layers, or a layer in Layers, by its design's key
 * (`app.par#home`) and its id. Nothing when it's run from Search actions.
 */
export type CommandTarget = ComponentTarget | LayerTarget

/** A component of the project, by its key. */
export type ComponentTarget = { type: "component"; key: string }

/** A layer, by its design's key and its id. */
export type LayerTarget = { type: "layer"; design: string; node: string }

export interface Commands {
  /** Gives behaviour to a command the manifest declares. A second handler for one command is refused. */
  register(id: string, handler: (target: CommandTarget | undefined) => void | Promise<void>): Disposable
}

/**
 * Context keys a manifest's `when` and `enablement` read. A key holds when it's `true`, or when it's a list holding the
 * key of what the command is shown for, such as a component's.
 */
export interface Context {
  /** Sets a key, which must start with the extension's prefix. */
  set(key: string, value: boolean | string[]): void
}

/** A fact about something in the project, shown on its card, such as a component's number of stories. */
export interface Fact {
  /** Names it among the extension's facts about one thing. */
  id: string
  label: string
  value: string
}

export interface Facts {
  /** Sets the extension's facts about `target`, replacing those it set before. An empty list takes them away. */
  set(target: ComponentTarget, facts: Fact[]): void
}

export interface StatusItems {
  /** The status bar item the manifest declares with `id`, to set its value and tooltip. */
  item(id: string): StatusItem
}

export interface StatusItem extends Disposable {
  /** Shows `value` beside its icon and `tooltip` under its title. What's left out stays as it was. */
  set(update: { value?: string; tooltip?: string }): void
}

/**
 * A tool's server, which the project service's process manager starts on Parity's own Node, lists with the project's
 * processes under the extension, and stops when the extension stops or its process ends.
 */
export interface ServerRequest {
  /** Names it among the extension's servers. */
  id: string
  /** What the processes list calls it. */
  name: string
  /** The script to run, as an absolute path, and its arguments. `{port}` in an argument becomes the port chosen. */
  script: string
  args: string[]
  /** The port it asks for. The next free one is chosen when it's taken. */
  port: number
  /** The path that answers once it's ready, as `/index.json`. */
  readyPath: string
  /** Variables added to its environment. */
  env?: Record<string, string>
}

/** A server that's running, or was found running. */
export interface Served {
  /** Where it answers, as `http://localhost:6006`. */
  url: string
}

export interface Servers {
  /** Starts a server, or gives the one this extension started with `id` while it's still running. */
  serve(server: ServerRequest): Promise<Served>
  /** Lists a server found running elsewhere under the extension, so the processes list shows it. */
  adopt(server: { id: string; name: string; url: string }): void
  /** Stops a server it started, or lets go of one it adopted. */
  stop(id: string): void
  /**
   * The local servers Portless gives names to: where each answers on this machine, and its address by name, which the
   * person's browser opens. None without Portless.
   */
  routed(): Promise<{ url: string; address: string }[]>
}

/**
 * A layer's field, as a path into it: `["name"]`, `["hidden"]`, `["text"]`, `["props", "variant"]` or
 * `["style", "padding"]`. Not `id`, `type`, `children` or `slots`.
 */
export type FieldPath = string[]

/**
 * One change to a design, by its key (`app.par#home`), as a person's edit makes it. Layers are placed before a sibling
 * by its id, or last when `before` is left out, in `slot` when the parent is a component or an instance.
 */
export type DesignOperation =
  /** Inserts a layer with everything inside it. Its ids must be new to the design. */
  | { op: "insert"; design: string; parent: string; slot?: string; before?: string; node: JsonValue }
  | { op: "remove"; design: string; node: string }
  /** Moves a layer within its design. */
  | { op: "move"; design: string; node: string; parent: string; slot?: string; before?: string }
  /** Sets one of a layer's fields, or takes it away when `value` is left out. */
  | { op: "set"; design: string; node: string; path: FieldPath; value?: JsonValue }

/**
 * Changing designs, for an extension whose manifest has the `edits` permission. A change goes to the window that has
 * the project open, waiting for one, which applies it as it applies an agent's: checked whole and applied whole, as one
 * undo step named after the extension and `label`, as "Tidy: Rename layers". Extensions never write `.par` files.
 */
export interface Edits {
  /**
   * Applies `operations` in order, as one undo step. Rejects, changing nothing, when one can't apply, as when someone
   * deleted a layer it names meanwhile, or when what it leaves isn't a valid design.
   */
  transact(label: string, operations: DesignOperation[]): Promise<void>
}

/**
 * One file's part in `files.edit`, by its path from the project's root. Each says what it expects to find, so a file
 * that changed meanwhile is left alone: `create` expects no file, `replace` and `delete` exactly what's there, and
 * `patch` its `find` text once.
 */
export type FileEdit =
  | { kind: "create"; path: string; content: string }
  | { kind: "replace"; path: string; expected: string; content: string }
  | { kind: "patch"; path: string; find: string; replace: string }
  | { kind: "delete"; path: string; expected: string }

/** Changing the project's files: code, such as a story's args or a test. */
export interface Files {
  /**
   * Writes the files together through the project service, which checks each still holds what the edit expects, and
   * shows the change with Undo under the extension's name and `label`. Limited to the paths the manifest's `write`
   * permission names, and never a `.par` file. Gives the paths it changed.
   */
  edit(label: string, files: FileEdit[]): Promise<string[]>
}

/** How a toast looks. */
export type Tone = "info" | "success" | "warning" | "error"

/** An item of `ui.pick`. */
export interface PickItem {
  label: string
  /** A line beside or under its label. */
  detail?: string
}

/** What a task under `ui.progress` gets. */
export interface Progress {
  /** Says what it's doing now, under the title. */
  report(detail: string): void
  /** Aborts when the person cancels it. */
  readonly signal: AbortSignal
}

/** Talking to the person, in Parity's own look. Each waits for a window with the project open. */
export interface Ui {
  /** A toast, with buttons. Gives the label of the button pressed, or nothing when it's dismissed. */
  notify(message: string, options?: { detail?: string; tone?: Tone; actions?: string[] }): Promise<string | undefined>
  /** Progress in a toast while `task` runs, which the person can cancel. */
  progress<T>(title: string, task: (progress: Progress) => Promise<T>): Promise<T>
  /** A list to pick from. Gives the item picked, or nothing when the person closes it. */
  pick<T extends PickItem>(items: T[], options?: { title?: string; placeholder?: string }): Promise<T | undefined>
  /** A field. Gives what the person typed, or nothing when they cancel. */
  input(title: string, options?: { value?: string; placeholder?: string }): Promise<string | undefined>
  /** A dialog with a confirm and a cancel button. Gives whether the person confirmed. */
  confirm(message: string, options?: { detail?: string; confirm?: string }): Promise<boolean>
  /** Opens a page in the person's browser. */
  open(url: string): Promise<void>
}

/**
 * Small values an extension keeps for itself, saved with the app's state for the person: `app` for every project,
 * `project` for this one. They aren't settings and aren't shared.
 */
export interface State {
  get(key: string): JsonValue | undefined
  /** Sets a key, or removes it with `undefined`. */
  update(key: string, value: JsonValue | undefined): Promise<void>
  keys(): string[]
}

/** Lines in the extension's own tab in the bottom panel. */
export interface Log {
  info(message: string): void
  warn(message: string): void
  /** An error's stack shows under it. */
  error(message: string | Error): void
}
