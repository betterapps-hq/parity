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
  /**
   * The brand's color for each theme, as six-digit hexes such as `#FF4785`, which the logo takes when its status bar
   * item is hovered. Left out, the logo keeps the text's color.
   */
  color?: BrandColor
}

/** A brand color for the light theme and the dark, the same hex in both when one reads on either. */
export interface BrandColor {
  light: string
  dark: string
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

/**
 * How Parity finds an extension's tool in a project (PAR-1128), with no code of the extension's: it's found when any
 * rule holds, and `activates: ["onDetect"]` starts it then.
 */
export interface Detection {
  /**
   * Found when the project's package.json declares one of the packages its peer dependencies name. True when `detect`
   * is left out.
   */
  peers?: boolean
  /** Found when Parity's entities detection found the tool's files, for an extension with an entities provider. */
  entities?: boolean
  /**
   * Found when the first of these paths that names something exists, as `$PORTLESS_STATE_DIR` then `~/.portless`: from
   * the home folder, an environment variable's folder, which names nothing while it isn't set, or the project's root.
   * Its `read` permission has to name each. The extension gets the one found as `parity.project.detected.path`.
   */
  paths?: string[]
}

/** The `parity` field of an extension's `package.json`. */
export interface Manifest {
  /** The name people see. */
  displayName: string
  /** What every contributed id, setting key and context key starts with, before a dot: `timings` for `timings.measure`. */
  prefix: string
  icon: PathIcon
  activates: ActivationEvent[]
  /** How Parity finds its tool in a project, before its code loads. Without it, its peer dependencies say. */
  detect?: Detection
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
  /** What its dev build adds that isn't the project's own, which the Console panel and agents leave out. */
  console?: BuilderConsole
}

/** What a builder's dev build adds that isn't the project's own, as regular expressions' source. */
export interface BuilderConsole {
  /** Messages it writes to the console, as Vite's about hot updates: `^\[vite\]`. */
  chatter?: string[]
  /** Paths of modules it makes, from the server's root without the leading slash, as Vite's `@vite/client`: `^@`. */
  generatedPaths?: string[]
}

/** What Parity needs of a router before its code runs. */
export interface RouterContribution {
  /**
   * What goes around every frame, outermost first, so the components that need the app's router draw on their own: a
   * memory router, say, at the frame's URL. They wrap the libraries' own decorators.
   */
  decorators?: FrameDecorator[]
}

/**
 * A component the canvas puts around every frame, written as data, so it runs no code of the extension's own. Its
 * module is imported by the project's own build, so it's a package the project depends on, and its props are JSON or
 * the value forms libraries' decorators use: `{ "$frame": "url" }` is the URL the frame stands for, `/` unless it's a
 * page's, `{ "$frame": "content" }` an element drawing what it wraps, for a router that draws it as its root route,
 * and `{ "$call": { "import": "pkg", "export": "name" }, "args": [...] }` what calling an export returns, made once
 * for each frame.
 */
export interface FrameDecorator {
  /** Applies only when the frame's globals have these values, as in `{ "theme": "dark" }`. */
  when?: Record<string, string>
  wrap: {
    /** The module, by the specifier the project imports it by. */
    import: string
    /** The export to render, following dots into namespaces; `default` for a default export. */
    component: string
    props?: Record<string, JsonValue>
  }
}

/** The jobs an extension does for a tool, each given behaviour with `parity.providers.register`. */
export interface Providers {
  /** Draws components. Its guest module runs in the canvas frames, compiled into the project's own build. */
  renderer?: RendererContribution
  /** Starts the dev server. Its entry module runs in the builder process. */
  builder?: BuilderContribution
  /** Reads and writes the theme. */
  styles?: Record<string, never>
  /** Reads routes, and says what goes around every frame for the app's router. */
  router?: RouterContribution
  /** Imports screens such as stories, and writes them back. */
  entities?: EntitiesContribution
  /** Names the preview its tool keeps, which every frame draws inside, and how it's applied. */
  preview?: PreviewContribution
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

/**
 * A preview a tool keeps for the project, such as Storybook's `.storybook/preview.tsx`: every frame draws inside it when
 * the project has no `.parity/preview.*` (PAR-98). It's data, so Parity reads it before the extension's code runs, and
 * the renderer's guest applies it in the frames.
 */
export interface PreviewContribution {
  /** Where the tool keeps it, from the project's root; the first that's there is used. */
  files: string[]
  /**
   * How it's applied. `portable-stories` is Storybook's portable stories API (`setProjectAnnotations` and
   * `composeStory`), imported from the first package of `from` the project depends on.
   */
  compose: { api: "portable-stories"; from: string[] }
}

/**
 * An entities provider's contribution: the config files whose change Parity reads its tool's files again for, and how
 * Parity shows the screens it imports (PAR-1131). Without `group` and `states`, its screens are listed under its
 * display name, with states as any design's are.
 */
export interface EntitiesContribution {
  watches?: string[]
  /** What Layers lists its screens under, as `Stories`. */
  group?: string
  /** What a screen's states are called, as `story` and `stories`. */
  states?: { one: string; many: string }
  /** The colour of its screens' icons, a CSS colour in a light and in a dark theme. */
  color?: { light: string; dark: string }
}
