import type { ContainerSpec } from "./document.ts"
import type {
  ComponentEvidence,
  ComponentSample,
  LibraryBreakpoint,
  LibraryDecorator,
  LibraryIcons
} from "./library.ts"
import type { DescribedToken } from "./token-types.ts"

/**
 * What the canvas knows about a project. It is inferred from the project itself (see `@parity-app/project`), never
 * written by hand. Framework-neutral: builders decide how to load each entry.
 */
export interface ProjectConfig {
  /** Global style entry files, relative to the project root. */
  styles: string[]
  /**
   * Stylesheets the app entry imports from packages, by the specifier it imports them by
   * (`@mantine/core/styles.css`). They load before the project's own, as they do in the app, and are never written to.
   */
  packageStyles?: string[]
  /** Components the canvas can place, keyed by component id. */
  components: Record<string, ComponentSource>
  /** Project files (`*.par`), relative to the project root. */
  documents: string[]
  /** Component libraries the project depends on, whose components the canvas can place too. */
  libraries: LibraryInfo[]
  /** The project's Storybook, when it has one. */
  storybook?: StorybookInfo
  /** Design tokens described in DTCG by the project's own `.lib.par` and by its libraries' `.lib.par` files. */
  describedTokens?: DescribedTokens[]
  /**
   * For a library's own project, with a `.lib.par` at its root: the library's id, which its own components are named
   * by (`nova/Button`), as the apps that install it name them.
   */
  namespace?: string
}

/** The tokens one `.lib.par` describes, or why they couldn't be read. */
export interface DescribedTokens {
  /** The library's name. */
  name: string
  /** Its `.lib.par`, relative to the project. */
  manifest: string
  tokens: DescribedToken[]
  error?: string
}

/** How to reach a project's Storybook, and which components have stories there. */
export interface StorybookInfo {
  /** Its config folder, relative to the root, usually `.storybook`. */
  configDir: string
  /** Its `main` config file, relative to the root, such as `.storybook/main.ts`. */
  main?: string
  /** The package.json script that starts it, if there is one. */
  script?: string
  /** The port that script asks for. */
  port?: number
  /** Story files by component id. */
  stories: Record<string, StoryFile[]>
}

export interface StoryFile {
  /** Relative to the project root. */
  path: string
  /** The title its meta sets, when it doesn't leave it to the file's path. */
  title?: string
  /** The stories it exports, by export name. */
  exports: string[]
}

export interface ComponentSource {
  /** Module path relative to the project root, or for a library's component, the package name it's imported by. */
  path: string
  /** Export name within the module. */
  export: string
  /** The library a component comes from, by id; unset for the project's own components. */
  library?: string
  /** A library component's type declarations, relative to the project root, for reading its props. */
  declaration?: string
  /** The family it's listed with, when its file doesn't say: Base UI's `Dialog.Root` is in `Dialog`. */
  group?: string
  /**
   * Loaded the first time it's drawn, not when the canvas starts: the app's own components outside the UI kit, whose
   * modules can import much of the app.
   */
  lazy?: boolean
  /** How the project's own component was recognised. Unset when only the type checker can say it's one. */
  as?: ComponentEvidence
  /** The person put it on the list, though detection left it out, so detection doesn't take it off. */
  included?: true
  /** A library part's parents by component id, outermost first: inserting it alone places it inside them. */
  parents?: string[]
  /** Those of `parents` left out when the ones outside them are already there, by component id. */
  optionalParents?: string[]
  /** Its parents are inserted with the other parts their samples hold, which it needs to draw. */
  parentParts?: true
  /** A part its library renders inside its own components, listed apart in the Components panel. */
  internal?: true
  /** A provider or context that draws nothing: listed so parts go inside it, not offered to insert on its own. */
  visual?: false
  /** What a library component is inserted with: sample props, and children by component id or as text. */
  sample?: ComponentSample
}

/** A component library installed in the project, such as Buildkit's shadcn styles. */
export interface LibraryInfo {
  id: string
  name: string
  /** Components to compose with, or icons, which are components too but are many and take no children. */
  kind?: "components" | "icons"
  description?: string
  /** The package as published. */
  package: string
  /** The name the project depends on it by, which can be an alias of the package. */
  importName: string
  version?: string
  /**
   * Its folder, relative to the project, for a package in the same workspace as the app: its components are read from
   * source, and the app's own build compiles them, so the dev server doesn't pre-bundle it.
   */
  workspace?: string
  /** Its Tailwind entry, imported from the project's stylesheet so its classes and tokens are built. */
  tailwindEntry?: string
  /** Whether the project's stylesheet imports the library's styles yet. */
  stylesImported: boolean
  /** The viewport widths the library is designed around, from its `.lib.par`. */
  breakpoints?: LibraryBreakpoint[]
  /**
   * Its `.lib.par`, relative to the project, when it has one; for a library Parity's registry describes, `registry:`
   * and the file's name, as in `registry:mui.lib.par`.
   */
  manifest?: string
  /** How its icons are imported and drawn, for an icon set. */
  icons?: LibraryIcons
  /** What its components need around them in every frame. */
  decorators?: LibraryDecorator[]
  /**
   * The component designs its `.lib.par` canvas holds, named by the library (`nova/settings-row`), for placing as
   * linked instances or detached copies.
   */
  designs?: ContainerSpec[]
}
