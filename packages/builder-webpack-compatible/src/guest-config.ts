import type { z } from "zod"
import { appEntries, appPagePlugin } from "./app-pages.ts"
import { babelFromRoot } from "./babel.ts"
import { guestFiles } from "./browser-modules.ts"
import { type Bundler, type BundlerConfig, type BundlerPlugin, bundlerPlugin, bundlerRule, ruleUse } from "./bundler.ts"

/*
 * The project's own config, changed to build the guest beside the app: the guest's entry and the global stylesheets as
 * entries, with the app's own entries and its page for the canvas's route screens, classic scripts with one runtime and
 * hot updates, its CSS extracted, written to a folder of the builder's own. Everything else is the project's: its
 * rules, loaders, resolve settings and plugins, so its code compiles as it does for the app.
 */

export interface GuestConfigOptions {
  root: string
  /** The guest entry's file, absolute. */
  entry: string
  /** The project's global stylesheets, absolute, and packages' by specifier, in the order the app loads them. */
  styles: readonly string[]
  packageStyles: readonly string[]
  /** Where the build is written, absolute. */
  output: string
  /** Where the page loads the build from: the builder's server, with a trailing slash. */
  publicPath: string
  /** The global the guest's entry registers under, which also keeps its chunks apart from any other bundle's. */
  key: string
  /** The element-sources loader's file, absolute, run on the project's own JSX before its loaders. */
  elementSources: string
  /** The renderer's guest module, absolute, and the loader that gives it its address in the page. */
  renderer: { file: string; loader: string }
  /** The extensions a component's file may have, with the dot. */
  componentExtensions: readonly string[]
  /**
   * Packages the guest must share one copy of, as the folder the project resolves each to: an alias, so a module below
   * that has its own copy gets the project's, as Vite's `resolve.dedupe` does.
   */
  dedupe: Readonly<Record<string, string>>
  /** Modules the renderer serves in place of what React's production build leaves empty, by the end of the specifier. */
  standIns: Readonly<Record<string, string>>
}

/**
 * Plugins the app's dev server needs that the guest doesn't, by their class's name: HTML pages (Rsbuild's included),
 * which the app's page takes the first of again (`appPagePlugin`), and Fast Refresh.
 */
const appOnlyPlugins =
  /^(?:Html(?:Rspack|Webpack)?Plugin|RsbuildHtmlPlugin|ReactRefresh(?:Rspack|Webpack)?Plugin|ReactRefreshPlugin)$/

const cssExtractPlugins = /^(?:CssExtractRspackPlugin|MiniCssExtractPlugin)$/

/** The config the guest is built with, from the project's, as `bundlerConfig` read it. */
export function guestConfig(config: BundlerConfig, bundler: Bundler, options: GuestConfigOptions): BundlerConfig {
  const extract = bundler.extractCss

  // The project's own CSS extractor, if it has one, names its files as the app wants them (Rsbuild's, `static/css/`):
  // the builder's own, from the same tool, takes its place and writes them where the guest module fetches them.
  const plugins = (config.plugins ?? []).flatMap((entry) => {
    const plugin = bundlerPlugin.safeParse(entry)
    const name = plugin.success ? className(plugin.data) : ""

    return plugin.success && !appOnlyPlugins.test(name) && !(extract && cssExtractPlugins.test(name))
      ? [plugin.data]
      : []
  })

  // The app's own entries are built beside the guest's, for the pages the canvas draws routes from.
  const app = appEntries(config.entry)

  const projectPlugins = (config.plugins ?? []).flatMap((entry) => {
    const plugin = bundlerPlugin.safeParse(entry)

    return plugin.success ? [plugin.data] : []
  })

  const appPage = appPagePlugin(projectPlugins, Object.keys(app), options.publicPath)

  const entries = Object.fromEntries([
    ["main", { import: [options.entry], library: { type: "window", name: options.key } }],
    ...(options.styles.length > 0 ? [["styles", { import: [...options.styles] }]] : []),
    ...(options.packageStyles.length > 0 ? [["package-styles", { import: [...options.packageStyles] }]] : []),
    ...Object.entries(app)
  ])

  const rules = config.module?.rules ?? []

  return {
    ...config,
    mode: "development",
    // Relative paths in the config are from where its CLI runs: the project's folder.
    context: config.context ?? options.root,
    entry: entries,
    devtool: "cheap-module-source-map",
    devServer: undefined,
    output: {
      ...config.output,
      path: options.output,
      publicPath: options.publicPath,
      filename: "[name].js",
      chunkFilename: "[name].[contenthash:8].js",
      cssFilename: "[name].css",
      cssChunkFilename: "[name].[contenthash:8].css",
      uniqueName: options.key,
      crossOriginLoading: "anonymous",
      library: undefined,
      module: false,
      chunkFormat: "array-push",
      chunkLoading: "jsonp",
      // A page a few builds behind fetches each hot update in turn, so earlier builds' files stay.
      clean: false
    },
    optimization: {
      ...config.optimization,
      runtimeChunk: { name: guestFiles.runtime.replace(/\.js$/, "") },
      // The page loads the runtime and the entry, and nothing else up front.
      splitChunks: false,
      minimize: false,
      nodeEnv: false
    },
    module: {
      ...config.module,
      rules: [
        {
          test: new RegExp(`(?:${options.componentExtensions.map(escape).join("|")})$`),
          exclude: /[\\/]node_modules[\\/]/,
          enforce: "pre",
          loader: options.elementSources
        },
        {
          test: new RegExp(`^${escape(options.renderer.file)}$`),
          enforce: "pre",
          loader: options.renderer.loader
        },
        ...(extract ? rules.map((rule) => withExtraction(rule, extract.loader)) : rules).map((rule) =>
          babelFromRoot(rule, options.root)
        )
      ]
    },
    resolve: { ...config.resolve, alias: withAliases(config.resolve?.alias, options.dedupe) },
    plugins: [
      ...plugins,
      ...(extract ? [extract.plugin()] : []),
      ...(appPage ? [appPage] : []),
      bundler.hotModuleReplacement(),
      // React's production build: its development one keeps a stack for every element it makes, and its warnings are
      // for the app's own dev server to show. Fast Refresh's calls, compiled in by a loader set up for it, do nothing.
      bundler.define({
        "process.env.NODE_ENV": JSON.stringify("production"),
        $RefreshReg$: "(function () {})",
        $RefreshSig$: "(function () { return function (type) { return type } })"
      }),
      ...standInPlugins(bundler, options.standIns)
    ]
  }
}

/** A plugin's class name, which says what it is without importing the tool that made it. */
function className(plugin: BundlerPlugin): string {
  return plugin.constructor.name
}

function escape(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\/]/g, String.raw`\$&`)
}

/** The project's aliases with the builder's, written as the project writes them: by name, or as a list. */
function withAliases(
  aliases: NonNullable<BundlerConfig["resolve"]>["alias"],
  added: Readonly<Record<string, string>>
): NonNullable<BundlerConfig["resolve"]>["alias"] {
  if (Array.isArray(aliases)) {
    return [...aliases, ...Object.entries(added).map(([name, alias]) => ({ name, alias }))]
  }

  return { ...aliases, ...added }
}

/** Whether a loader is `style-loader`, by name or by its file. */
const styleLoader = /(?:^|[\\/])style-loader(?:[\\/]|$)/

/**
 * A rule with `style-loader`, which injects CSS into the page as the app runs, swapped for the loader that extracts it,
 * so the guest gets the CSS as text; nested rules (`oneOf`, `rules`) too. A rule written some other way is left as it
 * is.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- a project's rule, whatever its tool accepts, read here by `bundlerRule` and passed on
export function withExtraction(entry: unknown, loader: string): unknown {
  const rule = bundlerRule.safeParse(entry)

  if (!rule.success) {
    return entry
  }

  const { data } = rule
  const changed = { ...data }

  if (data.loader && styleLoader.test(data.loader)) {
    changed.loader = loader
  }

  if (data.use !== undefined) {
    changed.use = extractedUse(data.use, loader)
  }

  if (data.oneOf) {
    changed.oneOf = data.oneOf.map((inner) => withExtraction(inner, loader))
  }

  if (data.rules) {
    changed.rules = data.rules.map((inner) => withExtraction(inner, loader))
  }

  // oxlint-disable-next-line anti-slop/no-known-value-widening -- the rule as read, passed on as the project's tool takes it
  return changed
}

/** A rule's `use` with `style-loader` swapped for `loader`, however it's written; a function's loaders as it gives them. */
function extractedUse(use: z.output<typeof ruleUse>, loader: string): z.output<typeof ruleUse> {
  if (use instanceof Function) {
    return (info) => extractedUse(ruleUse.parse(use(info)), loader)
  }

  if (Array.isArray(use)) {
    return use.map((one) => extractedLoader(one, loader))
  }

  return extractedLoader(use, loader)
}

function extractedLoader(use: string | { loader?: string }, loader: string): string | { loader?: string } {
  const name = use instanceof Object ? use.loader : use

  return name && styleLoader.test(name) ? loader : use
}

/**
 * A replacement for each import whose specifier ends as one of the renderer's stand-ins do (`react/jsx-dev-runtime`),
 * by the module the renderer gives in its place, as a `data:` module so it imports what it needs from where the app
 * would find it.
 */
function standInPlugins(bundler: Bundler, standIns: Readonly<Record<string, string>>): BundlerPlugin[] {
  const ends = Object.keys(standIns)

  if (ends.length === 0) {
    return []
  }

  return [
    bundler.replaceModules(new RegExp(`(?:${ends.map(escape).join("|")})$`), (request) => {
      const source = developmentStandIn(request, standIns)

      return source === undefined ? undefined : `data:text/javascript,${encodeURIComponent(source)}`
    })
  ]
}

/** The module a renderer serves in place of a bare specifier its production build leaves empty, if it does. */
export function developmentStandIn(specifier: string, standIns: Readonly<Record<string, string>>): string | undefined {
  if (/^[./\0]/.test(specifier) || specifier.includes(":")) {
    return undefined
  }

  for (const [end, source] of Object.entries(standIns)) {
    if (specifier.endsWith(end) && specifier.length > end.length) {
      return source.replaceAll("$base", specifier.slice(0, -end.length))
    }
  }

  return undefined
}
