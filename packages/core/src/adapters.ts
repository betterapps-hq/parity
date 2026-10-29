import type { ComponentEvidence, LibraryDecorator } from "./library.ts"
import type { ComponentSource, ProjectConfig } from "./project.ts"
import type { RenderNode } from "./render.ts"
import type { TokenCategory } from "./tokens.ts"

/** The parts of a project's package.json that adapters use to detect a stack. */
export interface PackageManifest {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
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

export interface BuilderStartOptions {
  root: string
  config: ProjectConfig
  renderer: RendererAdapter
  /** Absolute path of the renderer's guest module. */
  rendererGuestPath: string
  /** Origins allowed to load the guest module (the canvas UI). */
  allowedOrigins: string[]
}

/**
 * Compiles a customer's components with the customer's own build setup (Vite, webpack, Next.js…) and serves them to the
 * canvas as a guest module.
 */
export interface BuilderAdapter {
  id: string
  name: string
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
  close(): Promise<void>
}

/** What a builder passes to the renderer's `createGuest`. */
export interface GuestInit {
  components: Record<string, unknown>
  /** Components loaded the first time they're drawn: each resolves to the component, or one that shows why it can't. */
  lazyComponents?: Record<string, () => Promise<unknown>>
  /** Icon packages by library id, whole: an icon is `lucide/Heart`, looked up by name when it's used. */
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
  module: Record<string, unknown>
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
  modules: Record<string, Record<string, unknown> | { loadError: string }>
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
   * a component moves.
   */
  addComponents?(sources: Record<string, Pick<ComponentSource, "path" | "export">>): void
  /**
   * Resolves once the components drawn so far that load on demand have loaded, so an offscreen render or a screenshot
   * can wait for them.
   */
  loaded?(): Promise<void>
  /** The names of an icon set's icons, as in `Heart` for `lucide/Heart`. */
  iconNames?(library: string): string[]
  css: string
  packageCss?: string
  tokenCategories?: Record<string, TokenCategory>
  /** Renders a resolved design. Components the guest doesn't know render as a visible placeholder. */
  mount(target: HTMLElement, tree: RenderNode[], options?: MountOptions): MountHandle
}

export interface MountOptions {
  onError?(error: unknown): void
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

export interface FrameViewport {
  width: number
  height: number
}

export interface MountHandle {
  update(tree: RenderNode[]): void
  /** The frame's window changed size, as when its frame is resized. */
  resize?(viewport: FrameViewport): void
  unmount(): void
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
}

/** A theme variable without its `--`, as the framework defines it. */
export interface ThemeVariable {
  name: string
  value: string
}
