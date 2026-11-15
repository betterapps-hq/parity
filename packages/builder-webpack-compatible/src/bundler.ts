import { z } from "zod"

/*
 * The parts of a webpack-shaped bundler the builders use, written out here so the shared code needs neither webpack nor
 * Rspack installed: both shape their compiler, compilation and module graph this way. Each extension hands over its
 * tool's own, as the project installed it.
 */

/** A module in the bundle. A file's module has its path as `resource`; a virtual or a package's runtime one may not. */
export interface BundlerModule {
  resource?: string | null
}

/** A dependency between modules: what was asked for (`./button`), and how, as `import()` or a static import. */
export interface BundlerDependency {
  request?: string
  type: string
}

/** One module importing another. */
export interface BundlerConnection {
  module: BundlerModule | null
  originModule: BundlerModule | null
  dependency: BundlerDependency | null
}

/** What the bundle's module graph says about a module. */
export interface BundlerModuleGraph {
  getIncomingConnections(module: BundlerModule): Iterable<BundlerConnection>
  getOutgoingConnections(module: BundlerModule): Iterable<BundlerConnection>
  /** Its exports by name, `true` when the bundler can't tell (a CommonJS module), or null. */
  getProvidedExports(module: BundlerModule): true | string[] | null
  getModule(dependency: BundlerDependency): BundlerModule | null
}

/** A build's result. */
export interface BundlerCompilation {
  modules: Iterable<BundlerModule>
  moduleGraph: BundlerModuleGraph
  entries: ReadonlyMap<string, { dependencies: BundlerDependency[] }>
}

export interface BundlerStats {
  compilation: BundlerCompilation
  hasErrors(): boolean
  toString(options: { all: false; errors: true; colors: false }): string
}

interface Hook<Args extends unknown[]> {
  tap(name: string, callback: (...args: Args) => void): void
}

/** A compiler made from a config, as `webpack(config)` and `rspack(config)` give. */
export interface BundlerCompiler {
  hooks: {
    invalid: Hook<[string | null, number]>
    done: Hook<[BundlerStats]>
    failed: Hook<[Error]>
  }
  /** The files that changed since the build before, in watch mode. */
  modifiedFiles?: ReadonlySet<string>
  removedFiles?: ReadonlySet<string>
  watch(
    options: { aggregateTimeout?: number },
    handler: (error: Error | null) => void
  ): { close(done: () => void): void }
  run(handler: (error: Error | null, stats?: BundlerStats) => void): void
  close(done: (error?: Error | null) => void): void
}

/** A plugin instance, which the bundler applies to its compiler. */
export interface BundlerPlugin {
  apply(compiler: never): void
}

/** A plugin, as a config lists it: an instance with `apply`, kept as it is. */
export const bundlerPlugin = z.custom<BundlerPlugin>((value) => value instanceof Object && "apply" in value)

/**
 * A config, in webpack's shape, read only as far as the builder changes it. Everything else in it is the project's, and
 * passes through as its tool accepts it.
 */
export const bundlerConfig = z.looseObject({
  context: z.string().optional(),
  plugins: z.array(z.unknown()).optional(),
  module: z.looseObject({ rules: z.array(z.unknown()).optional() }).optional(),
  resolve: z
    .looseObject({ alias: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional() })
    .optional(),
  output: z.looseObject({}).optional(),
  optimization: z.looseObject({}).optional()
})

export type BundlerConfig = z.output<typeof bundlerConfig>

/** A module rule, as far as the builder reads one: the loaders it runs, and the rules nested in it. */
export const bundlerRule = z.looseObject({
  loader: z.string().optional(),
  use: z.array(z.union([z.string(), z.looseObject({ loader: z.string().optional() })])).optional(),
  oneOf: z.array(z.unknown()).optional(),
  rules: z.array(z.unknown()).optional()
})

/**
 * A bundler as an extension hands it over: what makes its compiler and the plugins the guest needs, from the project's
 * own copy of the tool.
 */
export interface Bundler {
  /** The tool's name, for messages and its cache folder: `Rspack`. */
  name: string
  version: string
  compiler(config: BundlerConfig): BundlerCompiler
  hotModuleReplacement(): BundlerPlugin
  define(definitions: Record<string, string>): BundlerPlugin
  /** Replaces the request of each import matching `test` with what `replace` gives for it. */
  replaceModules(test: RegExp, replace: (request: string) => string | undefined): BundlerPlugin
  /** Extracts the CSS each entry imports into a file of its own, and the loader its rules use for that. */
  extractCss?: { plugin(): BundlerPlugin; loader: string }
}
