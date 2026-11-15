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

/** Each kind of provider, by the name the manifest's `contributes.providers` declares it under. */
export interface ProviderKinds {
  router: RouterProvider
  styles: StylesProvider
  renderer: RendererProvider
  builder: BuilderProvider
  addresses: AddressProvider
  discovery: DiscoveryProvider
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
