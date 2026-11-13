import type { StylePrinter } from "@parity-app/style-schema"
import { z } from "zod"
import type { ContainerSpec } from "./document.ts"
import type { GuestComponentSource } from "./guest-changes.ts"
import type { ComponentEvidence, LibraryDecorator } from "./library.ts"
import type { ProjectConfig } from "./project.ts"
import type { ComponentRenderStatus } from "./render-status.ts"
import type { RenderNode } from "./render.ts"
import { jsonText, parseData } from "./schema.ts"
import type { TokenCategory } from "./token-types.ts"

const packageVersions = z.record(z.string(), z.string())

/**
 * Where one of a package's entry points leads, as `exports` writes it: a file, a list to try in turn, conditions such
 * as `types` or `import` that each lead somewhere, or `null` for a path the package keeps to itself.
 */
export type ExportsTarget = string | null | ExportsTarget[] | { [condition: string]: ExportsTarget }

const exportsTarget: z.ZodType<ExportsTarget> = z.lazy(() =>
  z.union([z.string(), z.null(), z.array(exportsTarget), z.record(z.string(), exportsTarget)])
)

/**
 * The parts of a package.json Parity reads: the dependencies adapters detect a stack by, and where an installed
 * package's entry points and a workspace's packages are (PAR-573). It's someone else's file, so the fields Parity
 * doesn't read pass through unchecked.
 */
export const packageManifest = z.looseObject({
  name: z.string().optional(),
  version: z.string().optional(),
  dependencies: packageVersions.optional(),
  devDependencies: packageVersions.optional(),
  optionalDependencies: packageVersions.optional(),
  scripts: z.record(z.string(), z.string()).optional(),
  /** Entry points by subpath (`.`, `./tailwind.css`), or where the package's one entry point leads. */
  exports: exportsTarget.optional(),
  types: z.string().optional(),
  typings: z.string().optional(),
  module: z.string().optional(),
  main: z.string().optional(),
  /** The stylesheet a project imports to use the package, as some packages name it. */
  style: z.string().optional(),
  /** A workspace root's package folders, as npm, Yarn and Bun write them. */
  workspaces: z.union([z.array(z.string()), z.looseObject({ packages: z.array(z.string()).optional() })]).optional(),
  /** The command line it installs: one file named after the package, or files by command name. */
  bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
  /** Where its source is, which libgen reads examples from. */
  repository: z
    .union([z.string(), z.looseObject({ url: z.string().optional(), directory: z.string().optional() })])
    .optional(),
  /** The package manager and version a project asks for, as Corepack writes it (`pnpm@10.4.0`). */
  packageManager: z.string().optional(),
  /**
   * The versions of the tools a package ships inside it, by package name, as Vite+'s core writes them
   * (`{ "vite": "8.3.5" }`). Detection reads it when a project installs the package under one of those names.
   */
  bundledVersions: z.record(z.string(), z.string()).optional()
})

export type PackageManifest = z.infer<typeof packageManifest>

/**
 * A package.json's text, read through {@link packageManifest}. Throws `TypeError` naming the file and the field at
 * fault, as in `/app/package.json: /scripts/dev: expected a string`, or `/: expected JSON`.
 */
export function parseManifest(text: string, file: string): PackageManifest {
  try {
    return parseData(jsonText(packageManifest), text)
  } catch (error) {
    throw new TypeError(`${file}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

/**
 * Mounts components of one UI framework (React, Vue, Svelte…).
 *
 * The adapter has two halves. This object runs in the host and describes the framework. Its guest module is compiled by
 * the customer's own toolchain into the customer's module graph, so components render with the customer's copy of the
 * framework rather than the canvas app's.
 */
export interface RendererAdapter {
  id: string
  name: string
  detect(pkg: PackageManifest): boolean
  /** Module specifier, resolvable from the host, whose module exports `createGuest(init: GuestInit): Guest`. */
  guestModule: string
  /** Packages that must resolve to exactly one copy, taken from the customer's project. */
  runtimePackages: string[]
  /** Modules the guest imports, so a builder can prepare them before the first render. */
  runtimeImports: string[]
  /**
   * Modules a builder serves in place of ones the framework's production build leaves empty, by how their specifier
   * ends, with `$base` in the source standing for the rest of it. Frames run dependencies' production builds while the
   * project's own code is still compiled for development, so what that code imports for development has to work too.
   */
  developmentStandIns?: Record<string, string>
  /** File extensions that can hold this framework's components. */
  componentExtensions: string[]
  /**
   * The components a file exports, from its text alone, so a whole app can be read in a fraction of a second. The
   * file's name says how to read it (`.tsx`, `.jsx`, a `.d.ts` declaration) and names its default export.
   */
  findComponents(source: string, file: string): ComponentExport[]
}

/** An export a renderer recognises as a component. */
export interface ComponentExport {
  /** What it's called: the export's name, or for a default export, its declaration's name, else its file's. */
  name: string
  /** The export it's imported by: its name, or `default`. */
  export: string
  /** How it was recognised. Declaration files don't say. */
  as?: ComponentEvidence
}

/**
 * What a builder needs of the renderer: the packages and modules its guest runs on. Only data, so it can cross to the
 * builder's own process without the renderer's code, which reads components with TypeScript.
 */
export type BuilderRenderer = Pick<
  RendererAdapter,
  "id" | "name" | "guestModule" | "runtimePackages" | "runtimeImports" | "developmentStandIns"
>

export interface BuilderStartOptions {
  root: string
  config: ProjectConfig
  renderer: BuilderRenderer
  /** Absolute path of the renderer's guest module. */
  rendererGuestPath: string
  /** Origins allowed to load the guest module (the canvas UI). */
  allowedOrigins: string[]
  /** The port to serve on when it's free. Otherwise, or when it's unset, any free port. */
  port?: number
}

/** The extensions a JavaScript tool's config file may have: `vite.config.ts`, `.storybook/main.mjs`. */
export const scriptConfigExtensions = ["ts", "mts", "cts", "js", "mjs", "cjs"] as const

/**
 * Compiles a customer's components with the customer's own build setup (Vite, webpack, Next.js…) and serves them to the
 * canvas as a guest module.
 */
export interface BuilderAdapter {
  id: string
  name: string
  /**
   * The config files, relative to the project root, that say whether this builder serves the project (PAR-826).
   * Detection follows them, so adding or taking one away detects an open project again; the build tool follows a
   * change to one's contents itself.
   */
  configFiles: readonly string[]
  /** Whether this builder serves the project, asked of the project's own build tool where it can be. */
  detect(root: string): Promise<BuilderDetection>
  start(options: BuilderStartOptions): Promise<BuilderSession>
}

/** What a builder found: the tool's version and config file, or what it looked for when it found nothing. */
export interface BuilderDetection {
  found: boolean
  version?: string
  /** The config file, relative to the project root. */
  config?: string
  /** What was found, or what was looked for, in a sentence. */
  summary: string
}

export interface BuilderSession {
  /** URL of an ES module whose default export is a {@link Guest}. */
  guestUrl: string
  /** Version of the customer's build tool. */
  toolVersion: string
  /**
   * Tells `listener` each time a project file it serves changes on disk (PAR-165), so the canvas can load the components
   * it touches again. Returns what stops it.
   */
  codeChanges?(listener: (change: CodeChange) => void): () => void
  /**
   * Where the guest is served with its stylesheets as they are after the change stamped `stamp` (PAR-821). A builder
   * whose changes say `styles` serves there a guest that imports its stylesheets as they are now, at an address the
   * windows haven't loaded, since a page never loads a module twice; it keeps serving it there until it closes. A
   * builder without it is started again on a new port when its stylesheets change instead.
   */
  restyledGuestUrl?(stamp: number): string
  /**
   * The project files the modules of `files` load, themselves included, however deep, as the build tool resolved their
   * imports (PAR-994): what a frame's trace lists, beside what Parity's own import scan finds. Paths are relative to the
   * root, with forward slashes. Packages are left out, since the lockfile stands for them, and so are files a plugin only
   * watches, as Tailwind does every file it scans for class names. Nothing when the tool can't say for one of `files`,
   * as for a module it hasn't built yet.
   */
  loadedFiles?(files: string[]): Promise<string[] | undefined>
  close(): Promise<void>
}

/**
 * Project files whose code changed, by the builder's account: a file that changed on disk, and the components' files
 * that import it, however deep. Imported again with `?t=<stamp>`, each module imports what changed afresh too.
 */
export interface CodeChange {
  /** The component files among them, relative to the project root. */
  paths: string[]
  /** What they're stamped with, which goes up with each change. */
  stamp: number
  /**
   * One of the stylesheets the guest's compiled CSS is made from changed too, so the guest's CSS is new: the guest at
   * `BuilderSession.restyledGuestUrl(stamp)` imports them afresh (PAR-821).
   */
  styles?: boolean
}

/** A module as a build loaded it: its exports by name, whatever the customer's package exports. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- a customer's package can export anything; the renderer reads it by name
export type ModuleExports = Record<string, unknown>

/** What a builder passes to the renderer's `createGuest`. */
export interface GuestInit {
  /** The project's components by id, as its modules export them. */
  components: ModuleExports
  /** Components loaded the first time they're drawn: each resolves to the component, or one that shows why it can't. */
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- a component is whatever the customer's module exports
  lazyComponents?: Record<string, () => Promise<unknown>>
  /**
   * Icon packages by library id, whole: an icon is `lucide/Heart`, or `heroicons/16/solid/CogIcon` in a style kept in
   * a module of its own, looked up by name when it's used.
   */
  iconSets?: Record<string, GuestIconSet>
  /** The project's compiled styles, before canvas preparation. */
  css: string
  /**
   * Stylesheets the app imports from packages (`@mantine/core/styles.css`), drawn before the project's styles but not
   * read for tokens: a library's tokens come from its `.lib.par`, and the rest are its components' own variables.
   */
  packageCss?: string
  /** Libraries' decorators, outermost first, with the modules they import by specifier. */
  decorators?: GuestDecorators
  /** Categories for custom properties libraries describe, by name without `--`. */
  tokenCategories?: Record<string, TokenCategory>
}

/** One icon package, and how its icons are drawn. */
export interface GuestIconSet {
  /** The package's module: its exports are the icons, or the data a renderer draws. */
  module: ModuleExports
  /** The modules of styles it keeps in modules of their own, by the key its icons' ids name each with. */
  styles?: Record<string, ModuleExports>
  /** Exports that are icons, as a regular expression. Defaults to every export that can be one. */
  match?: string
  /** Exports that look like icons but aren't. */
  exclude?: string[]
  /** The component that draws an icon given as data, and the prop that takes it. */
  renderer?: { component: unknown; prop: string }
}

export interface GuestDecorators {
  list: { library: string; decorator: LibraryDecorator }[]
  /** Modules by specifier; a module that failed to load is the error it failed with. */
  modules: Record<string, ModuleExports | { loadError: string }>
}

/** The renderer's guest runtime, loaded into the canvas from the customer's build. */
export interface Guest {
  renderer: string
  components: string[]
  /** Whether a component, or an icon from one of its icon sets, exists. */
  hasComponent(name: string): boolean
  /**
   * Adds the project's components found after the guest loaded, by the type checker or in files added since, by id.
   * Each loads the first time it's drawn. An id the guest already has is drawn from its new file from then on, as when
   * a component moves, and one given a new `version` loads its module again, as when its code changed (PAR-165).
   */
  addComponents?(sources: Record<string, GuestComponentSource>): void
  /**
   * Takes back components `addComponents` gave whose source went away. One the guest loaded with is drawn as it loaded
   * again; one it was only given is no longer a component. Ids it wasn't given change nothing.
   */
  removeComponents?(ids: string[]): void
  /**
   * Which of the project's code the guest draws with: a number that goes up each time `addComponents` or
   * `removeComponents` changes where a component comes from, so frames drawn before can be drawn again. `subscribe` hears when it does.
   */
  revision?: {
    get: () => number
    subscribe: (listener: () => void) => () => void
  }
  /**
   * Resolves once the components drawn so far that load on demand have loaded, so an offscreen render or a screenshot
   * can wait for them.
   */
  loaded?(): Promise<void>
  /**
   * How each component drawn so far fares, by id: drawn, or failing in at least one frame now, with what it threw.
   * `subscribe` hears when that changes.
   */
  renderStatus?: {
    get: () => Record<string, ComponentRenderStatus>
    subscribe: (listener: () => void) => () => void
  }
  /**
   * The names of an icon set's icons, as in `Heart` for `lucide/Heart`; in a style it keeps in a module of its own,
   * those that module exports, by the style's key (`16/solid` for `heroicons/16/solid/CogIcon`).
   */
  iconNames?(library: string, style?: string): string[]
  /** The other names an icon set exports its icons under, by the name `iconNames` gives, for search. */
  iconAliases?(library: string, style?: string): Record<string, string[]>
  css: string
  packageCss?: string
  tokenCategories?: Record<string, TokenCategory>
  /** Renders a resolved design. Components the guest doesn't know render as a visible placeholder. */
  mount(target: HTMLElement, tree: RenderNode[], options?: MountOptions): MountHandle
}

export interface MountOptions {
  /**
   * An error the frame hit. `layer` is set when a component's boundary caught it: that component draws its error box
   * in its place and the rest of the frame draws. Without it, the error stopped the frame drawing.
   */
  onError?(cause: unknown, layer?: { nodeId: string; component: string }): void
  /**
   * The frame's failing layers, each time they change: one entry for each node whose component is drawing its error
   * box, empty once they all draw again. Not called after the frame is unmounted.
   */
  onFailures?(failures: readonly LayerFailure[]): void
  /**
   * The frame's mode as Storybook globals: each variable's chosen option, as in `{ theme: "dark", viewport: "mobile" }`.
   * Decorators read them.
   */
  globals?: Record<string, string>
  /** Renders without the libraries' decorators, as the Icons panel's previews do. */
  bare?: boolean
  /**
   * The window the frame stands for. The project's code that asks the window its size (`matchMedia`, `innerWidth`,
   * resize events) gets this instead of Parity's window while it renders the frame or handles its events.
   */
  viewport?: FrameViewport
}

/** A layer whose component failed to draw in a frame, and what it threw. */
export interface LayerFailure {
  /** The design node, as the render tree names it: prefixed with its instance's path inside a component design. */
  nodeId: string
  component: string
  error: string
}

export interface FrameViewport {
  width: number
  height: number
}

export interface MountHandle {
  update(tree: RenderNode[]): void
  /** The frame's window changed size, as when its frame is resized. */
  resize?(viewport: FrameViewport): void
  unmount(): void
  /**
   * Where the frame's design nodes are drawn now, read from the framework's own tree, so a component is found even when
   * it renders none of its props. The same object comes back while nothing in the frame has changed. Undefined when
   * that tree can't be read, as when a framework release changes it: the canvas then finds nodes by their
   * `data-canvas-node` attribute, which only components that pass their props to their DOM carry.
   */
  drawnNodes?(): DrawnNodes | undefined
}

/** The DOM each of a frame's design nodes draws. */
export interface DrawnNodes {
  /** Every node drawn, parents before their children. */
  ids: readonly string[]
  /**
   * The elements a node draws at its top level, in order: one for most, several for a component that returns a
   * fragment, the top-level elements of the nodes it draws without an element of its own around them, and none for a
   * component that draws nothing.
   */
  elements(id: string): readonly Element[]
  /**
   * The text a node draws at its top level, outside any element of its own: all a component that draws only text
   * (`function Label() { return "Email" }`) has, so its box is its text's.
   */
  texts(id: string): readonly Text[]
  /** The node a node is drawn inside. */
  parent(id: string): string | undefined
  /** The node an element in the frame belongs to: the innermost one that draws it or an element around it. */
  nodeOf(element: Element): string | undefined
}

/**
 * Reads a styling framework's theme (Tailwind, Panda, vanilla-extract…) from a project's own installation. Compiled CSS
 * only carries the variables the project's code already uses; the theme has every value a design may pick.
 */
export interface StylesAdapter {
  id: string
  name: string
  /** Whether a stylesheet of the project uses this framework. */
  detect(source: string): boolean
  /** Every theme variable, resolved by the project's own copy of the framework. */
  loadTheme(root: string, stylesheet: string): Promise<ThemeVariable[]>
  /**
   * The framework's way of writing a layer's declarations, and of reading its code back, as the project's own copy
   * means it. Its code is a list of classes.
   */
  loadPrinter(root: string, stylesheet: string): Promise<ClassPrinter>
  /**
   * Writes token values into the stylesheet's source where the framework keeps them, and takes out those without a
   * value, keeping everything else as written. `theme` is what `loadTheme` read. A project no adapter reads has plain
   * custom properties, which `writeTokenChanges` in `@parity-app/tokens` writes.
   */
  writeTokens(source: string, writes: readonly TokenWrite[], theme: readonly ThemeVariable[]): string
}

/** A styling framework that writes a layer's declarations as classes, and compiles classes as the project's build does. */
export interface ClassPrinter extends StylePrinter<string[]> {
  /**
   * The CSS these classes compile to in this project, as one stylesheet in the framework's own cascade layer and
   * order, so a frame that gives its elements the classes draws them as the project's built CSS would (PAR-942). A
   * class the framework doesn't know compiles to nothing.
   */
  css(classes: readonly string[]): string
}

/** A theme variable without its `--`, as the framework defines it. */
export interface ThemeVariable {
  name: string
  value: string
}

/**
 * Translates a tool's own files, which Parity doesn't read itself, to Parity's entities, and back: Storybook's stories
 * to screens, for one. It reads through `source`, so it runs without a disk, and gives back only entities, so nothing
 * outside it knows the tool's format. A project can have several: each fills in the entities its tool describes.
 */
export interface EntitiesAdapter {
  id: string
  name: string
  /** Whether the project uses the tool, from its package.json. */
  detect(pkg: PackageManifest): boolean
  /** The entities the tool's files describe. */
  import(source: EntitiesSource): Promise<ProjectEntities>
}

/** How an entities adapter reads a project: its files, and which of the project's components an import names. */
export interface EntitiesSource {
  /** The project's files whose path matches, from the root, with forward slashes, leaving out dependencies and builds. */
  files(match: RegExp): Promise<string[]>
  /** A file's text by its path from the root, or undefined when there's no such file. */
  read(path: string): Promise<string | undefined>
  /** The key of the project's component that `file` imports as `name` from `specifier`, if it's one. */
  componentFor(file: string, specifier: string, name: string): Promise<string | undefined>
}

/** Parity's entities, as far as a tool's files describe them. */
export interface ProjectEntities {
  screens?: ImportedScreen[]
}

/** A screen read from a tool's files, with where it came from. */
export interface ImportedScreen {
  /** The adapter that read it. */
  adapter: string
  /** Where it is in the tool's files, unique among the adapter's: a story as `src/stories/button.stories.tsx#Outline`. */
  ref: string
  /** The group it's listed in, as a story's title: `UI/Button`. */
  group: string
  screen: ContainerSpec
}

/**
 * Lists an app's routes from its router's own files (TanStack Router, React Router…), so the canvas can draw each page
 * (PAR-1073). The app's own entry draws a page at its URL; the adapter only says which routes there are.
 */
export interface RouterAdapter {
  id: string
  name: string
  /** Whether the project uses this router, from its package.json. */
  detect(pkg: PackageManifest): boolean
  /**
   * The project's routes, each parent before its children, read through `read`: a file's text by its path from the
   * project root, with forward slashes, or undefined when there's no such file. Empty when the router's files aren't
   * there, as before its tooling first writes them.
   */
  readRoutes(read: (path: string) => string | undefined): ProjectRoute[]
}

/** One route of an app, as its router declares it. */
export interface ProjectRoute {
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
}

/**
 * A token value Save writes in one theme (`default` for the root, otherwise the theme it names, such as `dark`), or
 * `value` undefined to take the token's declaration out of that theme: a value the theme didn't have, undone after it
 * was saved.
 */
export interface TokenWrite {
  /** Without `--`. */
  name: string
  theme: string
  value: string | undefined
}
