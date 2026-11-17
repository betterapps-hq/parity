import type { ContainerSpec } from "./document.ts"
import type {
  ComponentEvidence,
  ComponentSample,
  LibraryBreakpoint,
  LibraryDecorator,
  LibraryIcons,
  ParentSignal
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
  /** Design tokens described in DTCG by the project's own `.lib.par` and by its libraries' `.lib.par` files. */
  describedTokens?: DescribedTokens[]
  /**
   * What the project's extensions put around every frame, as a router's extension puts a router there (PAR-1152): each
   * decorator with the extension's prefix, outermost first. They wrap the libraries' decorators. Module specifiers are
   * the project's own.
   */
  frameDecorators?: ExtensionDecorator[]
  /**
   * What runs in the app's own page when the canvas draws a route (PAR-1260): the page runtime, and the router's and
   * renderer's page modules. Each is a module of Parity's, by its absolute path, which the builder serves first in the
   * page. Unset when the project has no routes to draw.
   */
  pageModules?: PageModules
  /**
   * The project's preview file for Parity, `.parity/preview.tsx` or another script extension, relative to the root: its
   * Storybook preview exports (`decorators`, `loaders`, `parameters`, `globalTypes`, `initialGlobals`) apply to every
   * frame, inside the libraries' decorators (PAR-100). Without one, a preview an extension names for its tool, such as
   * Storybook's `.storybook/preview.tsx`, with `previewComposer` set (PAR-98).
   */
  preview?: string
  /** When `preview` is a tool's, named by an extension: how the guest applies it (PAR-98). */
  previewComposer?: PreviewComposer
  /**
   * The files the app's routes are made of, relative to the root, as its router's extension reads them: what a builder
   * looks through for the packages pages import before any page loads (PAR-1203). Unset for an app without a router.
   */
  routeFiles?: string[]
  /**
   * For a library's own project, with a `.lib.par` at its root: the library's id, which its own components are named
   * by (`nova/Button`), as the apps that install it name them.
   */
  namespace?: string
}

/**
 * How a tool's preview is applied: with `portable-stories`, the guest imports Storybook's portable stories API
 * (`setProjectAnnotations` and `composeStory`) from `module`, a package the project depends on, as the extension that
 * names the preview says (PAR-98).
 */
export interface PreviewComposer {
  api: "portable-stories"
  module: string
  /** The prefix of the extension that named the preview. */
  extension: string
}

/** The page runtime and the page modules a builder serves into the app's page, each by its absolute path. */
export interface PageModules {
  /** `@parity-app/page-runtime`'s module, which exports `startPageRuntime`. */
  runtime: string
  /** Page routers (`PageRouter`), the first the page finds being the one the runtime drives. */
  routers: PageModuleFile[]
  /** Hydration modules (`PageHydration`). */
  hydration: PageModuleFile[]
}

/** A page module: the prefix of the extension that gives it, its file, and the name it exports what the runtime takes. */
export interface PageModuleFile {
  extension: string
  file: string
  export: string
}

/** A decorator an extension declares, with the prefix of the extension that declares it. */
export interface ExtensionDecorator {
  extension: string
  decorator: LibraryDecorator
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
  /** What said a library part needs `parents`: its library's examples, its namespace, the error it throws alone. */
  parentsFrom?: ParentSignal
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
  /**
   * The props among `openProps` a library component declares, which say what of it is open or chosen, so its preview
   * draws it open (PAR-517).
   */
  openProps?: OpenProp[]
}

/**
 * Props that say what's open or chosen: `defaultOpen` on what opens (a dialog, a popover, a menu), `defaultValue` on
 * what opens or chooses its items by value (an accordion, a navigation menu, tabs) and `value` on those items.
 */
export const openProps = ["defaultOpen", "defaultValue", "value"] as const

export type OpenProp = (typeof openProps)[number]

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
   * and the file's name, as in `registry:@mui+material.lib.par`.
   */
  manifest?: string
  /** How its icons are imported and drawn, for an icon set. Module specifiers are the project's own, as `importName`. */
  icons?: LibraryIcons
  /** What its components need around them in every frame. Module specifiers are the project's own, as `importName`. */
  decorators?: LibraryDecorator[]
  /**
   * The component designs its `.lib.par` canvas holds, named by the library (`nova/settings-row`), for placing as
   * linked instances or detached copies.
   */
  designs?: ContainerSpec[]
}
