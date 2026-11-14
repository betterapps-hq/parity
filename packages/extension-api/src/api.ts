import type { IconName, JsonValue, ViewKind } from "./manifest.ts"
import type { Processes } from "./processes.ts"

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
  /** What it returns is its API, which extensions that name it in `extensionDependencies` call (`parity.extensions`). */
  activate(parity: Parity): void | ExtensionApi | Promise<void | ExtensionApi>
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
  readonly selection: Selection
  readonly navigate: Navigate
  readonly context: Context
  readonly facts: Facts
  readonly status: StatusItems
  readonly processes: Processes
  readonly servers: Servers
  readonly edits: Edits
  readonly files: Files
  readonly providers: ProviderRegistry
  readonly ui: Ui
  readonly settings: Settings
  readonly state: { readonly app: State; readonly project: State }
  readonly log: Log
  readonly views: Views
  readonly extensions: Extensions
  readonly agentTools: AgentTools
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
 * What a command was run for: a component's card or one of its layers, a layer in Layers, by its design's key
 * (`app.par#home`) and its id, one of the app's pages, by its route, or an item of a view without a `target` of its
 * own. Nothing when it's run from Search actions or a view's toolbar.
 */
export type CommandTarget = ComponentTarget | LayerTarget | RouteTarget | ItemTarget

/** A component of the project, by its key. */
export type ComponentTarget = { type: "component"; key: string }

/** A layer, by its design's key and its id. */
export type LayerTarget = { type: "layer"; design: string; node: string }

/** One of the app's pages, by its route's id, as `/settings/billing`. */
export type RouteTarget = { type: "route"; key: string }

/** An item of one of the extension's views, by the view's id and the item's key. */
export type ItemTarget = { type: "item"; view: string; key: string }

export interface Commands {
  /**
   * Gives behaviour to a command the manifest declares. A second handler for one command is refused. What the handler
   * returns goes to an agent that ran the command, so it should be JSON, as `{ url }`.
   */
  register(
    id: string,
    handler: (target: CommandTarget | undefined) => void | JsonValue | Promise<void | JsonValue>
  ): Disposable
  /**
   * Runs a command: one of Parity's own, by its id in the keymap and menus (`zoomToSelection`, `duplicate`, `wrap`), on
   * what's selected in the window, or any extension's, which starts its extension first when it isn't running. Waits
   * for a window with the project open. Fails when there's no such command, or it can't run on what's selected.
   */
  execute(id: string, target?: CommandTarget): Promise<void>
}

/**
 * Every node Parity knows of, by one address, whoever made it: a design (`design`, `design`, its key), a layer in one
 * (`design`, its type, `designKey/layerId`), a component, a route, a story, or an extension's own node.
 */
export interface NodeRef {
  /** Who made it and keeps its key: `design` for the designs' own, or the id of the adapter or extension. */
  owner: string
  /** Its kind: `design` or a layer's type for the designs' own, or a type its owner names, as `route`. */
  type: string
  /** Unique within its owner and type: a route's id, a component's key, `designKey/layerId` for a layer. */
  key: string
}

/** What's selected in the window with the project open, by `NodeRef`. */
export interface Selection {
  /** What's selected now, the one picked last at the end. Empty when nothing is, or no window has the project open. */
  get(): NodeRef[]
  /**
   * Selects nodes, as picking them in Layers does, and brings them into view. A route with a page selects its page, and
   * one without, as a layout, selects its group. Nodes of more than one design, or of no design, are selected as nodes.
   */
  set(refs: NodeRef[]): Promise<void>
  /** Outlines nodes on the canvas without selecting them, as pointing at a row in Layers does. None takes it away. */
  highlight(refs: NodeRef[]): Promise<void>
  /** Told what's selected each time it changes. */
  onChange(listener: (refs: NodeRef[]) => void): Disposable
}

/** A tab of a panel: Parity's own (`layers`, `components`, `icons`, `media`, `tokens`, `design`), or an extension's. */
export type TabId = string

/** Moving around the window with the project open. Each waits for one. */
export interface Navigate {
  /** Scrolls Layers and the canvas to a node, changing the zoom only when it has to. */
  reveal(ref: NodeRef): Promise<void>
  /** Frames a node on the canvas. */
  zoomTo(ref: NodeRef): Promise<void>
  /** Selects a design and brings it into view, by its key. */
  openDesign(key: string): Promise<void>
  /** Shows the selected design's frames in one of its modes, by name. */
  setMode(mode: string): Promise<void>
  /** Shows a design in one of its states, by name. */
  setState(design: string, state: string): Promise<void>
  /** Opens a tab of a panel. */
  showTab(id: TabId): Promise<void>
  /** Opens Settings at an extension's page, by its id; this extension's when none is given. */
  openSettings(id?: string): Promise<void>
  /** The URL the canvas draws a route's page at, with its params filled in, or nothing for a node that isn't one. */
  pageUrl(ref: NodeRef): Promise<string | undefined>
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

/** Portless's names for local servers, until Portless is an extension of its own (PAR-1103, step 3). */
export interface Servers {
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

/**
 * The jobs the manifest's `providers` names, given behaviour. Parity calls a provider with plain data and waits for its
 * answer, so each method is asynchronous and takes and returns only what JSON can carry.
 */
export interface ProviderRegistry {
  /** Gives the router the manifest declares its behaviour. A second router is refused. */
  register(kind: "router", provider: RouterProvider): Disposable
  /** Gives the styling framework the manifest declares its behaviour. A second one is refused. */
  register(kind: "styles", provider: StylesProvider): Disposable
}

/**
 * Reads a styling framework's theme from the project's own installation, writes a layer's declarations as its classes,
 * and writes token values where it keeps them. Stylesheets are named by their path from the project's root.
 */
export interface StylesProvider {
  /** Whether one of the project's stylesheets uses the framework, from its text. */
  handles(request: { source: string }): Promise<boolean>
  /** Every theme variable the stylesheet defines, resolved by the project's own copy of the framework. */
  theme(request: { stylesheet: string }): Promise<ThemeVariable[]>
  /**
   * The classes the framework writes each declaration as, in order, or null for one it can't write; and the CSS those
   * and the `written` classes compile to in this project. `version` goes up each time the project's stylesheets change,
   * so what was loaded for an older one can go.
   */
  classes(request: {
    stylesheet: string
    version: number
    written: string[]
    declarations: CssDeclaration[]
  }): Promise<WrittenClasses>
  /**
   * The stylesheet's source with token values written where the framework keeps them, and those without a value taken
   * out, keeping everything else as written. `theme` is what `theme` read.
   */
  writeTokens(request: { source: string; writes: TokenWrite[]; theme: ThemeVariable[] }): Promise<string>
}

/** A theme variable without its `--`, as the framework defines it. */
export interface ThemeVariable {
  name: string
  value: string
}

/** A CSS declaration of a layer's, as `background-color: var(--primary)`, in the state, viewport or theme it applies in. */
export interface CssDeclaration {
  property: string
  value: string
  when?: { state?: string; viewport?: string; theme?: string }
}

/** The classes declarations are written as, each null where the framework can't write it, and the CSS they compile to. */
export interface WrittenClasses {
  classes: (string[] | null)[]
  css: string
}

/** A token's value in one theme (`default` for the root), or `value` undefined to take it out of that theme. */
export interface TokenWrite {
  /** Without `--`. */
  name: string
  theme: string
  value: string | undefined
}

/** Reads an app's routes from its router's own files, so the canvas draws each page. */
export interface RouterProvider {
  /**
   * The project's routes, each parent before its children. Empty when the router's files aren't there, as before its
   * tooling first writes them. Parity asks while the project opens.
   */
  routes(): Promise<Route[]>
}

/** One route of an app, as its router declares it. */
export interface Route {
  /** The router's id for it, unique in the app: `/settings/billing`, or `__root__` for the root. */
  id: string
  /** The URL it matches, from the root, its params written as the router writes them: `/projects/$projectId`. */
  path: string
  /** The id of the route it draws inside, at that route's outlet. The root has none. */
  parent?: string
  /** Its file, from the project root, with forward slashes. */
  file: string
  /** The names of the params its path takes, without the router's mark: `["projectId"]`. */
  params: string[]
  /** Whether it's its parent's index, drawn at its parent's own URL. */
  index: boolean
  /** The component it draws, by its name in its file, when it names one. */
  component?: string
  /** Whether it loads data before it draws. */
  loads: boolean
  /** Whether it can redirect or refuse before it draws. */
  guards: boolean
  /** Where it always sends the browser instead of drawing, from the root. Undefined when it draws. */
  redirect?: string
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
  /**
   * Opens a page: in the person's browser, or with `where: "parity"` in a window of Parity's own, as a setting such as
   * "Open stories in" chooses.
   */
  open(url: string, options?: { where?: OpenWhere }): Promise<void>
}

/** Where `ui.open` opens a page: the person's browser, or a window of Parity's own. */
export type OpenWhere = "browser" | "parity"

/** A setting's value: a string, a number or a true or false, as its manifest types it. */
export type SettingValue = string | number | boolean

/**
 * The extension's settings, as its manifest declares them, by key: `timings.runs`. Each reads as the person or the
 * project set it, or as its default when it isn't set or doesn't fit its schema.
 */
export interface Settings {
  /** A setting's value now. Throws for a key the manifest doesn't declare. */
  get<T extends SettingValue = SettingValue>(key: string): T
  /** Calls `listener` with the setting's new value each time it changes, in Settings or by `update`. */
  onChange<T extends SettingValue = SettingValue>(key: string, listener: (value: T) => void): Disposable
  /**
   * Sets one of its `project` settings, as one undo step in the project's window, saved with the project. `undefined`
   * puts it back to its default. `app` settings are the person's, changed only in Settings, so updating one is refused.
   */
  update(key: string, value: SettingValue | undefined): Promise<void>
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

/*
 * Declarative views (PAR-1094). A tab, Design tab section or page the manifest declares holds a view of the kind it
 * names, which the extension fills with data. Parity draws it with its own kit, so it has the editor's spacing, keyboard
 * use, themes and accessible names. Until the code fills it, it shows that its extension is starting.
 */

/** A command a view offers, on its toolbar or on each item. Its title and icon are the command's own. */
export interface ViewAction {
  command: string
  /** A context key that must hold for it to show: on an item, for the item's `target` (see `parity.context`). */
  when?: string
}

/** How a view looks around its items. */
export interface ViewOptions {
  /** A paragraph above the items, as a setup guide's introduction. */
  description?: string
  /** What shows while it has no items. */
  empty?: { title: string; detail?: string }
  /** Commands above the items, run with no target. */
  toolbar?: ViewAction[]
  /**
   * Commands on each item, run for the item's `target`, or for the item itself when it has none. The first also runs
   * when the person presses Enter on an item or double-clicks it.
   */
  itemActions?: ViewAction[]
}

/** A table's options: its columns' headings. The first column shows each row's `label`, the rest its `cells`. */
export interface TableOptions extends ViewOptions {
  columns: string[]
}

/** A row of a table, tree or list, or one of key-value pairs. */
export interface ViewItem {
  /** Names it among the view's items. */
  key: string
  /** Its name, also what screen readers call it. In key-value pairs, the key. */
  label: string
  /** A line beside or under its label. */
  detail?: string
  /** In key-value pairs, the value. */
  value?: string
  icon?: IconName
  /** Colors its icon, as a setup guide's done and missing steps. */
  tone?: Tone
  /** In a table, the values of the columns after the first. */
  cells?: string[]
  /** In a tree, the key of the item it's under. Items without one are at the top. */
  parent?: string
  /**
   * What it's about, which its actions run for. In a Design tab section, only items about what's selected, and items
   * without a target, show.
   */
  target?: ComponentTarget
}

/** A field of a form, drawn with the kit's own controls. */
export type FormField = {
  key: string
  label: string
  /** A line under it. */
  detail?: string
} & (
  | { type: "text"; value: string; placeholder?: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "select"; value: string; options: { value: string; label: string }[] }
)

/** A view the extension fills. Changes are sent together, once the extension's code has finished what it's doing. */
export interface View<Item, Options = ViewOptions> extends Disposable {
  /** Replaces every item. */
  set(items: Item[]): void
  /** Adds items, or replaces those with the same keys where they are. */
  upsert(items: Item | Item[]): void
  /** Removes items by key. */
  remove(keys: string | string[]): void
  /** Changes its options. What's left out stays as it was. */
  update(options: Partial<Options>): void
  /** Opens its tab or page. */
  reveal(): Promise<void>
}

/** A form, which tells the extension when the person changes a field. */
export interface FormView extends View<FormField> {
  /** Called with a field's key and new value each time the person changes it. The form shows the new value at once. */
  onChange(handler: (key: string, value: string | number | boolean) => void): Disposable
}

/**
 * Fills the tabs, sections and pages the manifest declares. Each takes the id of one whose `view` is that kind, once;
 * disposing of the view empties it again.
 */
export interface Views {
  table(id: string, options: TableOptions): View<ViewItem, TableOptions>
  tree(id: string, options?: ViewOptions): View<ViewItem>
  list(id: string, options?: ViewOptions): View<ViewItem>
  keyValue(id: string, options?: ViewOptions): View<ViewItem>
  form(id: string, options?: ViewOptions): FormView
}

/** A view's kind, options and items, as Parity draws it. */
export interface ViewData {
  kind: ViewKind
  options: ViewOptions & { columns?: string[] }
  items: (ViewItem | FormField)[]
}

/**
 * What an extension offers others, returned from its `activate`: functions that take and give JSON. Each runs in its
 * own extension's process, so another extension calls it across processes, and gets a promise of what it gives.
 */
export interface ExtensionApi {
  /** Its arguments are JSON too; `never` lets a function name the types it takes. */
  [method: string]: (...args: never[]) => void | JsonValue | Promise<void | JsonValue>
}

/** Another extension's API as a caller sees it: each function gives a promise. */
export type RemoteApi<Api> = {
  [Method in keyof Api]: Api[Method] extends (...args: infer Args) => infer Result
    ? (...args: Args) => Promise<Awaited<Result>>
    : never
}

/** Another extension the manifest names in `extensionDependencies`, with its API. */
export interface OtherExtension<Api> {
  id: string
  version: string
  displayName: string
  api: RemoteApi<Api>
}

/** The extensions this one builds on. */
export interface Extensions {
  /**
   * An extension the manifest names in `extensionDependencies`, by its id. Parity activates it before this one, so its
   * API is ready. Throws for an extension the manifest doesn't name.
   */
  get<Api extends object = ExtensionApi>(id: string): OtherExtension<Api>
}

/** What an agent passes an agent tool, as its schema in the manifest says. */
export type AgentToolInput = { [field: string]: JsonValue }

/**
 * Tools agents call through Parity's agent API (`parity run`, or MCP's `run_extension`), as the manifest's
 * `agentTools` declares them. While an agent's call runs, the extension's changes are one undo step named after the
 * agent and the extension, and `ui.pick`, `ui.input` and `ui.confirm` fail, since there's nobody to ask.
 */
export interface AgentTools {
  /**
   * Gives behaviour to a tool the manifest declares. Parity checks the input against its schema first. What the handler
   * returns goes to the agent, so it should be JSON. A second handler for one tool is refused.
   */
  register(name: string, handler: (input: AgentToolInput) => void | JsonValue | Promise<void | JsonValue>): Disposable
}
