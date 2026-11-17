import type { Disposable, Route } from "./api.ts"
import type { Address, Endpoint } from "./processes.ts"

/*
 * Providers: jobs an extension does for Parity, declared in its manifest's `contributes.providers` and given behaviour
 * with `parity.providers.register`. Parity calls a provider with plain data and waits for its answer, so each method is
 * asynchronous and takes and returns only what JSON can carry. An address or discovery provider's call has a time
 * limit: an answer that's late, throws or doesn't fit is left out, and the rest go ahead.
 */

/** Reads an app's routes from its router's own files, so the canvas draws each page. */
export interface RouterProvider {
  /**
   * The project's routes, each parent before its children. Empty when the router's files aren't there, as before its
   * tooling first writes them. Parity asks while the project opens.
   */
  routes(): Promise<Route[]>
}

/**
 * Reads a styling framework's theme from the project's own installation, writes a layer's declarations as its classes,
 * writes token values where it keeps them, and says where a library's stylesheet is imported and which classes set an
 * element's own size. Stylesheets are named by their path from the project's root.
 */
export interface StylesProvider {
  /** Whether one of the project's stylesheets uses the framework, from its text. */
  handles(request: { source: string }): Promise<boolean>
  /**
   * Every theme variable the stylesheet defines, resolved by the project's own copy of the framework, and the steps of
   * its scales that designs use, as `spacing-4` on `spacing`, each `derived` from its base.
   */
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
  /**
   * The stylesheet's source with an import of a library's stylesheet, by its specifier, where the framework builds it:
   * Tailwind's right after its own import, so the library's token defaults come first and the project's still win.
   * Parity asks only when the source doesn't import it yet.
   */
  importStyles(request: { source: string; specifier: string }): Promise<string>
  /**
   * For each element's classes, as a component writes them on the outermost element it returns, whether they set the
   * element's own size, so text put inside is cut off or spills out rather than sizing it.
   */
  setsOwnSize(request: { classes: string[][] }): Promise<boolean[]>
}

/** A theme variable without its `--`, as the framework defines it. */
export interface ThemeVariable {
  name: string
  value: string
  /** A step of a scale built on another variable, as `spacing-4` is four of `spacing`: it follows its base. */
  derived?: { from: string; factor: number }
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

/**
 * Reads which components a UI framework's files export (React, Vue, Svelte…). What it draws with is its guest module,
 * which the manifest's `providers.renderer` names, compiled into the project's own build and run in the canvas frames.
 */
export interface RendererProvider {
  /**
   * The components each file exports, read from its text alone, in the order the files are given. A file's name says
   * how to read it (`.tsx`, `.jsx`, a `.d.ts` declaration) and names its default export. Parity asks a batch at a time.
   */
  components(request: { files: SourceFile[] }): Promise<ComponentExport[][]>
}

/** A file's path, from the project root or absolute, and its text. */
export interface SourceFile {
  file: string
  source: string
}

/** An export a renderer recognises as a component. */
export interface ComponentExport {
  /** What it's called: the export's name, or for a default export, its declaration's name, else its file's. */
  name: string
  /** The export it's imported by: its name, or `default`. */
  export: string
  /** How it was recognised. Unset where only the type checker can decide, as for a declaration file's exports. */
  as?: "function" | "forwardRef" | "memo" | "lazy" | "class" | "exotic"
}

/**
 * Says whether a build tool serves the project, and which global stylesheets the app loads. What starts its dev server
 * is its entry module, which the manifest's `providers.builder` names, run in a builder process of its own.
 */
export interface BuilderProvider {
  /**
   * Whether the project's own copy of the tool serves it, with the tool's version and its config file, asked of the
   * tool itself. Fails when the tool can't load the project's config, with why.
   */
  detect(): Promise<BuilderDetection>
  /**
   * The global stylesheets the app loads, as the tool resolves the app's imports from its entries: the ones its root
   * module imports, not a component's own. Parity draws the canvas with them and reads the theme from them, and has no
   * other source, so empty means the app loads none, as with CSS-in-JS. Parity asks while the project opens, and again
   * when one of the files in `from` changes. A builder without it gives the canvas no global styles.
   */
  styles?(): Promise<AppStyles>
}

/** The global stylesheets an app loads, as its builder reports them. */
export interface AppStyles {
  /** The project's own, by path from its root with forward slashes, in the order the app loads them. */
  styles: string[]
  /** Packages' stylesheets, by the specifier that loads them, as `@mantine/core/styles.css`, in the order loaded. */
  packageStyles: string[]
  /** The project files the answer came from, such as the module that imports them, from the root with forward slashes. */
  from: string[]
}

/** What a builder found: its tool's version and config file, and what it looked for, in a line. */
export interface BuilderDetection {
  found: boolean
  version?: string
  /** Its config file, from the project root, with forward slashes. */
  config?: string
  summary: string
}

/**
 * Translates a tool's own files, which Parity doesn't read itself, to Parity's entities, and back: Storybook's stories
 * to screens, for one. Parity makes the canvas file and its nodes from what `import` gives, and calls `export` on Save.
 * Designs cross as Parity's `.par` JSON, which Parity checks both ways.
 */
export interface EntitiesProvider {
  /** The screens the tool's files describe, and the code they draw that isn't one of the project's components. */
  import(request: { components: ProjectComponents }): Promise<ImportedEntities>
  /**
   * A screen it imported, as edited in Parity, written back to the tool's files: each file it changes, with its whole
   * new text. None when the edit is one the tool's files can't hold.
   */
  export(request: { screen: ImportedScreen; edited: Design; components: ProjectComponents }): Promise<FileWrite[]>
}

/** A design, as Parity's `.par` files write it, which Parity checks whenever an extension gives one. */
export interface Design {
  id: string
}

/** The project's components by key: each one's file, or for a library's, the package it's imported from, and export. */
export type ProjectComponents = Record<string, { path: string; export: string; library?: string }>

/** What a tool's files describe. */
export interface ImportedEntities {
  screens?: ImportedScreen[]
  /** Code the screens draw that isn't a project component, by the id their component layers name: its file and export. */
  sources?: { [id: string]: { path: string; export: string } }
}

/** A screen read from a tool's files, with where it came from. */
export interface ImportedScreen {
  /** The extension that read it, by its prefix. */
  adapter: string
  /** Where it is in the tool's files, unique among the extension's: a story as `src/stories/button.stories.tsx#Outline`. */
  ref: string
  /** The group it's listed in, as a story's title: `UI/Button`. */
  group: string
  /** The folders Layers lists it in, outermost first. */
  folders?: string[]
  /** The project's component it's about, by its key. */
  component?: string
  screen: Design
}

/** A file to write, by its path from the project root, with its whole new text. */
export interface FileWrite {
  path: string
  text: string
}

/** What an address provider is told about a server. Nothing of its output or environment. */
export interface ServerFacts {
  /** Its id among the project's processes. */
  id: string
  name: string
  endpoint: Endpoint
  pid?: number
  /** Its folder, when Parity knows it. */
  cwd?: string
}

/** An address a provider gives, which Parity marks with the provider's id. */
export type ProvidedAddress = Omit<Address, "provider">

/** Says where else a server is reached, as a name Portless routes to it. Asked within 2 seconds. */
export interface AddressProvider {
  /** The other places each server is reached, for a batch of servers with an endpoint. */
  addresses(servers: ServerFacts[]): Promise<{ server: string; addresses: ProvidedAddress[] }[]>
}

/** A server running that Parity didn't start, as a discovery provider finds it. */
export interface DiscoveredServer {
  /** Stable while the server runs, as `storybook.shop` for a route. */
  key: string
  /** On this machine: Parity drops a server whose endpoint isn't. */
  endpoint: Endpoint
  name?: string
  pid?: number
  cwd?: string
  /** Addresses the provider knows it by, under the same rules as an address provider's. */
  addresses?: ProvidedAddress[]
}

/** Finds servers running that Parity didn't start, when an extension calls `processes.find`. Asked within 5 seconds. */
export interface DiscoveryProvider {
  /** Servers running now, for the open project. */
  discover(project: { root: string }): Promise<DiscoveredServer[]>
  /** How long an answer stays good, in milliseconds. Kept until `changed()` unless said. */
  maxAgeMs?: number
}

/**
 * Knows a family of component libraries that the project's dependencies' names alone don't identify, such as the
 * components shadcn/ui copies into an app or shadcn-sync generates there, and sets them up. Parity asks `detect` while
 * the project opens, and `catalog` and `add` from the Components panel's Add library.
 */
export interface LibrariesProvider {
  /** The libraries the project uses that its dependencies' names alone don't identify, each described by a registry file. */
  detect(): Promise<DetectedLibrary[]>
  /** The libraries it can set up, each with the settings it asks for, set to what the project uses now or defaults. */
  catalog(): Promise<CatalogLibrary[]>
  /**
   * What setting one up with the chosen settings takes: the package.json changes and files to write. Parity writes
   * them, then installs with the project's package manager, which runs the scripts it adds.
   */
  add(request: LibraryRequest): Promise<LibrarySetupPlan>
  /**
   * What taking one it set up out of the project takes: the packages to uninstall, the scripts to change, and the
   * stylesheet import to drop. Parity changes package.json and the stylesheet first, then uninstalls.
   */
  remove(request: LibraryRemoval): Promise<LibraryRemovalPlan>
}

/** A library a libraries provider found in the project, which Parity reads with a file in its registry. */
export interface DetectedLibrary {
  /**
   * The package whose newest file in Parity's registry describes it, as `@buildkitgg/shadcn-baseui-nova`, whether or not
   * that package is installed.
   */
  registry: string
  /**
   * The dependency its components are imported from, as `@buildkitgg/shadcn`. Left out when the components are the
   * app's own, as shadcn's CLI copies them, so only the tokens the registry file describes are read.
   */
  package?: string
  name: string
  description: string
  /** Its stylesheet, from the package's folder, as `tailwind.css`, for the app's stylesheet to import. */
  styles?: string
  /** An icon package its components draw with, as `@phosphor-icons/react`, read as an icon library too. */
  icons?: string
}

/** A library a libraries provider can set up from the Components panel. */
export interface CatalogLibrary {
  /** Unique among the provider's, as `shadcn`. */
  id: string
  name: string
  description: string
  /** The package its components are imported from once it's set up. */
  package: string
  /** Its pages, which the catalog links to. */
  links?: LibraryLinks
  /** The version it sets up, when it's known before it's set up. */
  version?: string
  /** The catalog id of an icon set offered alongside it, as Tabler Icons beside Mantine. */
  companion?: string
  /** What it asks before it's set up, each set to what the project uses now or a default. */
  settings: LibrarySetting[]
  /** Whether the project has it set up already, so adding it again changes its settings. */
  installed: boolean
}

/** A library's pages: its website, its docs, a Storybook of its components, and its source. */
export interface LibraryLinks {
  website?: string
  docs?: string
  storybook?: string
  source?: string
}

/** A choice a library asks for before it's set up, such as shadcn's style. */
export interface LibrarySetting {
  id: string
  label: string
  options: { value: string; label: string }[]
  /** One of the options' values. */
  value: string
}

/** Which of its catalog's libraries to set up, with a value for each of its settings, by id. */
export interface LibraryRequest {
  library: string
  settings: Record<string, string>
}

/**
 * What setting a library up changes in the project, as data. Parity merges the package.json fields into the project's,
 * replacing an entry of the same name, imports `styles` into the app's stylesheet, and installs.
 */
export interface LibrarySetupPlan {
  /** Dependencies at the ranges given. */
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  /** Dependencies to add at the newest version, which the package manager picks and writes. */
  packages?: string[]
  /** Scripts by name, each replacing the project's script of that name. */
  scripts?: Record<string, string>
  /** A stylesheet the app's own stylesheet imports, by its specifier, as `@buildkitgg/shadcn/tailwind.css`. */
  styles?: string
}

/** Which of its catalog's libraries to take out of the project. */
export interface LibraryRemoval {
  library: string
}

/**
 * What taking a library out changes in the project, as data. Parity writes the scripts into package.json and drops the
 * stylesheet import, then uninstalls the packages with the project's package manager.
 */
export interface LibraryRemovalPlan {
  /** Dependencies to uninstall, by name. Packages it added that the project may use itself, as an icon set, stay. */
  packages?: string[]
  /** Scripts by name: each one's new text, or `null` to remove it. */
  scripts?: Record<string, string | null>
  /** A stylesheet import to drop from the app's stylesheet, by its specifier. */
  styles?: string
}

/** Each kind of provider, by the name the manifest's `contributes.providers` declares it under. */
export interface ProviderKinds {
  router: RouterProvider
  styles: StylesProvider
  renderer: RendererProvider
  builder: BuilderProvider
  entities: EntitiesProvider
  addresses: AddressProvider
  discovery: DiscoveryProvider
  libraries: LibrariesProvider
}

/** A registered provider. Disposing it takes it away. */
export interface ProviderHandle extends Disposable {
  /** Says what it would answer has changed, as when Portless's routes do, so Parity asks again. */
  changed(): void
}

/** `parity.providers`. */
export interface ProviderRegistry {
  /** Gives behaviour to a provider the manifest's `contributes.providers` declares. A second of one kind is refused. */
  register<Kind extends keyof ProviderKinds>(kind: Kind, provider: ProviderKinds[Kind]): ProviderHandle
}
