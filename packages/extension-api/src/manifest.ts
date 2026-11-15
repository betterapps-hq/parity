/*
 * The manifest: the `parity` field of an extension's `package.json`. It lists every contribution and where it shows, so
 * Parity draws them before the extension's code loads, and loads the code only when one is used. Parity checks it when
 * it finds the extension and refuses one that breaks a rule, such as an id that doesn't start with `prefix`.
 */

/**
 * An extension's logo as path data, so it can't run script and takes the text's color in both themes. The build converts
 * the extension's `icon.svg` to this.
 */
export interface PathIcon {
  /** The view box the path is drawn in, as an SVG's `viewBox`: `0 0 24 24`. */
  viewBox: string
  /** The path's data, as an SVG path's `d`. */
  path: string
  /** How the path fills where it crosses itself, as an SVG's `fill-rule`. `nonzero` when left out. */
  fillRule?: "nonzero" | "evenodd"
}

/** A contribution's icon: a name from the kit's icon set, in kebab case, such as `book-open` or `timer`. */
export type IconName = string

/**
 * What starts an extension's code:
 * - `onDetect`: its tool is in the project.
 * - `onCommand:id`: one of its commands runs.
 * - `onView:id`: one of its tabs or pages opens.
 * - `onNodeType:type`: a node of that type appears, once a window has the project open.
 * - `onStartup`: as soon as it's detected. It's discouraged.
 */
export type ActivationEvent =
  | "onDetect"
  | "onStartup"
  | `onCommand:${string}`
  | `onView:${string}`
  | `onNodeType:${string}`

/** What an extension may read, write, reach and change. */
export interface Permissions {
  /**
   * Paths it may read and watch, as globs: from the project's root, or outside it from the home folder (`~/.portless/**`)
   * or an environment variable's folder (`$PORTLESS_STATE_DIR/**`), which is left out while the variable isn't set.
   */
  read?: string[]
  /** Paths it may write through `parity.files.edit`. */
  write?: string[]
  /** Network hosts it reaches. They're shown, not enforced. */
  network?: string[]
  /**
   * What it may run through `parity.processes`, one entry per run: `bin:<package>`, `script:<name>`, `exec:<name>` or
   * `node:<path>`.
   */
  processes?: string[]
  /** Whether it may read what other extensions' and Parity's processes print, and their public addresses. */
  observe?: boolean
  /** Whether it may change designs. */
  edits?: boolean
}

/**
 * What an extension says of its tool's versions that its peer dependencies can't. The peer dependencies name the
 * packages that carry the version, the main one first, and the range it supports.
 */
export interface ToolVersionFacts {
  /** A scope every package of which is one of the tool's, as `@storybook/`. */
  scope?: string
  /** How the tool's majors are written, as Tailwind's `v` in `v4`. */
  prefix?: string
  /** Packages that ship the tool under another name and may be installed in its place, with their names for people. */
  distributions?: Record<string, string>
}

/** The `parity` field of an extension's `package.json`. */
export interface Manifest {
  /** The name people see. */
  displayName: string
  /** What every contributed id, setting key and context key starts with, before a dot: `timings` for `timings.measure`. */
  prefix: string
  icon: PathIcon
  activates: ActivationEvent[]
  /** A small module that says whether its tool is in the project, relative to the package. */
  detect?: string
  /** Files whose change means detecting again, as globs relative to the project's root. */
  watches?: string[]
  /** What its peer dependencies can't say of its tool's versions. */
  versions?: ToolVersionFacts
  permissions?: Permissions
  /** Other extensions whose API it uses, by id. */
  extensionDependencies?: string[]
  contributes: Contributions
}

/** Every contribution, by kind. */
export interface Contributions {
  commands?: CommandContribution[]
  /** Where each command shows, by placement. */
  menus?: Partial<Record<MenuPlacement, MenuItem[]>>
  keybindings?: Keybinding[]
  tabs?: TabContribution[]
  sections?: SectionContribution[]
  pages?: PageContribution[]
  statusItems?: StatusItemContribution[]
  nodeTypes?: NodeTypeContribution[]
  providers?: Providers
  agentTools?: AgentToolContribution[]
  /** Its settings, by key. */
  settings?: Record<string, SettingContribution>
}

/** A command, which its code gives behaviour with `parity.commands.register`. */
export interface CommandContribution {
  id: string
  /** What menus and Search actions call it. A title may be `%key%`, looked up in the extension's `package.nls.json`. */
  title: string
  icon?: IconName
  /** A line under its title in Search actions. */
  note?: string
  /** What its progress says while its code starts, the first time it runs. */
  starts?: string
}

/**
 * Where a command shows: a row in Layers, the canvas's right-click menu, a design's title, buttons in the Design tab's
 * heading, a card in the Components panel, a tile in Media, a process's menu in the processes list, Search actions, or
 * a group of the app menu.
 */
export type MenuPlacement =
  | "layers"
  | "canvas"
  | "designTitle"
  | "selectionHeading"
  | "componentCard"
  | "media"
  | "process"
  | "search"
  | `appMenu/${string}/${string}`

/** A command in one placement. */
export interface MenuItem {
  command: string
  /** A context key that must hold for it to show (see `parity.context`), or `!key` for one that mustn't. */
  when?: string
  /** A context key that must hold for it to run. Where it doesn't, it shows greyed, with `disabledReason`. */
  enablement?: string
  /** Why it's greyed, as "No story found". */
  disabledReason?: string
}

export interface Keybinding {
  command: string
  /** As the keymap writes keys: `mod+shift+t`. */
  key: string
  when?: string
}

/** The declarative views a tab, section or page can hold. */
export type ViewKind = "table" | "tree" | "list" | "form" | "keyValue"

/** A tab in the left, right or bottom panel. */
export interface TabContribution {
  id: string
  area: "left" | "right" | "bottom"
  title: string
  icon?: IconName
  view: ViewKind
}

/** A section in the Design tab, for nodes of a type or a selection `when` matches. */
export interface SectionContribution {
  id: string
  title: string
  nodeType?: string
  when?: string
  view: ViewKind
}

/** A page in a tab at the top, such as a setup guide. */
export interface PageContribution {
  id: string
  title: string
  icon?: IconName
  view: ViewKind
}

/** A status bar item, drawn with its last value until the code updates it. */
export interface StatusItemContribution {
  id: string
  /** What its tooltip calls it. */
  title: string
  /** Words after its value, as "in Storybook", which a narrow status bar leaves to screen readers. */
  label?: string
  /** Its icon. Without one it shows the extension's logo. */
  icon?: IconName
  /** The command a click runs. */
  command?: string
}

/** A node type, so its nodes draw and `onNodeType` works before the code loads. */
export interface NodeTypeContribution {
  id: string
  name: string
  icon?: IconName
  /** A CSS color. */
  color?: string
}

/** What Parity needs of a renderer before its code runs: its guest module, and what a builder prepares for it. */
export interface RendererContribution {
  /** The package export, as `./guest`, whose module exports `createGuest`. It runs in the canvas frames. */
  guest: string
  /** Packages that must resolve to exactly one copy, taken from the project. The renderer is found when it has all. */
  runtimePackages: string[]
  /** Modules the guest imports, so a builder can prepare them before the first render. */
  runtimeImports: string[]
  /**
   * Modules a builder serves in place of ones the framework's production build leaves empty, by how their specifier
   * ends, with `$base` standing for the rest of it.
   */
  developmentStandIns?: Record<string, string>
  /** File extensions that can hold the framework's components, as `.tsx`. */
  componentExtensions: string[]
}

/** What Parity needs of a builder before its code runs: its entry module, and the files that say it serves a project. */
export interface BuilderContribution {
  /** The package export, as `./builder`, whose module exports `builder`. It runs in the builder process. */
  entry: string
  /** Its config files, from the project root, whose coming or going means the project is detected again. */
  watches: string[]
}

/** The jobs an extension does for a tool, each given behaviour with `parity.providers.register`. */
export interface Providers {
  /** Draws components. Its guest module runs in the canvas frames, compiled into the project's own build. */
  renderer?: RendererContribution
  /** Starts the dev server. Its entry module runs in the builder process. */
  builder?: BuilderContribution
  /** Reads and writes the theme. */
  styles?: Record<string, never>
  /** Reads routes. */
  router?: Record<string, never>
  /** Imports screens such as stories, and writes them back. */
  entities?: Record<string, never>
  /** Finds screens, photos or videos in an outside library. */
  connector?: Record<string, never>
  /** Answers Search actions with results of its own. */
  search?: Record<string, never>
  /** Says where else a server is reached. */
  addresses?: Record<string, never>
  /** Finds servers running that Parity didn't start. */
  discovery?: Record<string, never>
}

/** A tool agents can call, with a JSON Schema for its input. */
export interface AgentToolContribution {
  name: string
  description: string
  /** A JSON Schema for an object. */
  input: { type: "object"; properties?: Record<string, JsonSchema>; required?: string[] }
}

/** A JSON Schema, which Parity passes on without reading. */
export interface JsonSchema {
  [keyword: string]: JsonValue
}

/** A setting, drawn on the extension's page with the kit's own controls. */
export interface SettingContribution {
  type: "string" | "number" | "boolean"
  default?: string | number | boolean
  /** The person's, for every project, or everyone's who opens the project. */
  scope: "app" | "project"
  title: string
  enum?: string[]
  enumTitles?: string[]
}

/** A value as JSON writes it. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
